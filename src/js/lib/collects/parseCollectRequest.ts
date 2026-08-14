import { LANG_CODES } from "../../../shared/langCodes";

export type ParsedCollectRequest = {
  projectName: string;
  versions: number[];
  resolution: { w: number; h: number };
  language: string;
};

export type ParseResult =
  | { ok: true; value: ParsedCollectRequest }
  | { ok: false; error: string };

const RESOLUTION_W = 1080;
const RESOLUTION_H = 1920;

// Требуем цифру сразу после "_V" — иначе "_video" (тоже начинается на "_v")
// матчился бы первым. После первой цифры разрешаем что угодно до следующего
// "_" — это может быть валидный список версий ("1,2,3") или мусор ("1,x,3"),
// который дальше проверяется и явно отклоняется вручную, а не тихо режется
// регуляркой по первому непонятному символу.
const VERSION_TOKEN = /_[Vv](\d[^_]*)/;
const RESOLUTION_TOKEN = /(\d{3,4})x(\d{3,4})/;

export function parseCollectRequest(input: string): ParseResult {
  const trimmed = input.trim().replace(/\.aep$/i, "");
  if (!trimmed) {
    return { ok: false, error: "Введите название креатива." };
  }

  const versionMatch = trimmed.match(VERSION_TOKEN);
  if (!versionMatch) {
    return { ok: false, error: 'Не найдена версия (например "_V1" или "_V1,2,3").' };
  }

  const versionTokens = versionMatch[1].split(",").map((t) => t.trim());
  const versions: number[] = [];
  for (const token of versionTokens) {
    const n = parseInt(token, 10);
    if (isNaN(n) || String(n) !== token) {
      return { ok: false, error: `Некорректный номер версии: "${token}".` };
    }
    if (versions.indexOf(n) === -1) versions.push(n);
  }
  versions.sort((a, b) => a - b);

  const projectName = trimmed
    .slice(0, versionMatch.index)
    .replace(/_video$/i, "")
    .replace(/_+$/, "");
  if (!projectName) {
    return { ok: false, error: "Не удалось определить название проекта." };
  }

  const rest = trimmed.slice((versionMatch.index ?? 0) + versionMatch[0].length);

  let resolution = { w: RESOLUTION_W, h: RESOLUTION_H };
  const resMatch = rest.match(RESOLUTION_TOKEN);
  if (resMatch) {
    const w = parseInt(resMatch[1], 10);
    const h = parseInt(resMatch[2], 10);
    if (w !== RESOLUTION_W || h !== RESOLUTION_H) {
      return {
        ok: false,
        error: `Поддерживается только разрешение ${RESOLUTION_W}x${RESOLUTION_H} (найдено ${w}x${h}).`,
      };
    }
    resolution = { w, h };
  }

  let language = "EN";
  const restTokens = rest.split("_").map((t) => t.trim().toUpperCase()).filter(Boolean);
  for (const token of restTokens) {
    if (LANG_CODES.indexOf(token) !== -1) {
      language = token;
      break;
    }
  }

  return { ok: true, value: { projectName, versions, resolution, language } };
}
