import { fs, path } from "../cep/node";

const STALL_MS = 60000;
const STALL_CHECK_INTERVAL_MS = 5000;

// Файл на Shared Drive может быть облачным плейсхолдером (реально не
// скачан). Чтение через createReadStream прозрачно триггерит у Google Drive
// докачку реальных байт — прогресс считаем по факту прочитанного относительно
// размера файла (тот у плейсхолдера уже известен точно, докачка не нужна
// только чтобы узнать size).
export async function hydrateWithProgress(filePath: string, onProgress: (percent: number) => void): Promise<void> {
  const stat = await fs.promises.stat(filePath);
  const total = stat.size;
  if (total === 0) {
    onProgress(100);
    return;
  }

  return new Promise((resolve, reject) => {
    let read = 0;
    let lastPct = -1;
    let lastDataAt = Date.now();

    const rs = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });

    const stallTimer = setInterval(() => {
      if (Date.now() - lastDataAt > STALL_MS) {
        clearInterval(stallTimer);
        rs.destroy();
        reject(new Error("Скачивание зависло — нет данных больше 60 секунд."));
      }
    }, STALL_CHECK_INTERVAL_MS);

    rs.on("data", (chunk: Buffer) => {
      read += chunk.length;
      lastDataAt = Date.now();
      const pct = Math.min(100, Math.floor((read / total) * 100));
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress(pct);
      }
    });
    rs.on("end", () => {
      clearInterval(stallTimer);
      onProgress(100);
      resolve();
    });
    rs.on("error", (err: Error) => {
      clearInterval(stallTimer);
      reject(err);
    });
  });
}

// hydrateWithProgress выше только ЧИТАЕТ поток (это годилось для просмотра
// версий — данные были не нужны, важен был сам факт скачивания у Drive).
// Для режима "Скачивание" этого недостаточно: нужна реальная независимая
// копия файла на диске рядом с текущим проектом — читаем и одновременно
// пишем в целевой путь, прогресс — по факту прочитанных/записанных байт.
export async function copyFileWithProgress(
  srcPath: string,
  destPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const stat = await fs.promises.stat(srcPath);
  const total = stat.size;
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  if (total === 0) {
    await fs.promises.writeFile(destPath, Buffer.alloc(0));
    onProgress(100);
    return;
  }

  return new Promise((resolve, reject) => {
    let read = 0;
    let lastPct = -1;
    let lastDataAt = Date.now();

    const rs = fs.createReadStream(srcPath, { highWaterMark: 4 * 1024 * 1024 });
    const ws = fs.createWriteStream(destPath);

    const stallTimer = setInterval(() => {
      if (Date.now() - lastDataAt > STALL_MS) {
        clearInterval(stallTimer);
        rs.destroy();
        ws.destroy();
        reject(new Error("Скачивание зависло — нет данных больше 60 секунд."));
      }
    }, STALL_CHECK_INTERVAL_MS);

    rs.on("data", (chunk: Buffer) => {
      read += chunk.length;
      lastDataAt = Date.now();
      const pct = Math.min(100, Math.floor((read / total) * 100));
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress(pct);
      }
    });
    rs.on("error", (err: Error) => {
      clearInterval(stallTimer);
      ws.destroy();
      reject(err);
    });
    ws.on("error", (err: Error) => {
      clearInterval(stallTimer);
      rs.destroy();
      reject(err);
    });
    ws.on("finish", () => {
      clearInterval(stallTimer);
      onProgress(100);
      resolve();
    });

    rs.pipe(ws);
  });
}
