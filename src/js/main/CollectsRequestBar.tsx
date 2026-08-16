import { useEffect, useRef, useState } from "react";
import { evalTS, listenTS } from "../lib/utils/bolt";
import { path } from "../lib/cep/node";
import { loadOrBuildIndex, searchIndex, findAepFiles, findArchiveFiles, autoDetectCollectsRoot, type CollectsIndex, type IndexedFolder } from "../lib/collects/driveIndex";
import { hydrateWithProgress, copyFileWithProgress } from "../lib/collects/hydrate";
import { extractZipTo, cleanupUnusedExtractedFiles } from "../lib/collects/archive";
import { DEFAULT_COLLECTS_ROOT } from "../../shared/defaults";
import { IconButton } from "./IconButton";

import iconImport from "../assets/RRR/import.png";
import iconImportHover from "../assets/RRR/import_1.png";
import iconImportPressed from "../assets/RRR/import_2.png";
import iconCloudy from "../assets/RRR/cloudy.png";
import iconCloudyHover from "../assets/RRR/cloudy_1.png";
import iconCloudyPressed from "../assets/RRR/cloudy_2.png";
import iconDownload from "../assets/RRR/download.png";
import iconDownloadHover from "../assets/RRR/download_1.png";
import iconDownloadPressed from "../assets/RRR/download_2.png";

type IndexStatus = { phase: "loading" } | { phase: "ready"; count: number } | { phase: "error"; message: string };

type CompRow = {
  key: string;
  aepPath: string;
  projectFolderName: string;
  compName: string;
  lang: string;
  w: number;
  h: number;
  isNested: boolean;
  checked: boolean;
  // Папка, куда был распакован архив (только для архивных коллектов — для
  // голого .aep на Drive всегда null). После импорта именно в ней остаётся
  // весь лишний, неиспользуемый футаж — см. cleanupUnusedExtractedFiles.
  extractedRoot: string | null;
};

type ExpandState =
  | { phase: "idle" }
  | { phase: "hydrating"; percent: number; fileIndex: number; fileCount: number }
  | { phase: "extracting" }
  | { phase: "listing" }
  | { phase: "done" }
  | { phase: "error"; message: string };

// "cloud" — как сейчас: композиции запускаются прямо с Drive, ничего заранее
// не докачивается сверх самого .aep. "download" — перед сборкой мини-коллекта
// все файлы, использованные ИМЕННО выбранными композициями, докачиваются
// нашим кодом (с прогрессом), чтобы последующий Collect Files не зависел от
// скорости отдачи Drive. Выбор фиксируется на момент клика "Импорт" — на уже
// импортированное ранее не влияет, только на следующий импорт.
type ImportMode = "cloud" | "download";

const MAX_SHOWN_MATCHES = 30;

// Выше всего — вертикальные (1080x1920) из EN, потом остальные языки, потом
// вложенные (использующиеся как слой внутри другой композиции) — обычно
// нужны именно "не вложенные", но соглашение об именах не унифицировано
// между коллектами, так что ничего не скрываем, только сортируем.
function sortCompRows(rows: CompRow[]): CompRow[] {
  return rows.slice().sort((a, b) => {
    const aEn = a.lang === "EN" ? 0 : 1;
    const bEn = b.lang === "EN" ? 0 : 1;
    if (aEn !== bEn) return aEn - bEn;
    if (a.lang !== b.lang) return a.lang.localeCompare(b.lang);
    if (a.isNested !== b.isNested) return a.isNested ? 1 : -1;
    return a.compName.localeCompare(b.compName);
  });
}


