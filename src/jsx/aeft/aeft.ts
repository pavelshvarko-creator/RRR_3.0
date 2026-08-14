// ====================== СОРТИРОВКА ПРОЕКТА ДЛЯ COLLECT ======================
// Создаёт иерархию Assets/{Audios,Comps,Images,layers,Videos} + <LANG>/<WxH>
// и раскладывает элементы. Родительские (выделенные) композиции -> <LANG>/<WxH>
// по разрешению, где LANG — язык КАЖДОЙ композиции по отдельности (из
// selectedCompLangs) — так при выделении сразу нескольких языковых папок
// иерархия по языкам сохраняется, а не схлопывается в одну общую папку.
function organizeProjectForCollect(
  proj: Project,
  selectedCompLangs: { [id: number]: string }
) {
  function addFolder(name: string, parent?: FolderItem) {
    var fld = proj.items.addFolder(name);
    fld.parentFolder = parent || proj.rootFolder;
    return fld;
  }
  function contains(list: string[], value: string) {
    for (var i = 0; i < list.length; i++) if (list[i] === value) return true;
    return false;
  }
  function getExt(item: any) {
    var fileName = "";
    try { fileName = (item.file && item.file.name) ? item.file.name : item.name; }
    catch (_) { fileName = item.name; }
    var parts = fileName.toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : "";
  }

  var stillExts = [
    "ai", "bmp", "cin", "cr2", "crw", "dcr", "dng", "dpx", "eps", "erf", "exr", "gif", "heic", "heif",
    "hdr", "iff", "jpeg", "jpg", "mrw", "nef", "orf", "pcx", "pdf", "pef", "pic", "png", "ps", "psd",
    "raf", "raw", "rle", "sgi", "sr2", "srf", "svg", "tga", "tif", "tiff", "vda", "vst", "x3f"
  ];
  var audioExts = [
    "aac", "aif", "aiff", "flac", "m4a", "mp2", "mp3", "ogg", "wav", "wma"
  ];
  var videoExts = [
    "3g2", "3gp", "amc", "avi", "dmx", "dv", "f4v", "flv", "gif", "hevc", "m2p", "m2t", "m2ts", "m2v",
    "m4v", "mkv", "mod", "mov", "mp4", "mpe", "mpeg", "mpg", "mts", "mxf", "r3d", "rm", "swf", "ts",
    "vob", "wmv"
  ];

  var assets  = addFolder("Assets", proj.rootFolder);
  var fAudios = addFolder("Audios", assets);
  var fComps  = addFolder("Comps",  assets);
  var fImages = addFolder("Images", assets);
  var fLayers = addFolder("layers", assets);
  var fVideos = addFolder("Videos", assets);

  var langFolders: { [lang: string]: FolderItem } = {};
  function getLangFolder(lang: string) {
    if (!langFolders[lang]) langFolders[lang] = addFolder(lang, proj.rootFolder);
    return langFolders[lang];
  }

  var resFolders: { [key: string]: FolderItem } = {};
  function getResFolder(lang: string, w: number, h: number) {
    var key = lang + "|" + w + "x" + h;
    if (!resFolders[key]) resFolders[key] = addFolder(w + "x" + h, getLangFolder(lang));
    return resFolders[key];
  }

  var protectedIDs: { [id: number]: boolean } = {};
  var prot = [assets, fAudios, fComps, fImages, fLayers, fVideos];
  for (var pi = 0; pi < prot.length; pi++) protectedIDs[prot[pi].id] = true;

  var snapshot = [];
  for (var n = 1; n <= proj.numItems; n++) snapshot.push(proj.item(n));

  for (var i = 0; i < snapshot.length; i++) {
    var it: any = snapshot[i];
    if (protectedIDs[it.id]) continue;
    if (it instanceof FolderItem) continue;

    if (it instanceof CompItem) {
      var compLang = selectedCompLangs[it.id];
      if (compLang) it.parentFolder = getResFolder(compLang, it.width, it.height);
      else it.parentFolder = fComps;
      continue;
    }

    if (it instanceof FootageItem) {
      if (it.mainSource instanceof SolidSource || !it.file) { it.parentFolder = fLayers; continue; }
      var ext = getExt(it);
      if (it.hasAudio && !it.hasVideo) it.parentFolder = fAudios;
      else if (it.mainSource && it.mainSource.isStill) it.parentFolder = fImages;
      else if (it.hasVideo) it.parentFolder = fVideos;
      else if (contains(audioExts, ext)) it.parentFolder = fAudios;
      else if (contains(stillExts, ext)) it.parentFolder = fImages;
      else if (contains(videoExts, ext)) it.parentFolder = fVideos;
      else it.parentFolder = fLayers;
    }
  }
}

// === ЯЗЫКИ И ФУНКЦИИ ДУБЛИРОВАНИЯ ===
var LANGUAGES: { [code: string]: string } = {
  "AR": "Arabic",
  "DA": "Danish",
  "DE": "German",
  "EN": "English",
  "ES": "Spanish",
  "FI": "Finnish",
  "FR": "French",
  "IT": "Italian",
  "JA": "Japanese",
  "KO": "Korean",
  "NL": "Dutch",
  "SV": "Swedish",
  "TH": "Thai"
};

// Убирает существующий суффикс языка ("_ES" и т.п.), если имя уже им заканчивается —
// чтобы при повторном дублировании не накапливалось "_EN_ES_FR...".
function stripLanguageSuffix(name: string) {
  var m = name.match(/^(.*)_([A-Za-z]{2})$/);
  if (m && LANGUAGES.hasOwnProperty(m[2].toUpperCase())) return m[1];
  return name;
}

// Достаёт код языка из суффикса имени композиции ("V1__1920x1080_EN" -> "EN").
// Возвращает null, если распознаваемого суффикса нет.
function extractLanguageCodeFromName(name: string) {
  var m = name.match(/^(.*)_([A-Za-z]{2})$/);
  if (m && LANGUAGES.hasOwnProperty(m[2].toUpperCase())) return m[2].toUpperCase();
  return null;
}

function duplicateFolderWithLanguage(sourceFolderItem: FolderItem, newLang: string, currentLang: string) {
  var proj = app.project;
  var sourceFolders: FolderItem[] = [];
  var sourceComps: CompItem[] = [];
  var sourceCompMap: { [id: number]: CompItem } = {};
  var folderMap: { [id: number]: FolderItem } = {};
  var compMap: { [id: number]: CompItem } = {};
  var sourceItemCount = proj.numItems;

  // Снимок исходного дерева: новые элементы в этот список никогда не попадут.
  function collectSourceItems(folder: FolderItem) {
    for (var i = 1; i <= sourceItemCount; i++) {
      var item = proj.item(i);
      if (item instanceof FolderItem) {
        var parent = item.parentFolder;
        if (parent === folder) {
          sourceFolders.push(item);
          collectSourceItems(item);
        }
      } else if (item instanceof CompItem && item.parentFolder === folder) {
        sourceComps.push(item);
      }
    }
  }

  collectSourceItems(sourceFolderItem);
  if (sourceComps.length === 0) {
    alert("В выбранной папке нет композиций!");
    return null;
  }

  // Расширяем снимок до полного графа: каждая дочерняя композиция,
  // на которую ссылается композиция языковой папки, тоже копируется.
  function collectLinkedComps(comp: CompItem) {
    if (sourceCompMap[comp.id]) return;
    sourceCompMap[comp.id] = comp;
    sourceComps.push(comp);

    for (var layerIdx = 1; layerIdx <= comp.numLayers; layerIdx++) {
      var sourceLayer = comp.layer(layerIdx);
      if (sourceLayer instanceof AVLayer && sourceLayer.source &&
        sourceLayer.source instanceof CompItem) {
        collectLinkedComps(sourceLayer.source);
      }
    }
  }

  var rootComps = sourceComps.slice(0);
  var rootCompIDs: { [id: number]: boolean } = {};
  for (var ri = 0; ri < rootComps.length; ri++) rootCompIDs[rootComps[ri].id] = true;

  sourceComps = [];
  for (var rootIndex = 0; rootIndex < rootComps.length; rootIndex++) {
    collectLinkedComps(rootComps[rootIndex]);
  }

  // Имя новой языковой папки уникально среди соседей.
  var parentFolder = sourceFolderItem.parentFolder;
  var baseFolderName = newLang;
  var folderName = baseFolderName;
  var suffixIndex = 1;
  var nameTaken = true;
  while (nameTaken) {
    nameTaken = false;
    for (var f = 1; f <= sourceItemCount; f++) {
      var existingFolder = proj.item(f);
      if (existingFolder instanceof FolderItem &&
        existingFolder.parentFolder === parentFolder &&
        existingFolder.name === folderName) {
        nameTaken = true;
        folderName = baseFolderName + "_" + suffixIndex;
        suffixIndex++;
        break;
      }
    }
  }

  var newFolder = proj.items.addFolder(folderName);
  newFolder.parentFolder = parentFolder;
  folderMap[sourceFolderItem.id] = newFolder;

  // Копируем зафиксированные папки, сохраняя пути и имена как есть — суффикс
  // языка добавляется только к именам композиций, папки его не получают.
  // stripLanguageSuffix на случай, если имя папки уже случайно содержит старый
  // суффикс (например от предыдущей версии скрипта) — чтобы не тащить его дальше.
  for (var sf = 0; sf < sourceFolders.length; sf++) {
    var sourceFolder = sourceFolders[sf];
    var sourceParent = sourceFolder.parentFolder;
    var targetParent = folderMap[sourceParent.id];
    if (targetParent) {
      var copiedFolder = proj.items.addFolder(stripLanguageSuffix(sourceFolder.name));
      copiedFolder.parentFolder = targetParent;
      folderMap[sourceFolder.id] = copiedFolder;
    }
  }

  // Дублируем все композиции графа. Корневым (лежащим прямо в языковой папке)
  // присваиваем суффикс нового языка — например "_ES". Вложенные precomp'ы,
  // подтянутые как зависимости, имена не меняют.
  for (var sc = 0; sc < sourceComps.length; sc++) {
    var sourceComp = sourceComps[sc];
    var dupComp = sourceComp.duplicate();
    dupComp.name = rootCompIDs[sourceComp.id]
      ? (stripLanguageSuffix(sourceComp.name) + "_" + newLang)
      : sourceComp.name;
    compMap[sourceComp.id] = dupComp;
    // Композиции из EN получают зеркальный путь внутри новой папки.
    // Внешние дочерние композиции, например из Assets/Comps,
    // остаются в своей исходной папке.
    var compTargetFolder = folderMap[sourceComp.parentFolder.id] || sourceComp.parentFolder;
    dupComp.parentFolder = compTargetFolder;
  }

  // Теперь заменяем все ссылки графа на соответствующие новые композиции.
  for (var dc = 0; dc < sourceComps.length; dc++) {
    var duplicatedComp = compMap[sourceComps[dc].id];
    for (var layerIdx = 1; layerIdx <= duplicatedComp.numLayers; layerIdx++) {
      var layerItem = duplicatedComp.layer(layerIdx);
      if (layerItem instanceof AVLayer && layerItem.source &&
        layerItem.source instanceof CompItem && compMap[layerItem.source.id]) {
        layerItem.replaceSource(compMap[layerItem.source.id], false);
      }
    }
  }

  return newFolder;
}

