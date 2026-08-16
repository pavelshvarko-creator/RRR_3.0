import { fs, path, os } from "../cep/node";
import { DEFAULT_COLLECTS_ROOT } from "../../../shared/defaults";
import { autoDetectSharedPath } from "../utils/autoDetectSharedPath";

export type IndexedFolder = {
  name: string;
  path: string;
  depth: number;
  // true — сама запись это .zip-файл (коллект лежит архивом прямо внутри
  // папки-категории, без своей обёрточной папки), false — обычная папка.
  isArchiveFile: boolean;
};

export type CollectsIndex = {
  builtAt: number;
  root: string;
  folders: IndexedFolder[];
  schemaVersion: number;
};

const CACHE_PATH = path.join(os.homedir(), "AppData", "Roaming", "RRR_3.0-Collects", "index.json");

// Бампается при изменении того, ЧТО индексируется (не только формата
// хранения) — например, когда индексатор научился видеть голые .zip-файлы,
// которых раньше не было в индексе вообще. Без этой отсечки уже собранный
// кэш (валиден до часа, см. loadOrBuildIndex) продолжал бы молча отдавать
// старые, неполные результаты вплоть до истечения TTL даже после обновления
// самого расширения.
const INDEX_SCHEMA_VERSION = 2;

// Индексируем только до уровня папок-проектов (root -> папка приложения ->
// папка креатива) — глубже там уже футажи/ассеты, которые для поиска по
// названию не нужны и только замедлили бы скан.
const MAX_DEPTH = 2;
const MAX_FOLDERS = 50000;

function shouldSkipDirEntry(name: string): boolean {
  return name === "$RECYCLE.BIN" || name.indexOf(".") === 0;
}

// Некоторые коллекты — не папка с архивом внутри, а голый .zip-файл прямо
// внутри папки-категории (например ".../MyScreen/26.03_MyScreen_Aquariums.zip",
// без какой-либо обёрточной подпапки). Раньше индексатор рассматривал только
// директории (`!entry.isDirectory() => continue`), из-за чего такие коллекты
// не попадали в индекс вообще ни на какой глубине — искать их было
// невозможно, даже с полностью готовым индексом.
async function indexEntries(dir: string, entries: any[], depth: number, out: IndexedFolder[]): Promise<void> {
  for (const entry of entries) {
    if (out.length >= MAX_FOLDERS) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirEntry(entry.name)) continue;
      out.push({ name: entry.name, path: fullPath, depth, isArchiveFile: false });
      await walk(fullPath, depth + 1, out);
    } else if (entry.isFile() && /\.zip$/i.test(entry.name)) {
      out.push({ name: entry.name.replace(/\.zip$/i, ""), path: fullPath, depth, isArchiveFile: true });
    }
  }
}

async function walk(dir: string, depth: number, out: IndexedFolder[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FOLDERS) return;
  let entries: any[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  await indexEntries(dir, entries, depth, out);
}

export async function buildIndex(root: string): Promise<CollectsIndex> {
  // Ошибку чтения самой корневой папки НЕ проглатываем (в отличие от
  // вложенных подпапок в walk() — там один нечитаемый креатив не должен
  // ронять весь индекс). Раньше любой сбой здесь (нет доступа, Google Drive
  // ещё не отдал список содержимого папки и т.п.) тихо превращался в "0
  // папок", неотличимое от "путь и правда пустой".
  let rootEntries: any[];
  try {
    rootEntries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch (e: any) {
    throw new Error(`Не удалось прочитать папку коллектов "${root}": ${e?.message || String(e)}`);
  }

  const folders: IndexedFolder[] = [];
  await indexEntries(root, rootEntries, 1, folders);

  const index: CollectsIndex = { builtAt: Date.now(), root, folders, schemaVersion: INDEX_SCHEMA_VERSION };
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
    if (cached.schemaVersion !== INDEX_SCHEMA_VERSION) return null;
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

export async function autoDetectCollectsRoot(): Promise<string | null> {
  return autoDetectSharedPath(DEFAULT_COLLECTS_ROOT);
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
  // Обычно папка креатива лежит на втором уровне (root -> категория ->
  // креатив), но архивные коллекты иногда лежат прямо в корне (depth 1) —
  // ограничение только depth===2 делало такие коллекты ненаходимыми поиском
  // при полностью готовом индексе.
  return index.folders
    .filter((f) => f.name.toLowerCase().indexOf(q) !== -1)
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
