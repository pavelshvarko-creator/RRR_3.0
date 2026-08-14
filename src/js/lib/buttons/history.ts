import { fs, path, buffer } from "../cep/node";
import type { ButtonHistoryEntry } from "../../../shared/customButtons";

// История хранится не одним общим JSON-файлом, а отдельным файлом на КАЖДУЮ
// добавленную кнопку внутри одной папки на Google Drive. Публикация новой
// кнопки — это просто создание ещё одного файла, никогда не трогающее уже
// существующие: два человека, публикующих кнопку одновременно, пишут в два
// разных файла и не могут затереть друг друга (в отличие от read-modify-write
// одного общего файла). Если какой-то файл окажется битым — она теряет ровно
// эту одну запись, а не всю историю, накопленную остальными. Это то, что
// должно переживать любые обновления самого расширения: сама история живёт
// на Drive, а не в настройках/файлах расширения, так что переустановка или
// обновление RRR_3.0 её не затрагивает вообще.
const WRITE_CHUNK_SIZE = 64 * 1024;
const FILE_PREFIX = "button_";
const FILE_SUFFIX = ".json";
const TEMP_INFIX = ".tmp-";

// fs.promises.writeFile пишет весь буфер одним write()-вызовом — как только
// в записи есть иконка (base64 PNG), JSON вырастает до десятков КБ, и такая
// одна большая запись на виртуальный диск Google Drive валится с "EINVAL:
// invalid argument, write" (без иконки JSON маленький и пишется нормально).
// Пишем небольшими кусками через поток — каждый .write() стрима укладывается
// в отдельный системный вызов меньшего размера, который драйвер Google Drive
// уже переваривает.
async function writeFileChunked(filePath: string, data: string): Promise<void> {
  const buf = buffer.Buffer.from(data, "utf8");
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    ws.on("error", reject);
    ws.on("finish", resolve);
    for (let offset = 0; offset < buf.length; offset += WRITE_CHUNK_SIZE) {
      ws.write(buf.subarray(offset, offset + WRITE_CHUNK_SIZE));
    }
    ws.end();
  });
}

// Раньше настройка указывала на конкретный JSON-файл — если она у кого-то
// ещё осталась такой (файл, а не папка), явно говорим об этом вместо
// невнятного ENOTDIR/EEXIST из недр fs.
function explainIfPathIsFile(e: any, folderPath: string): never {
  if (e?.code === "ENOTDIR" || e?.code === "EEXIST") {
    throw new Error(
      `"${folderPath}" — это файл, а не папка. Укажите путь к папке для истории кнопок (например, создайте новую пустую папку на Drive и укажите её).`
    );
  }
  throw e;
}

export async function loadButtonHistory(folderPath: string): Promise<ButtonHistoryEntry[]> {
  let names: string[];
  try {
    names = await fs.promises.readdir(folderPath);
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    return explainIfPathIsFile(e, folderPath);
  }

  const entries: ButtonHistoryEntry[] = [];
  for (const name of names) {
    if (!name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_SUFFIX) || name.indexOf(TEMP_INFIX) !== -1) continue;
    try {
      const raw = await fs.promises.readFile(path.join(folderPath, name), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && typeof parsed.id === "string") entries.push(parsed);
    } catch (_) {
      // Один битый/недочитанный файл не должен ронять всю историю — просто
      // пропускаем его, остальные записи остаются видны.
    }
  }
  entries.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return entries;
}

// Каждая публикация — новый файл, имя которого уже гарантированно уникально
// (entry.id — timestamp+random из main.tsx), так что перезаписать чужую
// запись невозможно даже случайно. Пишем во временный файл и переименовываем
// поверх финального имени — если запись оборвётся посередине, соседние файлы
// (чужие кнопки) это не заденет, а собственный файл не окажется битым
// наполовину.
export async function publishButtonToHistory(folderPath: string, entry: ButtonHistoryEntry): Promise<void> {
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
  } catch (e: any) {
    explainIfPathIsFile(e, folderPath);
  }
  const fileName = `${FILE_PREFIX}${entry.addedAt}_${entry.id}${FILE_SUFFIX}`;
  const finalPath = path.join(folderPath, fileName);
  const tempPath = path.join(folderPath, `${TEMP_INFIX}${fileName}`);
  await writeFileChunked(tempPath, JSON.stringify(entry));
  await fs.promises.rename(tempPath, finalPath);
}