// === СОХРАНЕНИЕ ЗНАЧЕНИЙ EN / NAME МЕЖДУ ЗАПУСКАМИ ===
var SETTINGS_SECTION = "RRR_Script";
var SETTINGS_KEY_LANG = "lang";
var SETTINGS_KEY_CREATOR = "creator";
var SETTINGS_KEY_ICON_MODE = "iconMode";
var SETTINGS_KEY_COLLECTS_ROOT = "collectsRoot";
var SETTINGS_KEY_BUTTON_LAYOUT = "buttonLayout";
var SETTINGS_KEY_CUSTOM_BUTTONS = "customButtons";
var SETTINGS_KEY_BUTTONS_HISTORY_PATH = "buttonsHistoryPath";
var SETTINGS_KEY_LAST_SAVE_FOLDER = "lastProjectSaveFolder";

// Тумблер в гайде: показывать кнопки панели как PNG-иконки (по умолчанию)
// или как стандартные текстовые кнопки (как в старом ScriptUI, если бы
// иконки не были найдены). Настройка общая на всё расширение — сохраняется
// в app.settings, чтобы её видели и основная панель, и гайд.
export function getIconModeSetting(): boolean {
  if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_ICON_MODE)) {
    return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_ICON_MODE) !== "0";
  }
  return true;
}

export function setIconModeSetting(useIcons: boolean) {
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_ICON_MODE, useIcons ? "1" : "0");
}

// При каждом новом запуске язык всегда начинается с EN. Name запоминается между запусками.
export function getSavedCreatorName(): string {
  if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_CREATOR)) {
    return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_CREATOR);
  }
  return "";
}

function saveLangCreatorSettings(lang: string, creator: string) {
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_LANG, lang);
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_CREATOR, creator);
}

export function saveCreatorName(name: string, lang: string) {
  saveLangCreatorSettings(lang, name);
}

// Для окна гайда, где нет доступа к текущему lang основной панели (и он там
// не нужен) — сохраняет только ник, не трогая SETTINGS_KEY_LANG.
export function saveCreatorNameOnly(name: string) {
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_CREATOR, name);
}

// Корневая папка коллектов на Shared Drive — запрашивается у пользователя
// один раз (панель), дальше берётся отсюда.
export function getSavedCollectsRoot(): string {
  if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_COLLECTS_ROOT)) {
    return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_COLLECTS_ROOT);
  }
  return "";
}

export function saveCollectsRoot(rootPath: string) {
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_COLLECTS_ROOT, rootPath);
}

// Папка текущего (открытого) проекта — куда скачивается и распаковывается
// архив коллекта, если внутри найденной папки на Drive лежит .zip, а не
// .aep напрямую. null, если проект ещё ни разу не сохранён (некуда класть).
export function getCurrentProjectFolder(): string | null {
  var proj = app.project;
  if (!proj || !proj.file) return null;
  return proj.file.parent.fsName;
}

// ====================== БЛОК ПОЛЬЗОВАТЕЛЬСКИХ КНОПОК (RRR_3.0) ======================
// Раскладка (порядок + состав встроенных/пользовательских кнопок) и сами
// определения пользовательских кнопок — независимые JSON-блобы в
// app.settings, тем же способом, что и остальные настройки этого блока.

export function getButtonLayout(): string {
  if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_BUTTON_LAYOUT)) {
    return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_BUTTON_LAYOUT);
  }
  return "";
}

export function saveButtonLayout(layoutJson: string) {
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_BUTTON_LAYOUT, layoutJson);
}

export function getCustomButtons(): string {
  if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_CUSTOM_BUTTONS)) {
    return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_CUSTOM_BUTTONS);
  }
  return "";
}

export function saveCustomButtons(buttonsJson: string) {
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_CUSTOM_BUTTONS, buttonsJson);
}

export function getSavedButtonsHistoryPath(): string {
  if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_BUTTONS_HISTORY_PATH)) {
    return app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_BUTTONS_HISTORY_PATH);
  }
  return "";
}

export function saveButtonsHistoryPath(historyPath: string) {
  app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_BUTTONS_HISTORY_PATH, historyPath);
}

// Применяет код выражения к КАЖДОМУ выделенному свойству активной композиции.
// selectedProperties существует только у CompItem — на другом активном
// итеме (или без выделенных свойств) явно сообщаем, а не падаем молча.
export function applyExpressionToSelected(code: string): { ok: boolean; appliedCount: number; message?: string } {
  var comp = app.project ? app.project.activeItem : null;
  if (!(comp instanceof CompItem)) {
    return { ok: false, appliedCount: 0, message: "Нет активной композиции — откройте композицию на Timeline." };
  }
  var props = comp.selectedProperties;
  if (!props || props.length === 0) {
    return { ok: false, appliedCount: 0, message: "Не выделено ни одного свойства на Timeline." };
  }
  var applied = 0;
  app.beginUndoGroup("Применить выражение (кастомная кнопка)");
  try {
    for (var i = 0; i < props.length; i++) {
      try {
        var prop = props[i];
        if (prop.canSetExpression) { prop.expression = code; applied++; }
      } catch (_) {}
    }
  } finally {
    app.endUndoGroup();
  }
  if (applied === 0) return { ok: false, appliedCount: 0, message: "Ни одно из выделенных свойств не поддерживает выражения." };
  return { ok: true, appliedCount: applied };
}

// Применяет пресет (.ffx) к каждому выделенному слою активной композиции.
// presetPath — путь к уже сохранённому на диске .ffx (панель сохраняет туда
// base64 из определения кнопки перед вызовом).
export function applyPresetToSelected(presetPath: string): { ok: boolean; appliedCount: number; message?: string } {
  var comp = app.project ? app.project.activeItem : null;
  if (!(comp instanceof CompItem)) {
    return { ok: false, appliedCount: 0, message: "Нет активной композиции — откройте композицию на Timeline." };
  }
  var layers = comp.selectedLayers;
  if (!layers || layers.length === 0) {
    return { ok: false, appliedCount: 0, message: "Не выделено ни одного слоя на Timeline." };
  }
  var presetFile = new File(presetPath);
  if (!presetFile.exists) return { ok: false, appliedCount: 0, message: "Файл пресета не найден: " + presetPath };

  var applied = 0;
  app.beginUndoGroup("Применить пресет (кастомная кнопка)");
  try {
    for (var i = 0; i < layers.length; i++) {
      try { layers[i].applyPreset(presetFile); applied++; } catch (_) {}
    }
  } finally {
    app.endUndoGroup();
  }
  if (applied === 0) return { ok: false, appliedCount: 0, message: "Пресет не применился ни к одному слою." };
  return { ok: true, appliedCount: applied };
}

// Выбор нового языка в дропдауне: дублирует выделенную (двубуквенную) папку под новый язык.
export function onLanguageChange(newLang: string, currentLang: string, creatorName: string): boolean {
  var proj = app.project;
  var selectedItems = proj.selection;

  // Композиция выбрана напрямую (не папка) — просто меняем/добавляем
  // суффикс языка у самой композиции (для любого языка, включая EN), без
  // дубликата и без папок — та же формула суффикса, что и везде в скрипте.
  var selectedComp: CompItem | null = null;
  for (var ci = 0; ci < selectedItems.length; ci++) {
    if (selectedItems[ci] instanceof CompItem) { selectedComp = selectedItems[ci] as CompItem; break; }
  }
  if (selectedComp) {
    app.beginUndoGroup("Set Composition Language Suffix");
    try {
      selectedComp.name = stripLanguageSuffix(selectedComp.name) + "_" + newLang;
      saveLangCreatorSettings(newLang, creatorName);
      alert("✅ Суффикс языка изменён на \"" + newLang + "\".");
      return true;
    } catch (e: any) {
      alert("Ошибка: " + e.toString());
      return false;
    } finally {
      app.endUndoGroup();
    }
  }

  // EN — особый случай: переименовываем выделенную папку на месте, без
  // дубликата. Работает с ЛЮБОЙ папкой с композициями (не обязательно уже
  // двубуквенной) — так исходную/непомеченную папку можно один раз
  // назначить базовым языком EN. Дубликат создаётся только при выборе
  // остальных языков (см. ветку ниже).
  if (newLang === "EN") {
    var folderToRename: FolderItem | null = null;
    for (var fi = 0; fi < selectedItems.length; fi++) {
      var fItem = selectedItems[fi];
      if (fItem instanceof FolderItem) {
        var seenIDs: { [id: number]: boolean } = {};
        var foundComps: CompItem[] = [];
        collectCompsInFolder(fItem, seenIDs, foundComps);
        if (foundComps.length > 0) { folderToRename = fItem; break; }
      }
    }
    if (!folderToRename) {
      alert("Пожалуйста, выделите папку с композициями.");
      return false;
    }
    app.beginUndoGroup("Rename Folder to EN");
    try {
      folderToRename.name = "EN";
      saveLangCreatorSettings(newLang, creatorName);
      alert("✅ Папка переименована в \"EN\".");
      return true;
    } catch (e: any) {
      alert("Ошибка: " + e.toString());
      return false;
    } finally {
      app.endUndoGroup();
    }
  }

  // Ищем выбранную папку с двубуквенным именем
  var selectedFolder: FolderItem | null = null;
  for (var si = 0; si < selectedItems.length; si++) {
    var item = selectedItems[si];
    if (item instanceof FolderItem && item.name.length === 2) {
      selectedFolder = item;
      break;
    }
  }

  if (!selectedFolder) {
    alert("Пожалуйста, выделите папку с двубуквенным названием языка (например EN, ES).");
    return false;
  }

  var success = false;
  app.beginUndoGroup("Duplicate Language Folder");
  try {
    var newFolderItem = duplicateFolderWithLanguage(selectedFolder, newLang, currentLang);
    if (newFolderItem) {
      saveLangCreatorSettings(newLang, creatorName);
      alert("✅ Папка \"" + newLang + "\" создана с дублированными композициями.");
      success = true;
    }
  } catch (e: any) {
    alert("Ошибка: " + e.toString());
  } finally {
    app.endUndoGroup();
  }
  return success;
}

