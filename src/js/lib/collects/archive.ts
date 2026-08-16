import { fs, path, child_process } from "../cep/node";

// adm-zip грузит весь файл разом через fs.readFileSync — для архивов больше
// 2 ГБ это падает с "File size (...) is greater than 2 GB" (встроенное
// ограничение самого Node.js на readFile/readFileSync, а не баг adm-zip), а
// архивные коллекты регулярно крупнее. Windows начиная с 10 (1803+) несёт
// встроенный bsdtar (System32\tar.exe), который распаковывает .zip потоково,
// без такого ограничения — используем его как основной путь, adm-zip как
// запасной на случай, если tar.exe почему-то недоступен (для файлов ≤2 ГБ
// ограничение роли не играет).
const SYSTEM32_TAR_PATH = path.join(process.env.WINDIR || process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");

function extractWithTar(zipPath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child_process.execFile(SYSTEM32_TAR_PATH, ["-xf", zipPath, "-C", targetDir], { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function extractZipTo(zipPath: string, targetDir: string): Promise<void> {
  await fs.promises.mkdir(targetDir, { recursive: true });
  try {
    await extractWithTar(zipPath, targetDir);
  } catch (_) {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);
  }
}

// После импорта нужных композиций из архивного коллекта распакованная папка
// содержит куда больше, чем реально используется: другие версии/языки,
// исходники, футаж невыбранных композиций. Удаляем всё внутри root, кроме
// путей из keepPaths (реально используемый живым проектом футаж), и следом
// подчищаем опустевшие подпапки — саму root-папку не трогаем (её продолжает
// использовать текущий, открытый проект).
//
// Сравнение регистронезависимое (toLowerCase) — Windows не различает
// регистр в путях, а ExtendScript (File.fsName) и Node (fs/path) в редких
// случаях могут отдать один и тот же путь в разном регистре. Здесь это не
// косметика: при регистрозависимом сравнении файл, который на самом деле
// нужно оставить, мог бы ошибочно попасть под удаление.
export async function cleanupUnusedExtractedFiles(root: string, keepPaths: string[]): Promise<{ deletedFiles: number }> {
  const keepSet = new Set(keepPaths.map((p) => p.toLowerCase()));
  let deletedFiles = 0;

  async function walk(dir: string): Promise<boolean> {
    let entries: any[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (_) {
      return false;
    }
    let dirIsEmpty = true;
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const childEmpty = await walk(fullPath);
        if (childEmpty) {
          try {
            await fs.promises.rmdir(fullPath);
          } catch (_) {
            dirIsEmpty = false;
          }
        } else {
          dirIsEmpty = false;
        }
        continue;
      }
      if (keepSet.has(fullPath.toLowerCase())) {
        dirIsEmpty = false;
        continue;
      }
      try {
        await fs.promises.unlink(fullPath);
        deletedFiles++;
      } catch (_) {
        dirIsEmpty = false;
      }
    }
    return dirIsEmpty;
  }

  await walk(root);
  return { deletedFiles };
}
