import { csi } from "./bolt";
import { fs, os, path, child_process } from "../cep/node";
import { version as currentVersion } from "../../../shared/shared";

// Репозиторий на GitHub, откуда панель проверяет и качает обновления —
// собственный репозиторий RRR_3.0, не RRR-CEP (у неё своя история релизов).
const REPO = "pavelshvarko-creator/RRR_3.0";

// Включено: с этого релиза workflow (.github/workflows/main.yml) публикует
// в GitHub Release не только .zxp, но и обычный .zip от dist/cep — именно
// его ищет downloadAndInstallUpdate ниже, чтобы обновить уже установленную
// копию НА МЕСТЕ, без переустановки через .zxp. Тихая автопроверка при
// каждом запуске AE (main.tsx) работает без прав администратора — если
// расширение стоит в защищённой папке (Program Files), она молча не
// сработает, и тогда сработает уже кнопка "Обновить" в гайде (allowElevation
// = true, один системный запрос прав, как у любого установщика).
const UPDATES_ENABLED = true;

export type UpdateCheckResult = {
  hasUpdate: boolean;
  latestVersion: string;
  downloadUrl: string | null;
};

// Простое сравнение версий вида "2.0.1" по числовым сегментам.
function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map((n) => parseInt(n, 10) || 0);
  const currentParts = current.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < len; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

// Проверяет последний релиз на GitHub (публичный API, без токена) и сравнивает
// его версию (tag_name, например "v2.0.2") с версией текущей сборки панели.
export const checkForUpdate = async (): Promise<UpdateCheckResult> => {
  if (!UPDATES_ENABLED) {
    return { hasUpdate: false, latestVersion: currentVersion, downloadUrl: null };
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!res.ok) {
    throw new Error("Не удалось проверить обновления (GitHub API: " + res.status + ")");
  }
  const data = await res.json();
  const latestVersion = String(data.tag_name || "").replace(/^v/, "");
  const asset = (data.assets || []).find((a: any) => a.name && a.name.indexOf(".zip") === a.name.length - 4);

  return {
    hasUpdate: !!latestVersion && isNewerVersion(latestVersion, currentVersion),
    latestVersion,
    downloadUrl: asset ? asset.browser_download_url : null,
  };
};

// На части машин расширение установлено в защищённую системную папку
// (Program Files), и обычный (не-админский) процесс AE в принципе не может
// туда писать — это ограничение самой Windows, не временный сбой, поэтому
// повторные попытки внутри процесса не помогают. В этом случае запускаем
// один системный запрос прав администратора (как у любого установщика —
// пользователь просто нажимает "Да" в диалоге Windows) и копируем файлы
// уже с этими правами. Ничего вручную переустанавливать не нужно.
function elevateAndCopyDir(sourceDir: string, destDir: string): void {
  const scriptPath = path.join(os.tmpdir(), "rrr_elevated_update_" + Date.now() + ".ps1");
  const esc = (p: string) => p.replace(/'/g, "''");
  const psScript =
    "Copy-Item -Path '" + esc(sourceDir) + "\\*' -Destination '" + esc(destDir) + "' -Recurse -Force -ErrorAction Stop\n";
  fs.writeFileSync(scriptPath, psScript, "utf8");

  try {
    child_process.execSync(
      "powershell -NoProfile -Command \"Start-Process powershell -Verb RunAs -Wait -ArgumentList " +
        "'-NoProfile -ExecutionPolicy Bypass -File \\\"" + scriptPath + "\\\"'\"",
      { windowsHide: true }
    );
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (_) {}
  }
}

// Качает zip с собранными файлами расширения и распаковывает их поверх текущей
// установленной папки расширения (csi.getSystemPath("extension")) — без
// переустановки через .zxp. После этого нужен перезапуск AE, чтобы CEP
// перечитал обновлённые файлы.
export const downloadAndInstallUpdate = async (downloadUrl: string, allowElevation: boolean): Promise<void> => {
  const AdmZip = require("adm-zip");

  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error("Не удалось скачать обновление (" + res.status + ")");
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const extensionDir = csi.getSystemPath("extension");
  const tmpZipPath = path.join(os.tmpdir(), "rrr_update_" + Date.now() + ".zip");
  // Сначала распаковываем во временную папку (туда запись всегда разрешена),
  // а уже оттуда копируем в extensionDir — так staging не зависит от прав
  // доступа к целевой папке и его можно целиком переиспользовать для
  // повышенного (elevated) копирования, если обычная запись не пройдёт.
  const stagingDir = path.join(os.tmpdir(), "rrr_update_staging_" + Date.now());
  fs.writeFileSync(tmpZipPath, buffer);

  try {
    const zip = new AdmZip(tmpZipPath);
    // Файлы записываем сами (fs.writeFileSync), а не через zip.extractAllTo —
    // та дополнительно делает chmod на каждый файл, что в защищённых папках
    // не нужно и только добавляет лишнюю точку отказа.
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const targetPath = path.join(stagingDir, entry.entryName);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, entry.getData());
    }

    // Копируем staging -> extensionDir обычным способом. Некоторые файлы
    // (например бандл уже открытого окна гайда) в момент обновления могут
    // быть кратковременно заняты — даём несколько попыток с паузой.
    const failedEntries: string[] = [];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const srcPath = path.join(stagingDir, entry.entryName);
      const targetPath = path.join(extensionDir, entry.entryName);

      let written = false;
      for (let attempt = 0; attempt < 3 && !written; attempt++) {
        try {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.copyFileSync(srcPath, targetPath);
          written = true;
        } catch (e) {
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
      if (!written) failedEntries.push(entry.entryName);
    }

    // Если часть файлов не записалась обычным способом — почти всегда это
    // означает, что папка расширения защищена от записи без прав
    // администратора. Системный запрос прав (UAC) показываем только когда
    // это явно разрешено (клик по кнопке "Обновить") — тихая автопроверка
    // при каждом открытии панели НЕ должна неожиданно всплывать с диалогом
    // Windows, поэтому там allowElevation=false и ошибка просто уходит выше.
    if (failedEntries.length > 0) {
      if (!allowElevation) {
        throw new Error("Не удалось обновить файлы: " + failedEntries.join(", "));
      }
      try {
        elevateAndCopyDir(stagingDir, extensionDir);
      } catch (elevateErr: any) {
        throw new Error(
          "Не удалось обновить файлы даже с правами администратора: " + failedEntries.join(", ")
        );
      }
    }
  } finally {
    try { fs.unlinkSync(tmpZipPath); } catch (_) {}
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) {}
  }
};

// Проверяет и, если есть более новая версия, сразу скачивает и устанавливает
// её — используется для тихой автопроверки при каждом запуске AE (см.
// main.tsx). Ошибки самой проверки (например нет интернета) не выбрасываются
// наружу, чтобы не мешать открытию панели — вызывающий код сам решает, что
// показать пользователю по результату.
export const checkAndAutoInstallUpdate = async (allowElevation: boolean): Promise<{ installed: boolean; version?: string }> => {
  const result = await checkForUpdate();
  if (!result.hasUpdate || !result.downloadUrl) return { installed: false };
  await downloadAndInstallUpdate(result.downloadUrl, allowElevation);
  return { installed: true, version: result.latestVersion };
};