// === Версионный формат имён: V?__WxH ===
var RESOLUTIONS: { [key: string]: { w: number; h: number } } = {
  "9x16": { w: 1080, h: 1920 },
  "4x3":  { w: 1080, h: 1350 },
  "1x1":  { w: 1080, h: 1080 },
  "16x9": { w: 1920, h: 1080 }
};

function getVersionFromName(name: string) {
  var m = name.match(/[Vv](\d+)/);
  return m ? m[1] : "1";
}

// Цвет-лейбл композиции по номеру версии в имени: V1 = Label 1, V2 = Label 2,
// ... V16 = Label 16, дальше цикл заново (V17 = Label 1 и т.д.) — в AE ровно
// 16 цветов-лейблов. Применяется при переименовании (кнопки ресайза), при
// Collect и при Render — везде, где в имени есть "V?". Если "V?" в имени нет —
// лейбл явно сбрасывается на None (0), а не остаётся прежним.
function applyVersionLabel(comp: CompItem) {
  var m = comp.name.match(/[Vv](\d+)/);
  if (!m) { comp.label = 0; return; }
  var v = parseInt(m[1], 10);
  comp.label = ((v - 1) % 16) + 1;
}

// Сканирует ПРЯМЫХ соседей (parentFolder) на такое же разрешение и находит
// максимальный номер версии среди них — новый дубликат получает следующий
// номер относительно того, что уже есть в папке, а не относительно версии
// самой выделенной (дублируемой) композиции.
function getNextVersionInFolder(folder: FolderItem | null, w: number, h: number): number {
  var maxVersion = 0;
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it instanceof CompItem && it.parentFolder === folder && it.width === w && it.height === h) {
      var v = parseInt(getVersionFromName(it.name), 10);
      if (!isNaN(v) && v > maxVersion) maxVersion = v;
    }
  }
  return maxVersion + 1;
}

function buildProjectName(version: string, w: number, h: number) {
  return "V" + version + "__" + w + "x" + h;
}

function buildTimelineName(oldName: string, w: number, h: number) {
  return oldName + "__" + w + "x" + h;
}

// Определяет язык из иерархии папок: ближайшая (на любой глубине вверх от
// композиции) папка с именем — двубуквенным кодом языка (EN/ES/...). Если
// такой папки нет (композиция в корне или во вложенных не-языковых папках) —
// используется defaultLang (по умолчанию EN).
function getLanguageFromFolderHierarchy(folder: FolderItem | null, defaultLang?: string): string {
  var current = folder;
  while (current && current !== app.project.rootFolder) {
    var code = current.name.toUpperCase();
    if (code.length === 2 && LANGUAGES.hasOwnProperty(code)) return code;
    current = current.parentFolder;
  }
  return defaultLang || "EN";
}

// Собирает граф композиции: сама композиция + все вложенные precomp'ы,
// на которые ссылаются её слои (рекурсивно, без дублей).
function collectCompGraph(rootComp: CompItem): CompItem[] {
  var seenIDs: { [id: number]: boolean } = {};
  var result: CompItem[] = [];
  function walk(comp: CompItem) {
    if (seenIDs[comp.id]) return;
    seenIDs[comp.id] = true;
    result.push(comp);
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (layer instanceof AVLayer && layer.source && layer.source instanceof CompItem) {
        walk(layer.source);
      }
    }
  }
  walk(rootComp);
  return result;
}

// Дублирует ВЕСЬ граф композиции (саму композицию + все вложенные precomp'ы)
// независимой копией — родительские связи (layer.source) пересобираются
// заново между дублями, каждый дубль кладётся рядом со своим оригиналом.
// Корневой дубль называется по полной формуле V<newVersion>__WxH_LANG,
// дочерние получают суффикс "_V<newVersion>" к своему текущему имени.
function duplicateCompVersionGraph(sourceComp: CompItem, newVersion: number, lang: string, w: number, h: number): CompItem {
  var graph = collectCompGraph(sourceComp);
  var compMap: { [id: number]: CompItem } = {};

  for (var i = 0; i < graph.length; i++) {
    var orig = graph[i];
    var dup = orig.duplicate();
    dup.parentFolder = orig.parentFolder;
    if (orig === sourceComp) {
      dup.name = buildProjectName(String(newVersion), w, h) + "_" + lang;
    } else {
      dup.name = orig.name + "_V" + newVersion;
      applyVersionLabel(dup);
    }
    compMap[orig.id] = dup;
  }

  for (var j = 0; j < graph.length; j++) {
    var origComp = graph[j];
    var dupComp = compMap[origComp.id];
    for (var li = 1; li <= dupComp.numLayers; li++) {
      var layer = dupComp.layer(li);
      if (layer instanceof AVLayer && layer.source && layer.source instanceof CompItem && compMap[layer.source.id]) {
        layer.replaceSource(compMap[layer.source.id], false);
      }
    }
  }

  return compMap[sourceComp.id];
}

// Общая логика для всех 4 кнопок ресайза, когда разрешение выделенной
// композиции УЖЕ совпадает с целевым разрешением кнопки: вместо кропа/билда
// либо переименовываем композицию по формуле V?__WxH_LANG (если имя ещё не
// соответствует формуле), либо, если оно уже соответствует, создаём
// независимый дубликат всего графа со следующим номером версии. Композиция
// (или её новый дубликат) остаётся в ТОЙ ЖЕ папке, где уже находится —
// никаких lang/WxH-папок здесь не создаём и никуда не перекладываем: это
// исключительно задача кнопки collect/ctrl+collect.
// Без своей undo-группы — её открывают вызывающие обёртки (одиночная/массовая).
function renameOrVersionCompCore(sourceComp: CompItem, key: string) {
  var target = RESOLUTIONS[key];
  var lang = getLanguageFromFolderHierarchy(sourceComp.parentFolder);
  var expectedName = buildProjectName(getVersionFromName(sourceComp.name), target.w, target.h) + "_" + lang;

  if (sourceComp.name === expectedName) {
    var newVersion = getNextVersionInFolder(sourceComp.parentFolder, target.w, target.h);
    var dupRoot = duplicateCompVersionGraph(sourceComp, newVersion, lang, target.w, target.h);
    applyVersionLabel(dupRoot);
    dupRoot.openInViewer();
  } else {
    sourceComp.name = expectedName;
    applyVersionLabel(sourceComp);
    sourceComp.openInViewer();
  }
}

// Дублирует композицию и обрезает/дополняет со всех сторон до targetW x
// targetH, сохраняя положение всех слоёв относительно ЦЕНТРА кадра (не
// только по высоте, как раньше, — 16:9 меняет ещё и ширину, в отличие от
// 9:16/4:3/1:1, у которых ширина всегда 1080 и не меняется).
function cropResizeComp(sourceComp: CompItem, targetW: number, targetH: number) {
  var newComp = sourceComp.duplicate();
  var oldW = newComp.width;
  var oldH = newComp.height;
  var diffX = (targetW - oldW) / 2;
  var diffY = (targetH - oldH) / 2;
  var tNull = newComp.layers.addNull();
  tNull.transform.position.setValue([oldW / 2, oldH / 2]);
  var parents: any[] = [];
  for (var i = 1; i <= newComp.numLayers; i++) {
    var lyr = newComp.layer(i);
    if (lyr === tNull) continue;
    parents[i] = lyr.parent;
    if (lyr.parent === null) lyr.parent = tNull;
  }
  newComp.width = targetW;
  newComp.height = targetH;
  var curP = tNull.transform.position.value;
  tNull.transform.position.setValue([curP[0] + diffX, curP[1] + diffY]);
  for (var j = 1; j <= newComp.numLayers; j++) {
    var l = newComp.layer(j);
    if (l !== tNull && l.parent === tNull) l.parent = parents[j];
  }
  tNull.remove();
  return newComp;
}

function unlockAllLayers(comp: CompItem) {
  for (var i = 1; i <= comp.numLayers; i++) {
    if (comp.layer(i).locked) comp.layer(i).locked = false;
  }
}

// Дублирует, кропает и переименовывает ОДНУ композицию — без своей undo-
// группы (её открывает processCropResolutionProject один раз на весь пакет
// выделенных композиций, чтобы Ctrl+Z отменял весь клик целиком).
function cropResizeCompCore(sourceComp: CompItem, key: string): CompItem {
  var target = RESOLUTIONS[key];
  var version = getVersionFromName(sourceComp.name);
  var lang = getLanguageFromFolderHierarchy(sourceComp.parentFolder);
  unlockAllLayers(sourceComp);
  var newComp = cropResizeComp(sourceComp, target.w, target.h);
  newComp.name = buildProjectName(version, target.w, target.h) + "_" + lang;
  applyVersionLabel(newComp);
  newComp.openInViewer();
  return newComp;
}

