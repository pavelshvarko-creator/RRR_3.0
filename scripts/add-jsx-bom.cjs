// ExtendScript на части локалей Windows читает .jsx-файлы без UTF-8 BOM в
// системной кодовой странице вместо UTF-8 — из-за этого файл с кириллицей
// (комментарии, тексты алертов) падает с "SyntaxError: Character conversion
// error" на некоторых машинах, хотя на других всё нормально. BOM в начале
// файла явно говорит ExtendScript, что это UTF-8, и снимает вопрос
// независимо от локали конкретного компьютера.
const fs = require("fs");
const path = require("path");

const jsxPath = path.join(__dirname, "..", "dist", "cep", "jsx", "index.js");

if (!fs.existsSync(jsxPath)) {
  console.error("add-jsx-bom: " + jsxPath + " не найден — пропускаю.");
  process.exit(0);
}

const buffer = fs.readFileSync(jsxPath);
const bom = Buffer.from([0xef, 0xbb, 0xbf]);
const alreadyHasBom = buffer.slice(0, 3).equals(bom);

if (alreadyHasBom) {
  console.log("add-jsx-bom: BOM уже есть, ничего не делаю.");
} else {
  fs.writeFileSync(jsxPath, Buffer.concat([bom, buffer]));
  console.log("add-jsx-bom: BOM добавлен в " + jsxPath);
}