export const CollectsRequestBar = ({ useIcons, children }: { useIcons: boolean; children?: React.ReactNode }) => {
  const [root, setRoot] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ phase: "loading" });
  const indexRef = useRef<CollectsIndex | null>(null);

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<IndexedFolder[]>([]);
  const [mode, setMode] = useState<ImportMode>("cloud");
  // Единая выпадающая панель (статус индекса, совпадения с чекбоксами,
  // история) — тот же принцип, что и у дропдауна EN: открывается по клику
  // на поле/стрелку, закрывается по клику вне неё.
  const [panelOpen, setPanelOpen] = useState(false);

  // Заглядываем внутрь .aep только по явному клику, максимум по одному
  // проекту за раз — никогда автоматически при наборе текста. Причина:
  // коллекты целиком лежат в облаке и не скачаны, а ExtendScript выполняет
  // вызовы строго по одному — случайный автозапуск на недокачанном файле
  // поставил бы в очередь и заблокировал все последующие обращения к AE
  // без какой-либо видимой ошибки.
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  // Папка, которой принадлежит expandedPath — нужна отдельно от самого пути,
  // чтобы строка истории могла заново развернуть тот же поиск (handleExpand
  // принимает IndexedFolder целиком, а не только путь).
  const [expandedFolder, setExpandedFolder] = useState<IndexedFolder | null>(null);
  const [expandState, setExpandState] = useState<ExpandState>({ phase: "idle" });
  const [compRows, setCompRows] = useState<CompRow[]>([]);
  const busyRef = useRef(false);

  const [importing, setImporting] = useState(false);
  const [importHovering, setImportHovering] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  // История результатов импорта — копится за всю сессию, свёрнута по
  // умолчанию (та же логика, что и с самим списком совпадений: не мешать
  // основному интерфейсу, но дать посмотреть при желании). Каждая запись
  // хранит папку, из которой был сделан импорт, — по клику на неё можно
  // заново открыть её результат поиска и импортировать что-то ещё из того
  // же коллекта, без повторного набора запроса.
  const [history, setHistory] = useState<Array<{ id: string; folder: IndexedFolder; lines: string[] }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Закрытие панели по клику вне неё — раньше это был невидимый
  // position:fixed backdrop поверх ВСЕГО экрана, который перехватывал самый
  // первый клик по тумблеру/кнопке "Импорт" (они лежат вне самой панели, но
  // визуально под ней же в общем ряду кнопок): клик закрывал панель, а не
  // доходил до кнопки, и импорт запускался только со второго клика. Слушатель
  // на document + проверка "клик внутри обёртки поля" не перехватывает клики
  // физически — кнопки получают событие как обычно, панель просто гасится тем
  // же кликом.
  const wrapRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!panelOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [panelOpen]);

  // Общая загрузка/пересборка индекса для конкретного пути — используется и
  // при монтировании, и при живом обновлении пути из гайда (см. ниже):
  // loadOrBuildIndex сам заметит, что сохранённый кэш относится к другому
  // root, и пересоберёт индекс с нуля.
  const loadIndexForRoot = async (rootPath: string) => {
    setRoot(rootPath);
    setIndexStatus({ phase: "loading" });
    try {
      const index = await loadOrBuildIndex(rootPath);
      indexRef.current = index;
      setIndexStatus({ phase: "ready", count: index.folders.length });
    } catch (e: any) {
      setIndexStatus({ phase: "error", message: e?.message || String(e) });
    }
  };

  useEffect(() => {
    (async () => {
      let savedRoot = await evalTS("getSavedCollectsRoot");
      if (!savedRoot) {
        // Буква диска Google Drive (G:, H: и т.д.) своя у каждого — сама
        // подпапка после неё одна на всю команду, поэтому сперва пробуем
        // найти её автоматически перебором букв, и только если не нашли —
        // спрашиваем пользователя (ничего не хардкодим принудительно).
        const detected = await autoDetectCollectsRoot();
        if (detected) {
          savedRoot = detected;
          evalTS("saveCollectsRoot", detected);
        } else {
          const entered = window.prompt("Укажите путь к папке коллектов на Shared Drive:", DEFAULT_COLLECTS_ROOT);
          if (!entered) {
            setIndexStatus({ phase: "error", message: "Путь к коллектам не задан." });
            return;
          }
          savedRoot = entered;
          evalTS("saveCollectsRoot", entered);
        }
      }
      await loadIndexForRoot(savedRoot);
    })();
  }, []);

  // Путь к коллектам можно поменять в окне гайда, пока основная панель уже
  // открыта — без этого события панель узнала бы о новом пути только после
  // полного закрытия и повторного открытия (см. GuideApp.tsx).
  useEffect(() => {
    listenTS("collectsRootChanged", (data) => {
      if (!data?.path) return;
      setQuery("");
      setMatches([]);
      setExpandedPath(null);
      setExpandedFolder(null);
      setCompRows([]);
      loadIndexForRoot(data.path);
    });
  }, []);

  // Только синхронный поиск по уже загруженному в память индексу — никакого
  // обращения к диску или AE на каждую нажатую клавишу.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setMatches(indexRef.current && value.trim() ? searchIndex(indexRef.current, value).slice(0, MAX_SHOWN_MATCHES) : []);
    setExpandedPath(null);
    setExpandState({ phase: "idle" });
    setCompRows([]);
  };

  const handleExpand = async (match: IndexedFolder) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setExpandedPath(match.path);
    setExpandedFolder(match);
    setCompRows([]);
    setExpandState({ phase: "hydrating", percent: 0, fileIndex: 0, fileCount: 0 });
    // Раньше любой сбой на любом из шагов ниже сводился к одному общему
    // catch — если пойманное значение не было полноценным Error (например,
    // отклонённый evalTS-промис нёс голую строку или значение null), в панели
    // просто показывалось "null" без единого намёка, на каком именно шаге
    // (распаковка? хидрация? сам evalTS?) что пошло не так. step() метит
    // каждый шаг явно, чтобы это больше не приходилось выяснять гаданием.
    const step = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e: any) {
        throw new Error(`[${label}] ${e?.message ?? String(e)}`);
      }
    };
    // null для голого .aep на Drive — там нечего чистить после импорта,
    // футаж остаётся ровно там, где лежал. Заполняется ниже, только если
    // коллект оказался архивом.
    let extractedRoot: string | null = null;
    try {
      // match.path бывает либо папкой креатива (внутри которой лежит .aep
      // или .zip), либо — если match.isArchiveFile — самим .zip-файлом без
      // обёрточной папки; тогда искать архив ВНУТРИ match.path бессмысленно
      // (readdir на файле упал бы с ENOTDIR) — он и есть искомый архив.
      let aepFiles: string[] = [];
      let archiveFiles: string[] = [];
      if (match.isArchiveFile) {
        archiveFiles = [match.path];
      } else {
        aepFiles = await step("findAepFiles", () => findAepFiles(match.path));
        if (aepFiles.length === 0) {
          archiveFiles = await step("findArchiveFiles", () => findArchiveFiles(match.path));
        }
      }

      // Некоторые коллекты лежат архивом, а не голым .aep — скачиваем архив
      // в папку текущего (открытого) проекта и распаковываем там же, потом
      // ищем .aep уже в распакованном.
      if (aepFiles.length === 0) {
        if (archiveFiles.length === 0) {
          setExpandState({ phase: "error", message: ".aep и архив не найдены внутри этой папки." });
          return;
        }
        const projectFolder = await step("getCurrentProjectFolder", () => evalTS("getCurrentProjectFolder"));
        if (!projectFolder) {
          setExpandState({ phase: "error", message: "Сохраните текущий проект перед импортом архивного коллекта — распаковывать некуда." });
          return;
        }
        const extractedAeps: string[] = [];
        for (let i = 0; i < archiveFiles.length; i++) {
          const archivePath = archiveFiles[i];
          setExpandState({ phase: "hydrating", percent: 0, fileIndex: i, fileCount: archiveFiles.length });
          await step("hydrateWithProgress:archive", () =>
            hydrateWithProgress(archivePath, (percent) => setExpandState({ phase: "hydrating", percent, fileIndex: i, fileCount: archiveFiles.length }))
          );

          setExpandState({ phase: "extracting" });
          const targetDir = path.join(projectFolder, match.name);
          await step("extractZipTo", () => extractZipTo(archivePath, targetDir));
          extractedRoot = targetDir;
          extractedAeps.push(...(await step("findAepFiles:extracted", () => findAepFiles(targetDir))));
        }
        if (extractedAeps.length === 0) {
          setExpandState({ phase: "error", message: ".aep не найден внутри распакованного архива." });
          return;
        }
        aepFiles = extractedAeps;
      }

      const collected: CompRow[] = [];
      for (let i = 0; i < aepFiles.length; i++) {
        const aepPath = aepFiles[i];
        setExpandState({ phase: "hydrating", percent: 0, fileIndex: i, fileCount: aepFiles.length });
        await step("hydrateWithProgress:aep", () =>
          hydrateWithProgress(aepPath, (percent) => setExpandState({ phase: "hydrating", percent, fileIndex: i, fileCount: aepFiles.length }))
        );

        setExpandState({ phase: "listing" });
        const result = await step("evalTS:listCollectVersions", () => evalTS("listCollectVersions", aepPath));
        if (!result.ok) {
          setExpandState({ phase: "error", message: "[listCollectVersions:ok=false] " + (result.message || "Не удалось прочитать коллект.") });
          return;
        }
        for (const c of result.compositions) {
          collected.push({
            key: aepPath + "|" + c.compName,
            aepPath,
            projectFolderName: match.name,
            compName: c.compName,
            lang: c.lang,
            w: c.w,
            h: c.h,
            isNested: c.isNested,
            checked: false,
            extractedRoot,
          });
        }
      }
      setCompRows(sortCompRows(collected));
      setExpandState(collected.length === 0 ? { phase: "error", message: "Композиций внутри коллекта не найдено." } : { phase: "done" });
    } catch (e: any) {
      console.error("handleExpand failed", e);
      setExpandState({ phase: "error", message: e?.message ?? String(e) });
    } finally {
      busyRef.current = false;
    }
  };

  const toggleChecked = (key: string) => {
    setCompRows((prev) => prev.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)));
  };

  const checkedRows = compRows.filter((r) => r.checked);

  const handleImport = async () => {
    if (busyRef.current || checkedRows.length === 0) return;
    busyRef.current = true;
    setImporting(true);
    // Захватываем режим и текст поиска на момент клика — дальнейшее
    // переключение тумблера/правка поля уже никак не повлияет на этот, уже
    // запущенный, импорт. Текст поиска используется как предлагаемое имя
    // файла, если проект придётся сохранять (вместо родового "Untitled
    // Project").
    const modeAtClick = mode;
    const folderAtClick = expandedFolder;
    const suggestedName = query.trim() || "Untitled Project";
    const log: string[] = [];
    const byAepPath = new Map<string, CompRow[]>();
    for (const row of checkedRows) {
      const list = byAepPath.get(row.aepPath) || [];
      list.push(row);
      byAepPath.set(row.aepPath, list);
    }
    // Для архивных коллектов — какие файлы внутри распакованной папки
    // РЕАЛЬНО остаются нужны живому проекту после этого импорта (см. ниже,
    // заполняется по-разному для "Облака"/"Скачивания"), чтобы после общего
    // цикла подчистить всё остальное содержимое этой папки одним проходом.
    const keepPathsByRoot = new Map<string, Set<string>>();
    for (const [aepPath, rows] of byAepPath) {
      const targets = rows.map((r) => ({ compName: r.compName, lang: r.lang }));
      try {
        const result = await evalTS("prepareCollectImport", aepPath, targets, "EN");
        if (!result.ok) {
          log.push(`${rows[0].projectFolderName} — ошибка: ${result.message || "не удалось импортировать"}`);
          continue;
        }
        log.push(`${rows[0].projectFolderName} — добавлено в проект: ${result.keptCompNames.join(", ")}`);

        const extractedRoot = rows[0].extractedRoot;
        let keepSet: Set<string> | null = null;
        if (extractedRoot) {
          keepSet = keepPathsByRoot.get(extractedRoot) || new Set<string>();
          keepPathsByRoot.set(extractedRoot, keepSet);
        }

        // "Скачивание" — не просто прочитать файл (это не гарантирует, что
        // он останется локальным копией, и уж точно не меняет путь, на
        // который ссылается сам футаж-итем в проекте). Копируем файл в
        // реальную папку рядом с текущим проектом и переподключаем футаж на
        // эту копию (relinkFootage) — только тогда Collect Files ниже будет
        // читать с локального диска, а не с Drive.
        if (modeAtClick === "download") {
          log.push(`${rows[0].projectFolderName} — режим "Скачивание": файлов найдено ${result.footagePaths.length}.`);
        }
        if (modeAtClick === "download" && result.footagePaths.length > 0) {
          const projectFolder = await evalTS("getCurrentProjectFolder");
          if (!projectFolder) {
            log.push(`${rows[0].projectFolderName} — скачивание пропущено: сохраните текущий проект, чтобы было куда класть файлы.`);
            // Копирования не было — живой проект по-прежнему ссылается на
            // исходные пути внутри распакованной папки, их и нужно сохранить.
            if (keepSet) for (const p of result.footagePaths) keepSet.add(p);
          } else {
            const destFolder = path.join(projectFolder, rows[0].projectFolderName);
            const usedNames = new Set<string>();
            let succeeded = 0;
            for (let i = 0; i < result.footagePaths.length; i++) {
              const srcPath = result.footagePaths[i];
              let baseName = path.basename(srcPath);
              while (usedNames.has(baseName)) baseName = "_" + baseName;
              usedNames.add(baseName);
              const destPath = path.join(destFolder, baseName);

              setDownloadStatus(`${rows[0].projectFolderName}: скачивание файлов (${i + 1}/${result.footagePaths.length})…`);
              try {
                await copyFileWithProgress(srcPath, destPath, (percent) =>
                  setDownloadStatus(`${rows[0].projectFolderName}: скачивание файлов (${i + 1}/${result.footagePaths.length}) — ${percent}%`)
                );
                const relinkResult = await evalTS("relinkFootage", srcPath, destPath);
                if (!relinkResult.ok) {
                  log.push(`${rows[0].projectFolderName} — не удалось переподключить ${baseName}: ${relinkResult.message}`);
                  // Переподключение не удалось — живой проект остался на
                  // старом пути, его и нельзя удалять при чистке.
                  if (keepSet) keepSet.add(srcPath);
                } else {
                  succeeded++;
                  // Переподключили на копию внутри той же папки — теперь
                  // нужна именно она, а не оригинал по вложенному пути.
                  if (keepSet) keepSet.add(destPath);
                }
              } catch (e: any) {
                log.push(`${rows[0].projectFolderName} — не удалось скачать ${baseName}: ${e?.message || String(e)}`);
                if (keepSet) keepSet.add(srcPath);
              }
            }
            log.push(`${rows[0].projectFolderName} — скачано и переподключено ${succeeded}/${result.footagePaths.length} файлов в ${destFolder}`);
          }
          setDownloadStatus(null);
        } else if (keepSet) {
          // "Облако": футаж как ссылался, так и продолжает ссылаться прямо
          // на файлы внутри распакованной папки — без изменений.
          for (const p of result.footagePaths) keepSet.add(p);
        }

        // Сборка мини-коллекта (Collect Files) — только в режиме "Скачивание".
        // В "Облаке" импортированная композиция просто остаётся ссылаться на
        // файлы на Drive, без дополнительной упаковки — ровно как было
        // задумано ("запускаем файлы с драйва как сейчас"). Пока выделены
        // именно эти комп'ы — следующая группа (другой .aep) в этом же цикле
        // снимет это выделение своим собственным импортом, так что откладывать
        // вызов на "после цикла" нельзя.
        if (modeAtClick === "download") {
          // Сохраняем ПЕРЕД Collect Files, если проект ещё не сохранён —
          // иначе эту же необходимость обнаружит сама команда Collect Files
          // и покажет диалог с родовым именем "Untitled Project", которое
          // скриптом уже не поправить. Сохраняя сами, подставляем как
          // предложенное имя то, что искали.
          try {
            const saveResult = await evalTS("saveCurrentProject", suggestedName);
            if (!saveResult.ok) log.push(`${rows[0].projectFolderName} — сохранение: ${saveResult.message}`);
          } catch (e: any) {
            log.push(`${rows[0].projectFolderName} — сохранение: ${e?.message || String(e)}`);
          }
          try {
            const collectResult = await evalTS("triggerCollectFilesDialog");
            if (!collectResult.ok) log.push(`${rows[0].projectFolderName} — Collect Files: ${collectResult.message}`);
          } catch (e: any) {
            log.push(`${rows[0].projectFolderName} — Collect Files: ${e?.message || String(e)}`);
          }
        } else {
          // "Облако": вместо сборки коллекта — просто фиксируем результат
          // импорта на диске.
          try {
            const saveResult = await evalTS("saveCurrentProject", suggestedName);
            if (!saveResult.ok) log.push(`${rows[0].projectFolderName} — сохранение: ${saveResult.message}`);
          } catch (e: any) {
            log.push(`${rows[0].projectFolderName} — сохранение: ${e?.message || String(e)}`);
          }
        }
      } catch (e: any) {
        log.push(`${rows[0].projectFolderName} — ошибка: ${e?.message || String(e)}`);
      }
    }

    // Чистка распакованных архивов — после ВСЕХ групп сразу (а не по ходу
    // цикла): если из одного архива импортировали несколько .aep, keepSet
    // для общей extractedRoot должен успеть накопить нужные пути от каждой
    // из них, прежде чем что-либо удалять.
    for (const [extractedRoot, keepSet] of keepPathsByRoot) {
      try {
        const { deletedFiles } = await cleanupUnusedExtractedFiles(extractedRoot, Array.from(keepSet));
        if (deletedFiles > 0) log.push(`Очищено ${deletedFiles} неиспользуемых файлов в ${extractedRoot}`);
      } catch (e: any) {
        log.push(`Не удалось очистить ${extractedRoot}: ${e?.message || String(e)}`);
      }
    }

    // Одна запись истории на весь клик "Импорт" (а не на каждую строку лога) —
    // так у неё есть единственная, однозначная папка-источник, по которой
    // можно заново открыть результат поиска этого же коллекта.
    if (folderAtClick) {
      setHistory((prev) => [{ id: `${Date.now()}_${Math.random()}`, folder: folderAtClick, lines: log }, ...prev]);
    }
    // Список версий сворачивается целиком после импорта (не только
    // отмеченные галочкой строки) — не нужно, чтобы он оставался открытым.
    setExpandedPath(null);
    setExpandedFolder(null);
    setCompRows([]);
    setImporting(false);
    busyRef.current = false;
  };

  // Общий блок "статус разбора + список композиций с чекбоксами" — рисуется
  // и под строкой совпадения в результатах поиска, и под строкой истории
  // (клик по истории заново открывает тот же поиск через handleExpand, так
  // что состояние expandedPath/compRows у них одно и то же).
  const renderExpandBlock = (folderPath: string) => {
    if (folderPath !== expandedPath) return null;
    return (
      <>
        {expandState.phase === "hydrating" && (
          <div className="rrr-collects-status">
            Скачивание{expandState.fileCount > 1 ? ` (${expandState.fileIndex + 1}/${expandState.fileCount})` : ""}: {expandState.percent}%
          </div>
        )}
        {expandState.phase === "extracting" && <div className="rrr-collects-status">Распаковка архива…</div>}
        {expandState.phase === "listing" && <div className="rrr-collects-status">Читаю композиции…</div>}
        {expandState.phase === "error" && <div className="rrr-collects-status rrr-collects-status--error">{expandState.message}</div>}

        {compRows.map((row) => (
          <label
            key={row.key}
            className="rrr-collects-result rrr-collects-result--version"
            title={row.aepPath}
            style={{ opacity: row.isNested ? 0.6 : 1 }}
          >
            <input type="checkbox" checked={row.checked} onChange={() => toggleChecked(row.key)} />
            {row.compName} — {row.lang} ({row.w}x{row.h})
          </label>
        ))}
      </>
    );
  };

  return (
    <>
      <span className="rrr-collects-input-wrap" ref={wrapRef}>
        <input
          className="rrr-collects-input"
          type="text"
          placeholder="Название задачи"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setPanelOpen(true)}
          disabled={indexStatus.phase !== "ready"}
        />
        <span className="rrr-collects-input-arrow" onClick={() => setPanelOpen((o) => !o)} />

        {panelOpen && (
            <div className="rrr-collects-panel">
              {indexStatus.phase === "loading" && <div className="rrr-collects-status">Индекс коллектов: сканирование…</div>}
              {indexStatus.phase === "error" && <div className="rrr-collects-status rrr-collects-status--error">{indexStatus.message}</div>}
              {indexStatus.phase === "ready" && root && (
                <div className="rrr-collects-status" title={root}>
                  Индекс готов ({indexStatus.count} папок)
                </div>
              )}

              {downloadStatus && <div className="rrr-collects-status">{downloadStatus}</div>}

              {matches.length > 0 && (
                <div className="rrr-collects-jobs">
                  {matches.map((m) => (
                    <div key={m.path}>
                      <div
                        className="rrr-collects-result"
                        title={m.path}
                        onClick={() => handleExpand(m)}
                        style={{ cursor: busyRef.current ? "default" : "pointer", fontWeight: m.path === expandedPath ? "bold" : "normal" }}
                      >
                        {m.name}
                      </div>

                      {renderExpandBlock(m.path)}
                    </div>
                  ))}
                </div>
              )}

              {history.length > 0 && (
                <div className="rrr-collects-history">
                  <div className="rrr-collects-status rrr-collects-history-toggle" onClick={() => setHistoryOpen((o) => !o)}>
                    {historyOpen ? "▾" : "▸"} История ({history.length})
                  </div>
                  {historyOpen && (
                    <div className="rrr-collects-jobs">
                      {history.map((h) => (
                        <div key={h.id}>
                          <div
                            className="rrr-collects-result"
                            title={h.folder.path}
                            onClick={() => handleExpand(h.folder)}
                            style={{ cursor: busyRef.current ? "default" : "pointer", fontWeight: h.folder.path === expandedPath ? "bold" : "normal" }}
                          >
                            {h.folder.name}
                          </div>
                          {h.lines.map((line, i) => (
                            <div key={i} className="rrr-collects-job">
                              {line}
                            </div>
                          ))}
                          {renderExpandBlock(h.folder.path)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
        )}
      </span>

      <IconButton
        base={mode === "cloud" ? iconCloudy : iconDownload}
        hover={mode === "cloud" ? iconCloudyHover : iconDownloadHover}
        pressed={mode === "cloud" ? iconCloudyPressed : iconDownloadPressed}
        label={mode === "cloud" ? "cloud" : "download"}
        useIcons={useIcons}
        title={
          mode === "cloud"
            ? "Облако: запуск композиций прямо с Drive.\nКлик — переключить на «Скачивание»."
            : 'Скачивание: файлы выбранных композиций качаются локально перед сборкой коллекта.\nКлик — переключить на «Облако».'
        }
        onClick={() => setMode(mode === "cloud" ? "download" : "cloud")}
      />

      {(() => {
        const importEnabled = !importing && checkedRows.length > 0;
        const importTitle = checkedRows.length > 0 ? `Импорт выбранных версий (${checkedRows.length})` : "Импорт";
        if (!useIcons) {
          return (
            <button className="rrr-std-btn" disabled={!importEnabled} title={importTitle} onClick={handleImport}>
              Импорт
            </button>
          );
        }
        // Не обычный base/hover/pressed по событиям мыши — тут "базовый" вид
        // зависит от того, открыта ли панель поиска: import (панель закрыта,
        // простой) / import_1 (панель открыта / идёт работа с поиском) /
        // import_2 (наведение ИЛИ нажатие — по просьбе визуально не
        // различаются). Кликабельность (disabled) — отдельно, от того, есть
        // ли что импортировать.
        const src = importHovering ? iconImportPressed : panelOpen ? iconImportHover : iconImport;
        return (
          <button
            className="rrr-icon-btn"
            disabled={!importEnabled}
            title={importTitle}
            onClick={handleImport}
            onMouseEnter={() => setImportHovering(true)}
            onMouseLeave={() => setImportHovering(false)}
            onMouseDown={() => setImportHovering(true)}
            onMouseUp={() => setImportHovering(true)}
          >
            <img src={src} alt="" />
          </button>
        );
      })()}

      {children}
    </>
  );
};