// Клик (без модификаторов) на 9:16 / 4:3 / 1:1 / 16:9: работаем со ВСЕМ
// выделением в панели Project, а не только с первой композицией — каждая
// выделенная композиция обрабатывается своим путём (переименование/версия,
// если разрешение уже совпадает с целевым, иначе кроп-ресайз), но всё в
// ОДНОЙ undo-группе на весь клик, чтобы один Ctrl+Z отменял весь пакет.
function processCropResolutionProject(key: string) {
  var target = RESOLUTIONS[key];
  var proj = app.project;

  // Среди выделения отдельно собираем композиции, чьё разрешение уже
  // совпадает с целевым (переименование/новая версия), и отдельно все
  // остальные (кроп-ресайз) — обе группы обрабатываются целиком.
  var selection = proj.selection;
  var matchingComps: CompItem[] = [];
  var otherComps: CompItem[] = [];
  for (var i = 0; i < selection.length; i++) {
    if (selection[i] instanceof CompItem) {
      var selComp = selection[i] as CompItem;
      if (selComp.width === target.w && selComp.height === target.h) {
        matchingComps.push(selComp);
      } else {
        otherComps.push(selComp);
      }
    }
  }

  if (matchingComps.length === 0 && otherComps.length === 0) {
    alert("Выделите композицию в панели Project!");
    return;
  }

  var isBatch = matchingComps.length + otherComps.length > 1;
  app.beginUndoGroup("Resize " + key + (isBatch ? " (Batch)" : ""));
  try {
    for (var m = 0; m < matchingComps.length; m++) {
      renameOrVersionCompCore(matchingComps[m], key);
    }
    for (var n = 0; n < otherComps.length; n++) {
      cropResizeCompCore(otherComps[n], key);
    }
  } finally {
    app.endUndoGroup();
  }
}

// Ctrl+Click на 9:16 / 4:3 / 1:1: работаем ТОЛЬКО с выделенным слоем
// на таймлайне (source которого — композиция) — заменяем композицию в слое.
function processCropResolutionTimeline(key: string) {
  var target = RESOLUTIONS[key];
  var proj = app.project;
  var active = proj.activeItem;

  if (!(active && active instanceof CompItem && active.selectedLayers.length === 1)) {
    alert("Выделите один слой на таймлайне (source которого — композиция)!");
    return;
  }
  var selLayer = active.selectedLayers[0];
  if (!(selLayer instanceof AVLayer) || !selLayer.source || !(selLayer.source instanceof CompItem)) {
    alert("Выделенный слой на таймлайне не является композицией.");
    return;
  }
  var srcComp = selLayer.source;
  if (srcComp.width === target.w && srcComp.height === target.h) {
    alert("Эта композиция уже в разрешении " + target.w + "x" + target.h + " — менять нечего.");
    return;
  }

  app.beginUndoGroup("Resize " + key);
  unlockAllLayers(srcComp);
  var newComp = cropResizeComp(srcComp, target.w, target.h);
  newComp.name = buildTimelineName(srcComp.name, target.w, target.h);
  applyVersionLabel(newComp);
  selLayer.replaceSource(newComp, false);
  alert("✅ Готово!\nСоздана копия \"" + newComp.name + "\" и подставлена в выделенный слой.\nОригинал не изменён.");
  app.endUndoGroup();
}

// Специальная механика (16:9, 1:1): работает только с исходником 1080x1350 (4:3).
// Создаёт композицию с двумя слоями (нижний — скейл+блюр без звука, верхний — скейл),
// разрешение результата зависит от targetKey. Скейл нижнего (блюр-фон) слоя
// тоже свой на каждый формат — для 1:1 канвас у́же, поэтому меньше 200%.
var BOTTOM_LAYER_SCALE: { [k: string]: number } = { "16x9": 200, "1x1": 101 };

function buildSpecialBuildComp(sourceComp: CompItem, newName: string, targetKey: string) {
  var proj = app.project;
  var target = RESOLUTIONS[targetKey];
  var bottomScale = BOTTOM_LAYER_SCALE[targetKey] || 200;
  var newComp = proj.items.addComp(newName, target.w, target.h, sourceComp.pixelAspect, sourceComp.duration, sourceComp.frameRate);
  var layerBottom = newComp.layers.add(sourceComp);
  layerBottom.property("Transform").property("Scale").setValue([bottomScale, bottomScale]);
  layerBottom.audioEnabled = false;
  var blur = layerBottom.property("Effects").addProperty("ADBE Fast Blur");
  if (blur) blur.property("Blurriness").setValue(40);
  var layerTop = newComp.layers.add(sourceComp);
  layerTop.property("Transform").property("Scale").setValue([80, 80]);
  return newComp;
}

var SPECIAL_BUILD_LABELS: { [k: string]: string } = { "16x9": "16:9", "1x1": "1:1" };

// Alt+Click на 1:1 / 16:9: работаем со ВСЕМ выделением в панели Project, а
// не только с первой подходящей композицией — билдим блюр-фон композицию из
// КАЖДОГО исходника 1080x1350 в выделении, плюс переименование/версия для
// композиций, уже имеющих целевое разрешение, всё в одной undo-группе на
// клик (как и обычный ресайз-клик без модификаторов).
function processSpecialBuildProject(targetKey: string) {
  var proj = app.project;
  var target = RESOLUTIONS[targetKey];
  var label = SPECIAL_BUILD_LABELS[targetKey] || targetKey;

  var selection = proj.selection;
  var matchingComps: CompItem[] = [];
  var sourceComps: CompItem[] = [];
  for (var i = 0; i < selection.length; i++) {
    if (selection[i] instanceof CompItem) {
      var selComp = selection[i] as CompItem;
      if (selComp.width === target.w && selComp.height === target.h) {
        matchingComps.push(selComp);
      } else if (selComp.width === 1080 && selComp.height === 1350) {
        sourceComps.push(selComp);
      }
    }
  }

  if (matchingComps.length === 0 && sourceComps.length === 0) {
    alert("Кнопка " + label + " работает только с композицией 1080x1350 (4:3) или уже готовой " + target.w + "x" + target.h + ". Выделите подходящую композицию в панели Project.");
    return;
  }

  var isBatch = matchingComps.length + sourceComps.length > 1;
  app.beginUndoGroup("Special Build " + label + (isBatch ? " (Batch)" : ""));
  try {
    for (var m = 0; m < matchingComps.length; m++) {
      renameOrVersionCompCore(matchingComps[m], targetKey);
    }
    for (var s = 0; s < sourceComps.length; s++) {
      var sourceComp = sourceComps[s];
      var version = getVersionFromName(sourceComp.name);
      var lang = getLanguageFromFolderHierarchy(sourceComp.parentFolder);
      unlockAllLayers(sourceComp);
      var newName = buildProjectName(version, target.w, target.h) + "_" + lang;
      var newComp = buildSpecialBuildComp(sourceComp, newName, targetKey);
      newComp.parentFolder = sourceComp.parentFolder;
      applyVersionLabel(newComp);
      newComp.openInViewer();
    }
  } finally {
    app.endUndoGroup();
  }
}

// Alt+Click на 9:16: создаёт пустую референсную композицию 1080x1920 с гайд-слоем
// сейфзоны — двумя тонкими линиями на расстоянии 1350px друг от друга, симметрично
// относительно центра. Это то, что остаётся видимым после кропа под 1080x1350 по высоте.
function createSafeZoneGuideComp() {
  var proj = app.project;
  var compW = 1080, compH = 1920, frameRate = 30, durationSec = 20;
  var safeZoneHeight = 1350;
  var lineColor = [0x06 / 255, 0x6C / 255, 0xE7 / 255]; // 066CE7
  var lineThickness = 4;

  var comp = proj.items.addComp("V1__1080x1920_EN", compW, compH, 1, durationSec, frameRate);
  applyVersionLabel(comp);

  var shapeLayer = comp.layers.addShape();
  shapeLayer.name = "Safe Zone Guide";
  shapeLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
  shapeLayer.property("Transform").property("Position").setValue([compW / 2, compH / 2]);
  shapeLayer.property("Transform").property("Opacity").setValue(24);

  var rootContents = shapeLayer.property("Contents");

  function addGuideLine(name: string, offsetYFromCenter: number) {
    var group = rootContents.addProperty("ADBE Vector Group");
    group.name = name;
    var groupContents = group.property("Contents");

    var rect = groupContents.addProperty("ADBE Vector Shape - Rect");
    rect.property("Size").setValue([compW, lineThickness]);
    rect.property("Position").setValue([0, 0]);

    var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
    fill.property("Color").setValue(lineColor);

    group.property("Transform").property("Position").setValue([0, offsetYFromCenter]);
  }

  addGuideLine("Line Top", -safeZoneHeight / 2);
  addGuideLine("Line Bottom", safeZoneHeight / 2);

  // Скрыт из таймлайна (shy) и помечен как Guide Layer — виден только в
  // вьювере при монтаже, но не попадает в рендер/вложенные композиции.
  // ВАЖНО: locked ставим ПОСЛЕДНИМ — AE не даёт менять guideLayer/shy
  // на уже залоченном слое.
  shapeLayer.shy = true;
  shapeLayer.guideLayer = true;
  comp.hideShyLayers = true;
  shapeLayer.locked = true;

  comp.openInViewer();
  return comp;
}

// Alt+Click на 4:3: создаёт пустую композицию 1080x1350 — без гайд-слоёв,
// в отличие от createSafeZoneGuideComp (Alt+Click на 9:16).
function createEmpty4x3Comp() {
  var proj = app.project;
  var target = RESOLUTIONS["4x3"];
  var frameRate = 30, durationSec = 20;
  var name = buildProjectName("1", target.w, target.h) + "_EN";

  var comp = proj.items.addComp(name, target.w, target.h, 1, durationSec, frameRate);
  applyVersionLabel(comp);
  comp.openInViewer();
  return comp;
}

// Клик по кнопкам 9:16 / 4:3 / 1:1 / 16:9: Click — resize in project,
// Ctrl+Click — resize in timeline (без ограничения по исходному разрешению),
// Alt+Click на 9:16 — создать референсную комп с гайдами сейфзоны,
// Alt+Click на 4:3 — создать пустую комп 1080x1350 без гайд-слоёв,
// Alt+Click на 1:1 / 16:9 — блюр-фон билд (старое поведение Click/Ctrl+Click),
// работает только из исходника 1080x1350.
export function cropButtonClick(key: string, ctrlKey: boolean, altKey: boolean) {
  if (key === "9x16" && altKey) {
    app.beginUndoGroup("Create Safe Zone Guide Comp");
    try { createSafeZoneGuideComp(); }
    catch (e: any) { alert("Error: " + e.toString()); }
    finally { app.endUndoGroup(); }
    return;
  }
  if (key === "4x3" && altKey) {
    app.beginUndoGroup("Create Empty 4x3 Comp");
    try { createEmpty4x3Comp(); }
    catch (e: any) { alert("Error: " + e.toString()); }
    finally { app.endUndoGroup(); }
    return;
  }
  if ((key === "1x1" || key === "16x9") && altKey) {
    processSpecialBuildProject(key);
    return;
  }
  if (ctrlKey) {
    processCropResolutionTimeline(key);
  } else {
    processCropResolutionProject(key);
  }
}

