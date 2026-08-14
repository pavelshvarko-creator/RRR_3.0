import { fs, path, os } from "../cep/node";

export type IndexedFolder = {
  name: string;
  path: string;
  depth: number;
};

export type CollectsIndex = {
  builtAt: number;
  root: string;
  folders: IndexedFolder[];
};

const CACHE_PATH = path.join(os.homedir(), "AppData", "Roaming", "RRR_3.0-Collects", "index.json");

// Индексируем только до уровня папок-проектов (root -> папка приложения ->
// папка креатива) — глубже там уже футажи/ассеты, которые для поиска по
// названию не нужны и только замедлили бы скан.
const MAX_DEPTH = 2;
const MAX_FOLDERS = 50000;

async function walk(dir: string, depth: number, out: IndexedFolder[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FOLDERS) return;
  let entries: any[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "$RECYCLE.BIN" || entry.name.indexOf(".") === 0) continue;
    const fullPath = path.join(dir, entry.name);
    out.push({ name: entry.name, path: fullPath, depth });
    if (out.length >= MAX_FOLDERS) return;
    await walk(fullPath, depth + 1, out);
  }
}

export async function buildIndex(root: string): Promise<CollectsIndex> {
  const folders: IndexedFolder[] = [];
  await walk(root, 1, folders);
  const index: CollectsIndex = { builtAt: Date.now(), root, folders };
  try {
    await fs.promises.mkdir(path.dirname(CACHE_PATH), { recursive: true });
    await fs.promises.writeFile(CACHE_PATH, JSON.stringify(index), "utf8");
  } catch (_) {
    // Кэш — это только ускорение; если запись не удалась, просто продолжаем
    // с тем, что уже посчитали в памяти.
  }
  return index;
}

export async function loadCachedIndex(root: string, maxAgeMs: number): Promise<CollectsIndex | null> {
  try {
    const raw = await fs.promises.readFile(CACHE_PATH, "utf8");
    const cached: CollectsIndex = JSON.parse(raw);
    if (cached.root !== root) return null;
    if (Date.now() - cached.builtAt > maxAgeMs) return null;
    return cached;
  } catch (_) {
    return null;
  }
}

export async function loadOrBuildIndex(root: string, maxAgeMs = 60 * 60 * 1000): Promise<CollectsIndex> {
  const cached = await loadCachedIndex(root, maxAgeMs);
  if (cached) return cached;
  return buildIndex(root);
}

// Папки коллектов называются по проекту без версии ("...PromoBlue folder"),
// версия — это уже часть имени композиции внутри .aep. Пользователь обычно
// печатает название вместе с версией по привычке ("..._V1") — без этой
// отсечки такой ввод не находил бы вообще ничего.
function stripTrailingVersionToken(text: string): string {
  return text.replace(/_[Vv]\d[^_]*$/, "");
}

export function searchIndex(index: CollectsIndex, query: string): IndexedFolder[] {
  const q = stripTrailingVersionToken(query.trim()).toLowerCase();
  if (!q) return [];
  return index.folders
    .filter((f) => f.depth === 2 && f.name.toLowerCase().indexOf(q) !== -1)
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      const bStarts = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });
}

// Точечный, ограниченный по глубине поиск файлов по расширению ВНУТРИ уже
// найденной папки креатива — в отличие от buildIndex, тут можно позволить
// себе спуститься глубже, т.к. область поиска уже сужена до одной папки,
// а не всего диска.
async function findFilesByExt(folderPath: string, extPattern: RegExp, maxDepth: number): Promise<string[]> {
  const results: string[] = [];
  async function walkFiles(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: any[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkFiles(fullPath, depth + 1);
      } else if (entry.isFile() && extPattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  await walkFiles(folderPath, 0);
  return results;
}

export async function findAepFiles(folderPath: string, maxDepth = 3): Promise<string[]> {
  return findFilesByExt(folderPath, /\.aep$/i, maxDepth);
}

// Некоторые коллекты лежат на Drive не голым .aep, а архивом — их нужно
// сначала скачать и распаковать (см. archive.ts), прежде чем искать .aep
// внутри распакованного.
export async function findArchiveFiles(folderPath: string, maxDepth = 3): Promise<string[]> {
  return findFilesByExt(folderPath, /\.zip$/i, maxDepth);
}
