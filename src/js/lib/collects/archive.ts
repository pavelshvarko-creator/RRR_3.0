import { fs } from "../cep/node";

// adm-zip — уже используемая в update.ts зависимость (installModules в
// cep.config.ts), require() напрямую как там, а не через node.ts — это не
// встроенный Node-модуль.
export async function extractZipTo(zipPath: string, targetDir: string): Promise<void> {
  const AdmZip = require("adm-zip");
  await fs.promises.mkdir(targetDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(targetDir, true);
}