function escName(n: string) { return n.replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }

// Render/Collect должны работать одинаково и при выделении композиций напрямую,
// и при выделении папок с композициями — в этом случае берутся ВСЕ композиции
// внутри такой папки (рекурсивно, включая вложенные подпапки).
function collectCompsInFolder(folder: FolderItem, seenIDs: { [id: number]: boolean }, result: CompItem[]) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var it = app.project.item(i);
    if (it.parentFolder !== folder) continue;
    if (it instanceof CompItem) {
      if (!seenIDs[it.id]) { seenIDs[it.id] = true; result.push(it); }
    } else if (it instanceof FolderItem) {
      collectCompsInFolder(it, seenIDs, result);
    }
  }
}

function getCompsFromSelection(selection: any[]) {
  var seenIDs: { [id: number]: boolean } = {};
  var result: CompItem[] = [];
  for (var i = 0; i < selection.length; i++) {
    var it = selection[i];
    if (it instanceof CompItem) {
      if (!seenIDs[it.id]) { seenIDs[it.id] = true; result.push(it); }
    } else if (it instanceof FolderItem) {
      collectCompsInFolder(it, seenIDs, result);
    }
  }
  return result;
}

function getOrAddEffect(layer: AVLayer, matchName: string, effectName: string, defaultValue: any) {
  var fx = layer.property("ADBE Effect Parade") as PropertyGroup;
  if (!fx) return null;
  for (var i = 1; i <= fx.numProperties; i++) {
    if (fx.property(i).name === effectName) return fx.property(i);
  }
  var e = fx.addProperty(matchName);
  if (!e) return null;
  e.name = effectName;
  try {
    if (matchName === "ADBE Point Control") e.property("ADBE Point Control-0001").setValue(defaultValue);
    else if (matchName === "ADBE Slider Control") e.property("ADBE Slider Control-0001").setValue(defaultValue);
  } catch (_) {}
  return e;
}

function applyControllers() {
  var proj = app.project;
  if (!proj) { alert("No project."); return; }
  var active = app.project.activeItem;

  var selectedComp: CompItem | null = null;
  var selectedLayerOnTimeline: AVLayer | null = null;

  if (active && active instanceof CompItem && active.selectedLayers.length === 1) {
    selectedLayerOnTimeline = active.selectedLayers[0] as AVLayer;
    if (!(selectedLayerOnTimeline instanceof AVLayer) || !selectedLayerOnTimeline.source || !(selectedLayerOnTimeline.source instanceof CompItem)) {
      alert("Selected layer is not a precomp.");
      return;
    }
    selectedComp = selectedLayerOnTimeline.source;

  } else if (app.project.selection.length === 1 && app.project.selection[0] instanceof CompItem) {
    selectedComp = app.project.selection[0] as CompItem;
  } else {
    alert("Select exactly ONE precomp layer on the timeline OR ONE composition in the Project panel.");
    return;
  }

  var sourceComp = selectedComp;
  var newSourceComp = sourceComp.duplicate();
  newSourceComp.name = sourceComp.name + " (Ctrl)";

  if (selectedLayerOnTimeline) {
    selectedLayerOnTimeline.replaceSource(newSourceComp, false);
  }

  var innerComp = newSourceComp;
  var outerComp = app.project.activeItem as CompItem;

  if (!selectedLayerOnTimeline) {
    alert("Done!\nClean source created in Project panel.");
    return;
  }

  var outerLayerIndex = selectedLayerOnTimeline.index;

  // Отдельный контроллер Position (Point Control) и Scale (Slider Control,
  // пропорциональный — одно число сразу на X и Y) на КАЖДЫЙ непривязанный
  // (без parent) слой внутри прекомпа, имя контроллера — по имени слоя.
  // Position — аддитивный офсет, Scale — множитель (100 = без изменений).
  var count = 0;
  for (var i = 1; i <= innerComp.numLayers; i++) {
    var layer = innerComp.layer(i);
    if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
    if (layer.parent !== null) continue;
    if (!layer.hasVideo) continue;
    var transform = layer.property("ADBE Transform Group") as PropertyGroup;
    if (!transform) continue;
    var pos = transform.property("ADBE Position");
    var scl = transform.property("ADBE Scale");
    if (!pos || !scl) continue;

    var layerLabel = layer.name;
    var posCtrlName = layerLabel + "_Position";
    var sclCtrlName = layerLabel + "_Scale";
    getOrAddEffect(selectedLayerOnTimeline, "ADBE Point Control", posCtrlName, [0, 0]);
    getOrAddEffect(selectedLayerOnTimeline, "ADBE Slider Control", sclCtrlName, 100);

    var posExpr = 'var p = comp("' + escName(outerComp.name) + '").layer(' + outerLayerIndex + ').effect("' + escName(posCtrlName) + '")("Point");\n' +
      'value + (value.length==3 ? [p[0], p[1], 0] : p);';
    var sclExpr = 'var s = comp("' + escName(outerComp.name) + '").layer(' + outerLayerIndex + ').effect("' + escName(sclCtrlName) + '")("Slider")/100;\n' +
      'value * s;';
    pos.expression = posExpr;
    scl.expression = sclExpr;
    count++;
  }

  alert("Done!\nReplaced with clean source & Controllers added.\n" + count + " unparented layer(s) got their own Position/Scale controllers.");
}

// === ЭКСПОРТ ПАРАМЕТРОВ СО КЛЮЧАМИ В ESSENTIAL GRAPHICS ===
// Берёт выделенные precomp-слои на таймлайне, находит все параметры со ключами
// и добавляет их в Essential Graphics их собственной (внутренней) композиции.
function hasKeyframes(prop: Property) {
  try {
    return prop.numKeys > 0;
  } catch (e) {
    return false;
  }
}

// Рекурсивно обходит группу свойств эффекта — некоторые эффекты (не только
// простые Slider/Point Control) хранят анимируемые параметры не напрямую
// внутри эффекта, а во вложенных подгруппах, поэтому обход в один уровень
// их пропускал. canVaryOverTime не проверяем — это лишняя проверка, которая
// могла ложно отфильтровывать реально анимированные параметры (например
// ключи Slider Control): если у параметра есть ключи (numKeys > 0), он
// однозначно анимирован, независимо от этого флага.
function collectKeyframedInGroup(group: PropertyGroup, layer: AVLayer, effectName: string, props: any[]) {
  for (var i = 1; i <= group.numProperties; i++) {
    try {
      var child = group.property(i);
      if (!child) continue;
      if (child.propertyType === PropertyType.PROPERTY) {
        var p = child as Property;
        if (hasKeyframes(p)) {
          props.push({
            layer: layer,
            prop: p,
            displayName: layer.name + " | " + effectName + " | " + p.name,
            effectName: effectName,
            paramName: p.name
          });
        }
      } else {
        collectKeyframedInGroup(child as PropertyGroup, layer, effectName, props);
      }
    } catch (e) {}
  }
}

function collectKeyframedProps(comp: CompItem) {
  var props: any[] = [];
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;
    if (!layer.hasVideo) continue;

    // Transform параметры
    var transform = layer.property("ADBE Transform Group") as PropertyGroup;
    if (transform) {
      var transProps = [
        ["ADBE Position", "Position"],
        ["ADBE Anchor Point", "Anchor Point"],
        ["ADBE Scale", "Scale"],
        ["ADBE Rotation", "Rotation"],
        // У 3D-слоёв вместо единого "ADBE Rotation" используются отдельные
        // X/Y/Z Rotate + Orientation — "ADBE Rotation" у них просто не существует.
        ["ADBE Rotate X", "X Rotation"],
        ["ADBE Rotate Y", "Y Rotation"],
        ["ADBE Rotate Z", "Z Rotation"],
        ["ADBE Orientation", "Orientation"],
        ["ADBE Opacity", "Opacity"]
      ];
      for (var tp = 0; tp < transProps.length; tp++) {
        try {
          var p = transform.property(transProps[tp][0]);
          if (p && hasKeyframes(p)) {
            props.push({
              layer: layer,
              prop: p,
              displayName: layer.name + " | " + transProps[tp][1],
              matchName: transProps[tp][0]
            });
          }
        } catch (e) {}
      }
    }

    // Effects параметры (рекурсивно, включая вложенные подгруппы параметров)
    try {
      var effects = layer.property("ADBE Effect Parade") as PropertyGroup;
      if (effects && effects.numProperties > 0) {
        for (var ei = 1; ei <= effects.numProperties; ei++) {
          var effect = effects.property(ei) as PropertyGroup;
          collectKeyframedInGroup(effect, layer, effect.name, props);
        }
      }
    } catch (e) {}
  }
  return props;
}

function exportKeysToEG() {
  var proj = app.project;
  if (!proj) { alert("No project."); return; }

  var active = proj.activeItem;
  if (!(active && active instanceof CompItem)) {
    alert("Open a composition on the timeline and select the precomp layer(s) with keyframes.");
    return;
  }

  if (active.selectedLayers.length === 0) {
    alert("Select at least one precomp layer on the timeline.");
    return;
  }

  // Каждый выделенный precomp-слой обрабатывается отдельно: параметры со ключами
  // регистрируются в Essential Graphics его СОБСТВЕННОЙ (внутренней) композиции.
  // Именно тогда AE сама показывает их как "Master Properties" на этом слое —
  // прямо в таймлайне активной композиции, без открытия отдельной панели.
  var groups: { innerComp: CompItem; props: any[] }[] = [];
  for (var li = 0; li < active.selectedLayers.length; li++) {
    var layer = active.selectedLayers[li];
    if (!(layer instanceof AVLayer) || !layer.source || !(layer.source instanceof CompItem)) continue;
    var innerComp = layer.source;
    var layerProps = collectKeyframedProps(innerComp);
    if (layerProps.length > 0) groups.push({ innerComp: innerComp, props: layerProps });
  }

  if (groups.length === 0) {
    alert("No keyframed parameters found in the selected precomp layer(s).");
    return;
  }

  app.beginUndoGroup("Export Keys to EG");
  try {
    var count = 0;
    var alreadyThere = 0;

    for (var g = 0; g < groups.length; g++) {
      var innerComp = groups[g].innerComp;
      var props = groups[g].props;

      for (var k = 0; k < props.length; k++) {
        var kp = props[k];

        try {
          // Пропускаем то, что уже добавлено — иначе AE покажет
          // блокирующий варнинг "already referenced by a controller"
          if (!kp.prop.canAddToMotionGraphicsTemplate(innerComp)) {
            alreadyThere++;
            continue;
          }
          // Добавляем параметр в Essential Graphics внутренней композиции под именем "Layer | Param"
          if (kp.prop.addToMotionGraphicsTemplateAs(innerComp, kp.displayName)) count++;
        } catch (e) {
          // Пропускаем параметры которые не могут быть добавлены
        }
      }
    }

    var msg = "✅ Done!\n" + count + " keyframed parameters added to Essential Graphics.\nEdit them via \"Master Properties\" directly on the precomp layer.";
    if (alreadyThere > 0) msg += "\n" + alreadyThere + " were already present and skipped.";
    alert(msg);
  } catch (err: any) {
    alert("Error: " + err.toString());
  } finally {
    app.endUndoGroup();
  }
}

