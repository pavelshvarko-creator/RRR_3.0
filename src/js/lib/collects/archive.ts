import { fs, path } from "../cep/node";

// adm-zip — уже используемая в update.ts зависимость (installModules в
// cep.config.ts), require() напрямую как там, а не встроенный Node-модуль.
export async function extractZipTo(zipPath: string, targetDir: string): Promise<void> {
  const AdmZip = require("adm-zip");
  await fs.promises.mkdir(targetDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
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
