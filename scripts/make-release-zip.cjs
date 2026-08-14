// Собирает dist/release/RRR_<version>.zip из уже собранного dist/cep —
// это тот самый файл, который нужно прикладывать к GitHub Release, чтобы
// панель могла скачать и распаковать его через кнопку "Обновить" в гайде.
// Запускать после `yarn build`: `node scripts/make-release-zip.js`.
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { version } = require("../package.json");

const distCep = path.join(__dirname, "..", "dist", "cep");
const releaseDir = path.join(__dirname, "..", "dist", "release");
const zipPath = path.join(releaseDir, `RRR_${version}.zip`);

if (!fs.existsSync(distCep)) {
  console.error("dist/cep не найден — сначала запустите `yarn build`.");
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });

const zip = new AdmZip();
// .debug — CEP-файл для локальной отладки (включает debug-порт), в релиз
// попадать не должен: у тестировщиков он лежит в защищённой папке Program
// Files, и попытка перезаписать/chmod'нуть его при автообновлении падает
// с EPERM, обрывая всю распаковку.
zip.addLocalFolder(distCep, "", (entryPath) => entryPath !== ".debug");
zip.writeZip(zipPath);

console.log("Создан " + zipPath);