// Click — Export Keyframed Parameters to Essential Graphics.
// Ctrl+Click — Precomp Controllers (прежнее поведение кнопки, без изменений).
export function ctrlButtonClick(ctrlKey: boolean) {
  if (ctrlKey) {
    app.beginUndoGroup("Precomp Controllers");
    try { applyControllers(); } catch (e: any) { alert("Error: " + e.toString()); } finally { app.endUndoGroup(); }
  } else {
    exportKeysToEG();
  }
}

// Имя Output Module Template, которое пользователь один раз создаёт вручную
// в самом AE (Edit > Templates > Output Module... — битрейт H.264 не
// выставляется через ExtendScript: getSettings()/setSettings() у OutputModule
// не содержат ключа битрейта, это давнее и задокументированное ограничение
// API, а не пробел в типах). Настройки шаблона: Format — H.264, Target
// Bitrate ~13 Mbps, Maximum Bitrate ~16 Mbps — это укладывает в 110 МБ ролик
// длиной вплоть до 60 секунд с запасом (60с × 13 Мбит/с ≈ 97 МБ), а более
// короткие ролики на этом же битрейте получаются кратно меньше исходного
// лимита — сам битрейт от длины ролика не пересчитывается.
var OUTPUT_MODULE_TEMPLATE_NAME = "mp4 110MB";

// ID команды меню "Edit > Templates > Output Module..." — стабильный номер
// (не завязан на локализованное название пункта меню, в отличие от
// findMenuCommandId("Collect Files...") в другом месте этого файла).
var TEMPLATES_OUTPUT_MODULE_COMMAND_ID = 2150;

export function renderButtonClick(lang: string, creatorName: string, templatePath: string) {
  // Все проверки — ДО beginUndoGroup, чтобы ранний return никогда
  // не оставлял незакрытую undo-группу (это ломало повторные клики).
  var proj = app.project;
  if (!proj) { alert("Нет открытого проекта."); return; }
  var selectedItems = proj.selection;
  if (selectedItems.length === 0) { alert("Выделите хотя бы одну композицию или папку с композициями."); return; }
  var compsToRender = getCompsFromSelection(selectedItems);
  if (compsToRender.length === 0) { alert("В выделении нет ни одной композиции."); return; }

  // Предупреждаем один раз на весь клик, а не на каждую композицию —
  // иначе при пачке из 10 композиций пользователь увидел бы 10 одинаковых
  // алертов подряд.
  var warnedMissingTemplate = false;

  app.beginUndoGroup("Smart Render");
  try {
    var projectName = proj.file ? proj.file.name.replace(/\.[^\.]+$/, "") : "Untitled_Project";
    var desktopPath = Folder.desktop.fsName;
    var creator = creatorName;
    saveLangCreatorSettings(lang, creatorName);

    // Своя корневая папка на рабочем столе на каждый язык — имя проекта +
    // суффикс языка (например "07.26_CB_123_FR"). Для EN (язык по умолчанию)
    // суффикс не добавляется — папка называется просто именем проекта.
    var langBaseFolders: { [langKey: string]: Folder } = {};
    function getLangBaseFolder(langCode: string): Folder {
      if (!langBaseFolders[langCode]) {
        var folderName = langCode === "EN" ? projectName : projectName + "_" + langCode;
        var folder = new Folder(desktopPath + "/" + folderName);
        if (!folder.exists) folder.create();
        langBaseFolders[langCode] = folder;
      }
      return langBaseFolders[langCode];
    }

    for (var i = 0; i < compsToRender.length; i++) {
      var comp = compsToRender[i];
      applyVersionLabel(comp);
      // Язык в имени файла — из суффикса самой композиции (например "_EN"),
      // иначе из иерархии папок (EN/ES/... на любой глубине), а не из
      // дропдауна: так рендер нескольких языков сразу называется верно.
      // Если ни суффикса, ни языковой папки нет — язык по умолчанию EN
      // (см. getLanguageFromFolderHierarchy).
      var langCode = extractLanguageCodeFromName(comp.name) || getLanguageFromFolderHierarchy(comp.parentFolder);
      var width = comp.width;
      var height = comp.height;
      var durationSec = Math.ceil(comp.workAreaDuration);
      var versionMatch = comp.name.match(/[Vv]\d+/);
      var version = versionMatch ? ("V" + versionMatch[0].replace(/[Vv]/, "")) : "V1";
      var resolutionFolderName = width + "x" + height;
      var langBaseFolder = getLangBaseFolder(langCode);
      var resFolder = new Folder(langBaseFolder.fsName + "/" + resolutionFolderName);
      if (!resFolder.exists) resFolder.create();
      var safeFileName = projectName + "_video_" + version + "__" + resolutionFolderName + "_" + durationSec + "s_" + langCode + "_" + creator;
      var outputPath = resFolder.fsName + "/" + safeFileName + ".mp4";
      try {
        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.outputModule(1).file = new File(outputPath);
        try {
          rqItem.outputModule(1).applyTemplate(OUTPUT_MODULE_TEMPLATE_NAME);
        } catch (tmplErr: any) {
          if (!warnedMissingTemplate) {
            warnedMissingTemplate = true;
            // Готовый шаблон зашит в саму сборку (src/resources) — установить
            // его скриптом всё равно нельзя (см. комментарий выше), но можно
            // сразу открыть нужный диалог и указать точный путь до файла,
            // вместо того чтобы заставлять человека настраивать битрейт
            // вручную по инструкции.
            try { app.executeCommand(TEMPLATES_OUTPUT_MODULE_COMMAND_ID); } catch (openErr: any) {}
            alert(
              "Шаблон Output Module \"" + OUTPUT_MODULE_TEMPLATE_NAME + "\" не найден — файлы добавлены с " +
              "текущими настройками AE по умолчанию (возможно, не .mp4/H.264).\n\n" +
              "В открывшемся окне нажмите Load... и выберите файл:\n" + templatePath
            );
          }
        }
      } catch (err: any) { alert("Ошибка: " + comp.name + "\n" + err.message); }
    }
    alert("✅ Композиции добавлены в очередь рендера.");
  } catch (renderErr: any) {
    alert("Error: " + renderErr.toString());
  } finally {
    app.endUndoGroup();
  }
}

export function collectButtonClick(lang: string, ctrlKey: boolean) {
  var proj = app.project;
  if (!proj) { alert("Нет открытого проекта."); return; }

  var selection = proj.selection;
  var selectedComps = getCompsFromSelection(selection);
  if (selectedComps.length === 0) { alert("Выделите хотя бы одну композицию или папку с композициями."); return; }

  // Язык каждой выделенной композиции определяем по ЕЁ СОБСТВЕННОЙ иерархии
  // папок (EN/ES/... на любой глубине) — считаем это ДО расплющивания папок
  // ниже, пока parentFolder ещё указывает на исходное место. Так при выделении
  // сразу нескольких языковых папок Collect сохраняет разделение между языками,
  // а не смешивает всё в одну. Выбранный в дропдауне язык — только запасной
  // вариант для композиций вне языковых папок.
  var compLangs: { [id: number]: string } = {};
  for (var li = 0; li < selectedComps.length; li++) {
    var lc = selectedComps[li];
    compLangs[lc.id] = getLanguageFromFolderHierarchy(lc.parentFolder, lang);
  }

  app.beginUndoGroup("Rename + Organize + Reduce");
  try {
    // 1) Переименование выделенных композиций: V?__WxH (фактическое разрешение)
    //    + суффикс языка — свой для каждой композиции (см. compLangs выше)
    for (var r = 0; r < selectedComps.length; r++) {
      var c = selectedComps[r];
      c.name = buildProjectName(getVersionFromName(c.name), c.width, c.height) + "_" + compLangs[c.id];
      applyVersionLabel(c);
    }

    // 2) Удаление всех папок: сначала всё содержимое в корень, затем удаляем пустые папки
    var allItems = [];
    for (var a = 1; a <= proj.numItems; a++) allItems.push(proj.item(a));
    for (var b = 0; b < allItems.length; b++) {
      try { if (allItems[b].parentFolder !== proj.rootFolder) allItems[b].parentFolder = proj.rootFolder; } catch (_) {}
    }
    for (var d = 0; d < allItems.length; d++) {
      try { if (allItems[d] instanceof FolderItem) allItems[d].remove(); } catch (_) {}
    }

    // 3) Consolidate All Footage
    proj.consolidateFootage();

    // 4) Reduce Project по выделенным композициям
    proj.reduceProject(selectedComps);

    // 5) Создание иерархии папок и сортировка — каждая композиция в свою <LANG>/<WxH>
    organizeProjectForCollect(proj, compLangs);

    // 6) Лейблы по всему оставшемуся проекту: reduceProject (шаг 4) уже убрал всё,
    //    не связанное с выделенными композициями, так что оставшиеся items — это
    //    ровно выделенные комп'ы + их precomp/footage-зависимости. У всех, где в
    //    имени есть "V?", лейбл выставляется по версии; у всех остальных —
    //    явный None (см. applyVersionLabel).
    for (var pi = 1; pi <= proj.numItems; pi++) {
      var pItem = proj.item(pi);
      if (pItem instanceof CompItem) applyVersionLabel(pItem);
    }
  } catch (e: any) {
    alert("Error: " + e.toString());
    app.endUndoGroup();
    return;
  }
  app.endUndoGroup();

  // Обычный клик — только чистка проекта (переименование, сортировка по
  // папкам, consolidate, reduce), без шага 6. Ctrl+Click — то же самое,
  // плюс шаг 6 (нативный Collect Files).
  if (!ctrlKey) return;

  // 6) Сам сбор файлов — через РОДНУЮ команду AE "Collect Files", а не своим кодом.
  // У скриптового API нет способа переподключить многослойный PSD/AI с сохранением
  // привязки к конкретному слою: item.replace()/replaceWithSequence() всегда
  // подставляют файл целиком (смёрженным). У нативной команды этой проблемы нет —
  // она использует внутренний, не публикуемый механизм AE. Откроется её обычный
  // диалог — подтвердите папку и нажмите Collect, как обычно; "тихо" (без диалога)
  // эту команду со скриптовым путём назначения запустить нельзя.
  try {
    triggerNativeCollectFilesCommand();
  } catch (e2: any) {
    alert("Error: " + e2.toString());
  }
}

