import { fs } from "../cep/node";

// Google Drive Desktop монтирует Shared Drive на свою букву диска у каждого
// пользователя (G:, H: и т.д.) — а путь ПОСЛЕ буквы (папка "Общие диски" +
// название самого шаред-драйва, плюс любая вложенная подпапка) одинаковый
// для всей команды. Вместо того чтобы заставлять человека вручную поправлять
// букву диска на новой машине, перебираем все буквы параллельно и берём
// первую, где путь (без буквы, взятой из defaultPath) реально существует.
// Используется и для коллектов, и для папки истории кнопок — обе сейчас
// лежат на одном и том же Shared Drive, но эта функция ничего об этом не
// предполагает, просто ищет "буква:\<то, что после буквы у дефолта>".
export async function autoDetectSharedPath(defaultPath: string): Promise<string | null> {
  const relative = defaultPath.replace(/^[A-Za-z]:\\/, "");
  const letters: string[] = [];
  for (let code = 67; code <= 90; code++) letters.push(String.fromCharCode(code));

  const checks = await Promise.allSettled(
    letters.map(async (letter) => {
      const candidate = `${letter}:\\${relative}`;
      const stat = await fs.promises.stat(candidate);
      if (!stat.isDirectory()) throw new Error("not a directory");
      return candidate;
    })
  );
  for (const result of checks) {
    if (result.status === "fulfilled") return result.value;
  }
  return null;
}