function triggerNativeCollectFilesCommand() {
  var collectCmdId = app.findMenuCommandId("Collect Files...");
  if (!collectCmdId) collectCmdId = 2482; // запасной ID, если поиск по имени не сработал в этой версии/локали AE
  app.executeCommand(collectCmdId);
}

// ====================== БЛОК COLLECTS (RRR_3.0) ======================

function isDescendantOf(item: Item, ancestor: FolderItem): boolean {
  var current: FolderItem | null = item.parentFolder;
  while (current) {
    if (current === ancestor) return true;
    if (current === app.project.rootFolder) return false;
    current = current.parentFolder;
  }
  return false;
}

// Полностью убирает импортированную ветку из проекта: сначала все итемы
// (комп/футаж) внутри нее, затем сами папки — тем же приёмом
// reparent-to-root-then-remove, что уже используется в collectButtonClick
// шаг 2 (удалять непустую папку небезопасно), но по явному списку потомков
// importedRoot, а не по всему проекту.
function removeImportedFolder(importedRoot: FolderItem) {
  var proj = app.project;
  var folders: FolderItem[] = [];
  var items: any[] = [];
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (it === importedRoot) continue;
    if (isDescendantOf(it, importedRoot)) {
      if (it instanceof FolderItem) folders.push(it);
      else items.push(it);
    }
  }
  for (var a = 0; a < items.length; a++) { try { items[a].remove(); } catch (_) {} }
  for (var b = 0; b < folders.length; b++) { try { folders[b].parentFolder = proj.rootFolder; } catch (_) {} }
  for (var c = 0; c < folders.length; c++) { try { folders[c].remove(); } catch (_) {} }
  try { importedRoot.remove(); } catch (_) {}
}

// Соглашение об именах между коллектами не унифицировано (новая формула
// "V1__WxH_LANG", старая "v1"/"v1_1350" без языка вообще, и т.д.) — вместо
// того чтобы гадать паттерном, какая композиция "версия", а какая чья-то
// вложенная прекомпозиция, показываем ВСЕ композиции коллекта и даём
// пользователю самому отметить нужные. isNested — не фильтр, а подсказка
// для сортировки в панели (обычно нужны именно НЕ вложенные).
function collectAllCompsUnder(root: FolderItem): Array<{ compName: string; w: number; h: number; lang: string; isNested: boolean }> {
  var proj = app.project;
  var comps: CompItem[] = [];
  var usedAsLayerSource: { [id: number]: boolean } = {};

  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (!(it instanceof CompItem) || !isDescendantOf(it, root)) continue;
    comps.push(it);
    for (var li = 1; li <= it.numLayers; li++) {
      var layer = it.layer(li);
      if (layer instanceof AVLayer && layer.source && layer.source instanceof CompItem) {
        usedAsLayerSource[layer.source.id] = true;
      }
    }
  }

  var result: Array<{ compName: string; w: number; h: number; lang: string; isNested: boolean }> = [];
  for (var c = 0; c < comps.length; c++) {
    var comp = comps[c];
    result.push({
      compName: comp.name,
      w: comp.width,
      h: comp.height,
      lang: getLanguageFromFolderHierarchy(comp.parentFolder, "EN"),
      isNested: !!usedAsLayerSource[comp.id],
    });
  }
  return result;
}

// Заглянуть внутрь коллекта БЕЗ следа: импортируем .aep целиком, читаем
// список ВСЕХ композиций (см. collectAllCompsUnder — соглашение об именах
// между коллектами не унифицировано, поэтому не фильтруем, а показываем всё
// и даём выбрать), тут же полностью убираем импортированное. Текущий живой
// проект пользователя в итоге не меняется вообще.
export function listCollectVersions(aepPath: string): {
  ok: boolean;
  compositions: Array<{ compName: string; w: number; h: number; lang: string; isNested: boolean }>;
  message?: string;
} {
  var proj = app.project;
  if (!proj) return { ok: false, compositions: [], message: "Нет открытого проекта." };

  var file = new File(aepPath);
  if (!file.exists) return { ok: false, compositions: [], message: "Файл не найден: " + aepPath };

  var importedRoot: FolderItem;
  app.beginSuppressDialogs();
  try {
    var importOptions = new ImportOptions(file);
    importOptions.importAs = ImportAsType.PROJECT;
    importedRoot = proj.importFile(importOptions) as FolderItem;
    importedRoot.parentFolder = proj.rootFolder;
  } catch (e: any) {
    app.endSuppressDialogs(false);
    return { ok: false, compositions: [], message: "Не удалось открыть коллект: " + e.toString() };
  }
  app.endSuppressDialogs(false);

  var compositions: Array<{ compName: string; w: number; h: number; lang: string; isNested: boolean }>;
  try {
    compositions = collectAllCompsUnder(importedRoot);
  } finally {
    removeImportedFolder(importedRoot);
  }
  return { ok: true, compositions: compositions };
}

// Раскладка итемов, оставленных из импортированного коллекта, ПО УЖЕ
// СУЩЕСТВУЮЩИМ папкам живого проекта (Assets/Audios/Comps/Images/layers/Videos
// + <LANG>/<WxH>) — переиспользуя их, если уже есть, создавая только при
// отсутствии. Специально НЕ переиспользует organizeProjectForCollect: та
// функция всегда создаёт папки заново и рассчитана на то, что весь текущий
// проект — это и есть собираемый коллект (так и остаётся для существующей
// кнопки Collect, без изменений). Здесь же живой проект пользователя уже
// содержит свой контент, который нельзя ни дублировать папками, ни трогать —
// поэтому классификация продублирована отдельно, а не через общий код.
function organizeImportedItemsForCollect(
  proj: Project,
  items: any[],
  selectedCompLangs: { [id: number]: string }
) {
  function getOrCreateFolder(name: string, parent: FolderItem): FolderItem {
    for (var i = 1; i <= proj.numItems; i++) {
      var it = proj.item(i);
      if (it instanceof FolderItem && it.parentFolder === parent && it.name === name) return it;
    }
    var fld = proj.items.addFolder(name);
    fld.parentFolder = parent;
    return fld;
  }
  function getExt(item: any) {
    var fileName = "";
    try { fileName = (item.file && item.file.name) ? item.file.name : item.name; }
    catch (_) { fileName = item.name; }
    var parts = fileName.toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : "";
  }
  function contains(list: string[], value: string) {
    for (var i = 0; i < list.length; i++) if (list[i] === value) return true;
    return false;
  }

  var stillExts = [
    "ai", "bmp", "cin", "cr2", "crw", "dcr", "dng", "dpx", "eps", "erf", "exr", "gif", "heic", "heif",
    "hdr", "iff", "jpeg", "jpg", "mrw", "nef", "orf", "pcx", "pdf", "pef", "pic", "png", "ps", "psd",
    "raf", "raw", "rle", "sgi", "sr2", "srf", "svg", "tga", "tif", "tiff", "vda", "vst", "x3f"
  ];
  var audioExts = ["aac", "aif", "aiff", "flac", "m4a", "mp2", "mp3", "ogg", "wav", "wma"];
  var videoExts = [
    "3g2", "3gp", "amc", "avi", "dmx", "dv", "f4v", "flv", "gif", "hevc", "m2p", "m2t", "m2ts", "m2v",
    "m4v", "mkv", "mod", "mov", "mp4", "mpe", "mpeg", "mpg", "mts", "mxf", "r3d", "rm", "swf", "ts",
    "vob", "wmv"
  ];

  var assets = getOrCreateFolder("Assets", proj.rootFolder);
  var fAudios = getOrCreateFolder("Audios", assets);
  var fComps = getOrCreateFolder("Comps", assets);
  var fImages = getOrCreateFolder("Images", assets);
  var fLayers = getOrCreateFolder("layers", assets);
  var fVideos = getOrCreateFolder("Videos", assets);

  var langFolders: { [lang: string]: FolderItem } = {};
  function getLangFolder(lang: string) {
    if (!langFolders[lang]) langFolders[lang] = getOrCreateFolder(lang, proj.rootFolder);
    return langFolders[lang];
  }
  var resFolders: { [key: string]: FolderItem } = {};
  function getResFolder(lang: string, w: number, h: number) {
    var key = lang + "|" + w + "x" + h;
    if (!resFolders[key]) resFolders[key] = getOrCreateFolder(w + "x" + h, getLangFolder(lang));
    return resFolders[key];
  }

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it instanceof CompItem) {
      var compLang = selectedCompLangs[it.id];
      if (compLang) it.parentFolder = getResFolder(compLang, it.width, it.height);
      else it.parentFolder = fComps;
      continue;
    }
    if (it instanceof FootageItem) {
      if (it.mainSource instanceof SolidSource || !it.file) { it.parentFolder = fLayers; continue; }
      var ext = getExt(it);
      if (it.hasAudio && !it.hasVideo) it.parentFolder = fAudios;
      else if (it.mainSource && it.mainSource.isStill) it.parentFolder = fImages;
      else if (it.hasVideo) it.parentFolder = fVideos;
      else if (contains(audioExts, ext)) it.parentFolder = fAudios;
      else if (contains(stillExts, ext)) it.parentFolder = fImages;
      else if (contains(videoExts, ext)) it.parentFolder = fVideos;
      else it.parentFolder = fLayers;
    }
  }
}

// Реальный импорт: те же корневые версии, что показывает listCollectVersions,
// теперь оставляем насовсем — раскладываем по существующим папкам живого
// проекта, всё остальное из импорта удаляем, оставленные версии выделяем.
export function prepareCollectImport(
  aepPath: string,
  targets: Array<{ compName: string; lang: string }>,
  fallbackLang: string
): { ok: boolean; keptCompNames: string[]; missingCompNames: string[]; footagePaths: string[]; message?: string } {
  var proj = app.project;
  var targetCompNames: string[] = [];
  for (var tn = 0; tn < targets.length; tn++) targetCompNames.push(targets[tn].compName);
  if (!proj) return { ok: false, keptCompNames: [], missingCompNames: targetCompNames, footagePaths: [], message: "Нет открытого проекта." };

  var file = new File(aepPath);
  if (!file.exists) return { ok: false, keptCompNames: [], missingCompNames: targetCompNames, footagePaths: [], message: "Файл не найден: " + aepPath };

  var importedRoot: FolderItem;
  app.beginSuppressDialogs();
  try {
    var importOptions = new ImportOptions(file);
    importOptions.importAs = ImportAsType.PROJECT;
    importedRoot = proj.importFile(importOptions) as FolderItem;
    importedRoot.parentFolder = proj.rootFolder;
  } catch (e: any) {
    app.endSuppressDialogs(false);
    return { ok: false, keptCompNames: [], missingCompNames: targetCompNames, footagePaths: [], message: "Не удалось открыть коллект: " + e.toString() };
  }
  app.endSuppressDialogs(false);

  app.beginUndoGroup("Импорт коллекта");
  try {
    var langByName: { [name: string]: string } = {};
    for (var tl = 0; tl < targets.length; tl++) langByName[targets[tl].compName] = targets[tl].lang;

    var targetComps: CompItem[] = [];
    var missing: string[] = [];
    for (var t = 0; t < targetCompNames.length; t++) {
      var found: CompItem | null = null;
      for (var i = 1; i <= proj.numItems; i++) {
        var it = proj.item(i);
        if (it instanceof CompItem && it.name === targetCompNames[t] && isDescendantOf(it, importedRoot)) {
          found = it;
          break;
        }
      }
      if (found) targetComps.push(found); else missing.push(targetCompNames[t]);
    }

    if (targetComps.length === 0) {
      removeImportedFolder(importedRoot);
      app.endUndoGroup();
      return { ok: false, keptCompNames: [], missingCompNames: missing, footagePaths: [], message: "Ни одна из запрошенных версий не найдена в коллекте." };
    }

    // Полный граф зависимостей (вложенные precomp'ы) каждой целевой версии.
    var keepIDs: { [id: number]: boolean } = {};
    var keepComps: CompItem[] = [];
    for (var g = 0; g < targetComps.length; g++) {
      var graph = collectCompGraph(targetComps[g]);
      for (var gi = 0; gi < graph.length; gi++) {
        if (!keepIDs[graph[gi].id]) { keepIDs[graph[gi].id] = true; keepComps.push(graph[gi]); }
      }
    }

    // Футажи, на которые напрямую ссылаются слои внутри keepComps.
    var keepFootageIDs: { [id: number]: boolean } = {};
    var keepFootage: FootageItem[] = [];
    for (var kc = 0; kc < keepComps.length; kc++) {
      var comp = keepComps[kc];
      for (var li = 1; li <= comp.numLayers; li++) {
        var layer = comp.layer(li);
        if (layer instanceof AVLayer && layer.source && layer.source instanceof FootageItem) {
          if (!keepFootageIDs[layer.source.id]) { keepFootageIDs[layer.source.id] = true; keepFootage.push(layer.source); }
        }
      }
    }

    // Язык каждой композиции панель уже определила на этапе просмотра
    // (listCollectVersions, по иерархии папок реального импорта) и передаёт
    // явно — тут его заново не вычисляем, соглашение об именах между
    // коллектами разное и имени самого по себе недостаточно.
    var compLangs: { [id: number]: string } = {};
    for (var tc = 0; tc < targetComps.length; tc++) {
      compLangs[targetComps[tc].id] = langByName[targetComps[tc].name] || fallbackLang;
    }

    var keepAll: any[] = keepComps.concat(keepFootage as any);
    organizeImportedItemsForCollect(proj, keepAll, compLangs);

    // Всё остальное, что пришло с импортом и не потребовалось, — удаляем.
    var toRemoveItems: any[] = [];
    var toRemoveFolders: FolderItem[] = [];
    for (var r = 1; r <= proj.numItems; r++) {
      var ritem = proj.item(r);
      if (ritem === importedRoot) continue;
      if (!isDescendantOf(ritem, importedRoot)) continue;
      if (keepIDs[ritem.id] || keepFootageIDs[ritem.id]) continue;
      if (ritem instanceof FolderItem) toRemoveFolders.push(ritem); else toRemoveItems.push(ritem);
    }
    for (var ri = 0; ri < toRemoveItems.length; ri++) { try { toRemoveItems[ri].remove(); } catch (_) {} }
    for (var rf = 0; rf < toRemoveFolders.length; rf++) { try { toRemoveFolders[rf].parentFolder = proj.rootFolder; } catch (_) {} }
    for (var rf2 = 0; rf2 < toRemoveFolders.length; rf2++) { try { toRemoveFolders[rf2].remove(); } catch (_) {} }
    try { importedRoot.remove(); } catch (_) {}

    // Выделяем только оставленные целевые версии, снимая выделение со всего
    // остального в проекте — важно для финального шага Collect Files
    // ("For Selected Comps").
    for (var s = 1; s <= proj.numItems; s++) proj.item(s).selected = false;
    for (var s2 = 0; s2 < targetComps.length; s2++) targetComps[s2].selected = true;

    // Реальные пути файлов-футажей, использованных в оставленных версиях —
    // для режима "Скачивание" в панели: она докачивает именно эти файлы
    // перед тем как собрать мини-коллект, а не полагается на то, что Collect
    // Files сама быстро скачает их с Drive по требованию.
    var footagePaths: string[] = [];
    for (var fp = 0; fp < keepFootage.length; fp++) {
      try { if (keepFootage[fp].file) footagePaths.push(keepFootage[fp].file.fsName); } catch (_) {}
    }

    var keptCompNames: string[] = [];
    for (var kn = 0; kn < targetComps.length; kn++) keptCompNames.push(targetComps[kn].name);

    app.endUndoGroup();
    return { ok: true, keptCompNames: keptCompNames, missingCompNames: missing, footagePaths: footagePaths };
  } catch (e: any) {
    app.endUndoGroup();
    return { ok: false, keptCompNames: [], missingCompNames: targetCompNames, footagePaths: [], message: "Error: " + e.toString() };
  }
}

// Собрать только что импортированные (и уже выделенные в prepareCollectImport)
// композиции в отдельный мини-коллект — той же нативной командой, что и
// кнопка Collect. Если текущий проект ещё не сохранён, AE сама попросит
// сохранить его перед Collect Files (обычное поведение, не подавляем) —
// именно поэтому мини-коллект и ложится "рядом с сохранённым проектом".
export function triggerCollectFilesDialog(): { ok: boolean; message?: string } {
  try {
    triggerNativeCollectFilesCommand();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.toString() };
  }
}

// Используется и в "Облаке" (просто зафиксировать результат импорта на
// диске), и в "Скачивании" (перед сборкой Collect Files — иначе, если проект
// не сохранён, эту же необходимость сохранить обнаружит внутренняя логика
// самого Collect Files и покажет диалог со стандартным дефолтным именем
// "Untitled Project", который скриптом не поменять). Если проект уже имеет
// файл — тихое сохранение поверх него. Если ещё ни разу не сохранялся —
// диалог "Сохранить как", но с ПРЕДЛОЖЕННЫМ именем (searchQuery, то что
// пользователь ввёл в поиск коллекта) вместо родового "Untitled Project" —
// File.saveDlg() показывает нативный диалог с именем ТОГО File-объекта, на
// котором его вызвали, как значением по умолчанию в поле "Имя файла".
export function saveCurrentProject(suggestedName: string): { ok: boolean; message?: string } {
  var proj = app.project;
  if (!proj) return { ok: false, message: "Нет открытого проекта." };
  try {
    if (proj.file) {
      proj.save();
      return { ok: true };
    }
    var safeName = (suggestedName || "Untitled Project").replace(/[\\\/:*?"<>|]/g, "_");

    // Открываем диалог не на Рабочем столе, а в папке, где сохраняли в
    // прошлый раз — так все коллекты, сохранённые за сессию (и между
    // сессиями), тяготеют к одному месту, а не разлетаются по системе.
    var lastFolder = "";
    if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY_LAST_SAVE_FOLDER)) {
      lastFolder = app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY_LAST_SAVE_FOLDER);
    }
    var startFolder = lastFolder && new Folder(lastFolder).exists ? lastFolder : Folder.desktop.fsName;

    var defaultFile = new File(startFolder + "/" + safeName + ".aep");
    var chosen = defaultFile.saveDlg("Сохранить проект как:");
    if (!chosen) return { ok: false, message: "Сохранение отменено." };
    proj.save(chosen);
    app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY_LAST_SAVE_FOLDER, chosen.parent.fsName);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.toString() };
  }
}

// Режим "Скачивание" в панели: файл уже скопирован Node-стороной в локальную
// папку рядом с текущим проектом — здесь переподключаем футаж-итем (найденный
// по СТАРОМУ, ещё Drive-пути) на эту новую локальную копию. Без этого шага
// копирование файла на диск ничего не меняло бы — Collect Files всё равно
// читал бы исходный (Drive) путь, всё ещё прописанный в самом футаж-итеме.
export function relinkFootage(oldPath: string, newPath: string): { ok: boolean; message?: string } {
  var proj = app.project;
  if (!proj) return { ok: false, message: "Нет открытого проекта." };

  var newFile = new File(newPath);
  if (!newFile.exists) return { ok: false, message: "Локальная копия не найдена: " + newPath };

  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (it instanceof FootageItem && it.file && it.file.fsName === oldPath) {
      try {
        it.replace(newFile);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, message: e.toString() };
      }
    }
  }
  return { ok: false, message: "Футаж-итем с путём " + oldPath + " не найден в текущем проекте." };
}
