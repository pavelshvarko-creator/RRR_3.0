import { useEffect, useState } from "react";
import { csi, subscribeBackgroundColor, evalTS } from "../lib/utils/bolt";
import { ns } from "../../shared/shared";
import { IconButton } from "./IconButton";
import { CollectsRequestBar } from "./CollectsRequestBar";
import { ButtonSlot } from "./ButtonSlot";
import { CustomButtonView } from "./CustomButtonView";
import { AddButtonDialog } from "./AddButtonDialog";
import { SetupDialog } from "./SetupDialog";
import { runCustomButtonAction } from "../lib/buttons/runAction";
import { publishButtonToHistory } from "../lib/buttons/history";
import type { ButtonSlot as ButtonSlotType, CustomButtonDef, ButtonHistoryEntry } from "../../shared/customButtons";
import { DEFAULT_BUTTONS_HISTORY_PATH } from "../../shared/defaults";
import "./main.scss";

import icon9x16 from "../assets/RRR/9x16.png";
import icon9x16Hover from "../assets/RRR/9x16_1.png";
import icon9x16Pressed from "../assets/RRR/9x16_2.png";
import icon4x3 from "../assets/RRR/4x3.png";
import icon4x3Hover from "../assets/RRR/4x3_1.png";
import icon4x3Pressed from "../assets/RRR/4x3_2.png";
import icon1x1 from "../assets/RRR/1x1.png";
import icon1x1Hover from "../assets/RRR/1x1_1.png";
import icon1x1Pressed from "../assets/RRR/1x1_2.png";
import icon16x9 from "../assets/RRR/16x9.png";
import icon16x9Hover from "../assets/RRR/16x9_1.png";
import icon16x9Pressed from "../assets/RRR/16x9_2.png";
import iconCtrl from "../assets/RRR/ctrl.png";
import iconCtrlHover from "../assets/RRR/ctrl_1.png";
import iconCtrlPressed from "../assets/RRR/ctrl_2.png";
import iconRender from "../assets/RRR/Render.png";
import iconRenderHover from "../assets/RRR/Render_1.png";
import iconRenderPressed from "../assets/RRR/Render_2.png";
import iconCollect from "../assets/RRR/Collect.png";
import iconCollectHover from "../assets/RRR/Collect_1.png";
import iconCollectPressed from "../assets/RRR/Collect_2.png";
import iconPlus from "../assets/RRR/+.png";
import iconPlusHover from "../assets/RRR/+_1.png";
import iconPlusPressed from "../assets/RRR/+_2.png";

import { LANG_CODES } from "../../shared/langCodes";

// Без перетаскивания порядок встроенных кнопок незачем хранить в
// настройках — он всегда фиксирован. Пользовательские кнопки просто
// добавляются после них, в порядке создания.
const BUILTIN_ORDER = ["9x16", "4x3", "1x1", "16x9", "ctrl", "collect", "render"];
const DEFAULT_LAYOUT: ButtonSlotType[] = BUILTIN_ORDER.map((key) => ({ kind: "builtin", key }));

function slotKey(slot: ButtonSlotType): string {
  return slot.kind === "builtin" ? `builtin:${slot.key}` : `custom:${slot.id}`;
}

// Приводит загруженную (возможно, ещё с беспорядком от старого перетаскивания)
// раскладку к строгому виду: встроенные кнопки — всегда в BUILTIN_ORDER,
// пользовательские — следом, в том относительном порядке, что уже был.
function normalizeLayout(parsed: ButtonSlotType[]): ButtonSlotType[] {
  const customSlots = parsed.filter((s) => s.kind === "custom");
  return [...DEFAULT_LAYOUT, ...customSlots];
}

export const App = () => {
  const [bgColor, setBgColor] = useState("#282c34");
  const [lang, setLang] = useState("EN");
  const [name, setName] = useState("");
  const [customLangMode, setCustomLangMode] = useState(false);
  const [customLangValue, setCustomLangValue] = useState("");
  const [useIcons, setUseIcons] = useState(true);

  // Раскладка кнопок (встроенные + пользовательские, один порядок на всех —
  // drag-and-drop и удаление работают одинаково для любой кнопки) и сами
  // определения пользовательских кнопок — персистятся отдельно.
  const [layout, setLayout] = useState<ButtonSlotType[]>(DEFAULT_LAYOUT);
  const [customButtons, setCustomButtons] = useState<Record<string, CustomButtonDef>>({});
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // null, пока не проверили app.settings — не мигаем диалогом первого запуска
  // раньше времени. true — ника или пути к коллектам ещё нет, показываем
  // SetupDialog; false — оба значения уже сохранены (обычный случай при любом
  // перезапуске AE и при обновлении через кнопку "Обновить" — само обновление
  // трогает только файлы расширения, а не app.settings, так что все ранее
  // введённые данные просто продолжают использоваться без повторного ввода).
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    if (window.cep) {
      subscribeBackgroundColor(setBgColor);
    }
    // Ник и путь к коллектам раньше запрашивались двумя независимыми
    // window.prompt в разное время (один — здесь, другой — при монтировании
    // CollectsRequestBar). Теперь это одно окно сразу с обоими полями —
    // рендерится ниже, если хоть одно из значений не сохранено.
    Promise.all([evalTS("getSavedCreatorName"), evalTS("getSavedCollectsRoot")]).then(([savedName, savedRoot]) => {
      if (savedName) setName(savedName);
      setSetupNeeded(!savedName || !savedRoot);
    });

    // Тумблер "иконки / стандартные кнопки" переключается в гайде, но
    // применяется здесь, в основной панели — читаем сохранённое значение
    // при каждом открытии панели.
    evalTS("getIconModeSetting").then((saved) => setUseIcons(saved !== false));

    // Раскладка кнопок и пользовательские кнопки — из app.settings; при
    // отсутствии/повреждении сохранённого JSON тихо откатываемся к дефолту,
    // не мешая открытию панели.
    Promise.all([evalTS("getButtonLayout"), evalTS("getCustomButtons")]).then(([layoutJson, buttonsJson]) => {
      try {
        if (layoutJson) {
          const parsed = JSON.parse(layoutJson);
          if (Array.isArray(parsed) && parsed.length > 0) setLayout(normalizeLayout(parsed));
        }
      } catch (_) {}
      try {
        if (buttonsJson) {
          const parsed = JSON.parse(buttonsJson);
          if (parsed && typeof parsed === "object") setCustomButtons(parsed);
        }
      } catch (_) {}
      setLayoutLoaded(true);
    });

    // Тихая автопроверка обновлений при каждом запуске панели (AE запущен/
    // перезапущен). Модуль с обновлением подключаем динамически (не в
    // самом верху файла), чтобы его код (доступ к Node.js fs/path) не мог
    // сломать самую первую отрисовку панели, если что-то пойдёт не так.
    // Ошибки самой проверки (например нет интернета) не показываем, чтобы
    // не мешать открытию панели.
    import("../lib/utils/update")
      // allowElevation: false — тихая проверка никогда не должна сама
      // всплывать системным запросом прав администратора (UAC).
      .then(({ checkAndAutoInstallUpdate }) => checkAndAutoInstallUpdate(false))
      .then((res) => {
        if (res.installed) {
          alert(
            "✅ Установлено обновление до версии " + res.version + ".\n" +
            "Перезапустите After Effects, чтобы изменения вступили в силу."
          );
        }
      })
      .catch((e) => {
        // Тихая автопроверка — при неудаче (нет интернета, файл временно занят
        // открытым окном гайда и т.п.) молча логируем и просто повторим при
        // следующем открытии панели, а не дёргаем пользователя алертом на
        // каждый запуск AE. Явную ошибку показываем только по кнопке
        // "Обновить" в гайде (см. GuideApp.tsx) — там это осознанное действие.
        console.error("Автообновление: проверка не удалась", e);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сохраняем раскладку/кнопки при каждом изменении — но только после того,
  // как первичная загрузка из настроек уже случилась, иначе дефолтная
  // раскладка успела бы затереть сохранённую до того, как та подгрузится.
  useEffect(() => {
    if (!layoutLoaded) return;
    evalTS("saveButtonLayout", JSON.stringify(layout));
  }, [layout, layoutLoaded]);

  useEffect(() => {
    if (!layoutLoaded) return;
    evalTS("saveCustomButtons", JSON.stringify(customButtons));
  }, [customButtons, layoutLoaded]);

  const handleCropClick = (key: string, e: React.MouseEvent) => {
    evalTS("cropButtonClick", key, e.ctrlKey, e.altKey);
  };

  const handleCtrlClick = (e: React.MouseEvent) => {
    evalTS("ctrlButtonClick", e.ctrlKey);
  };

  const handleRenderClick = () => {
    // Путь до зашитого в сборку Output Module Template (см. cep.config.ts
    // copyAssets) — если у пользователя такого шаблона ещё нет в самом AE,
    // renderButtonClick подскажет этот путь для Load... вместо того чтобы
    // заставлять настраивать битрейт H.264 вручную (это и так нельзя задать
    // скриптом — см. комментарий в aeft.ts).
    const templatePath = `${csi.getSystemPath("extension")}/resources/mp4 110MB.aom`;
    evalTS("renderButtonClick", lang, name, templatePath);
  };

  const handleCollectClick = (e: React.MouseEvent) => {
    evalTS("collectButtonClick", lang, e.ctrlKey);
  };

  const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    if (newLang === "CUSTOM") {
      setCustomLangValue("");
      setCustomLangMode(true);
      return;
    }
    evalTS("onLanguageChange", newLang, lang, name).then((success) => {
      if (success) setLang(newLang);
    });
  };

  const commitCustomLang = () => {
    const code = customLangValue.toUpperCase();
    setCustomLangMode(false);
    if (code.length !== 2) return;
    evalTS("onLanguageChange", code, lang, name).then((success) => {
      if (success) setLang(code);
    });
  };

  const handleSetupSubmit = (enteredName: string, collectsRoot: string) => {
    setName(enteredName);
    evalTS("saveCreatorName", enteredName, lang);
    evalTS("saveCollectsRoot", collectsRoot);
    setSetupNeeded(false);
  };

  const handleInfoClick = () => {
    // Возврат к rrr.requestOpenExtension — это единственный способ открытия,
    // при котором гайд реально отрисовывался (проверено). Открытие через
    // app.executeCommand (нативная команда меню) рендерит пустое окно —
    // рабочая причина не найдена, но эмпирически он ломает рендер здесь.
    // autoVisible: true у панели гайда (cep.config.ts) гарантирует, что
    // экземпляр панели уже существует к моменту клика — так что "не может
    // создать с нуля" ограничение requestOpenExtension больше не мешает.
    csi.requestOpenExtension(`${ns}.guide`, "");
  };

  // Удаление — одинаково для встроенных и пользовательских кнопок (ПКМ →
  // "Удалить"). Перетаскивание для смены порядка не реализовано — см.
  // ButtonSlot.tsx.
  const handleDeleteSlot = (id: string) => {
    setLayout((prev) => prev.filter((s) => slotKey(s) !== id));
  };

  // И создание, и редактирование публикуются в общую историю — история
  // хранит вообще все версии кнопки, ничего не перезаписывая и не подчищая
  // (не бывает "приватных" кнопок, вся история видна всем без исключения).
  // У записи истории — свой отдельный id (не def.id): иначе две версии
  // одной и той же кнопки в списке истории имели бы одинаковый key.
  const handleAddCustomButton = async (def: CustomButtonDef, isEdit: boolean) => {
    setCustomButtons((prev) => ({ ...prev, [def.id]: def }));
    if (!isEdit) setLayout((prev) => [...prev, { kind: "custom", id: def.id }]);
    setDialogOpen(false);
    setEditingId(null);

    // Раньше это была цепочка вложенных .then() без единого catch — если
    // сам evalTS (getSavedCreatorName/getSavedButtonsHistoryPath) отклонял
    // промис, публикация тихо не запускалась вообще, без единого сообщения
    // об ошибке. Один async/await с общим try/catch гарантирует, что ЛЮБОЙ
    // сбой на всём пути долетит до alert ниже, а не потеряется молча.
    try {
      const author = await evalTS("getSavedCreatorName");
      let targetPath = await evalTS("getSavedButtonsHistoryPath");
      if (!targetPath) {
        const entered = window.prompt(
          "Путь к папке для истории кнопок на Google Drive (каждая кнопка — отдельный файл в ней):",
          DEFAULT_BUTTONS_HISTORY_PATH
        );
        if (!entered) return;
        targetPath = entered;
        evalTS("saveButtonsHistoryPath", entered);
      }
      const entry: ButtonHistoryEntry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        author: author || "?",
        tooltip: def.tooltip,
        description: def.description,
        descriptionGifDataUrl: def.descriptionGifDataUrl,
        action: def.action,
        iconDataUrl: def.iconDataUrl,
        iconWidth: def.iconWidth,
        addedAt: Date.now(),
      };
      await publishButtonToHistory(targetPath, entry);
    } catch (e: any) {
      alert("Не удалось опубликовать кнопку в общей истории: " + (e?.message || String(e)));
    }
  };

  const handleImportFromHistory = (entry: ButtonHistoryEntry) => {
    const def: CustomButtonDef = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      tooltip: entry.tooltip,
      description: entry.description,
      descriptionGifDataUrl: entry.descriptionGifDataUrl,
      action: entry.action,
      iconDataUrl: entry.iconDataUrl,
      iconWidth: entry.iconWidth,
      author: entry.author,
    };
    setCustomButtons((prev) => ({ ...prev, [def.id]: def }));
    setLayout((prev) => [...prev, { kind: "custom", id: def.id }]);
  };

  const renderBuiltin = (key: string) => {
    switch (key) {
      case "9x16":
        return (
          <IconButton
            base={icon9x16}
            hover={icon9x16Hover}
            pressed={icon9x16Pressed}
            label="9:16"
            useIcons={useIcons}
            title="1080x1920&#10;&#10;Клик — ресайз в Project&#10;Ctrl+Клик — ресайз на Timeline&#10;Alt+Клик — новая композиция"
            onClick={(e) => handleCropClick("9x16", e)}
          />
        );
      case "4x3":
        return (
          <IconButton
            base={icon4x3}
            hover={icon4x3Hover}
            pressed={icon4x3Pressed}
            label="4:3"
            useIcons={useIcons}
            title="1080x1350&#10;&#10;Клик — ресайз в Project&#10;Ctrl+Клик — ресайз на Timeline&#10;Alt+Клик — новая композиция"
            onClick={(e) => handleCropClick("4x3", e)}
          />
        );
      case "1x1":
        return (
          <IconButton
            base={icon1x1}
            hover={icon1x1Hover}
            pressed={icon1x1Pressed}
            label="1:1"
            useIcons={useIcons}
            title="1080x1080&#10;&#10;Клик — ресайз в Project&#10;Ctrl+Клик — ресайз на Timeline&#10;Alt+Клик — блюр-фон билд (источник 1080x1350)"
            onClick={(e) => handleCropClick("1x1", e)}
          />
        );
      case "16x9":
        return (
          <IconButton
            base={icon16x9}
            hover={icon16x9Hover}
            pressed={icon16x9Pressed}
            label="16:9"
            useIcons={useIcons}
            title="1920x1080&#10;&#10;Клик — ресайз в Project&#10;Ctrl+Клик — ресайз на Timeline&#10;Alt+Клик — блюр-фон билд (источник 1080x1350)"
            onClick={(e) => handleCropClick("16x9", e)}
          />
        );
      case "ctrl":
        return (
          <IconButton
            base={iconCtrl}
            hover={iconCtrlHover}
            pressed={iconCtrlPressed}
            label="ctrl"
            useIcons={useIcons}
            title="Клик — &quot;достает&quot; ключи через Essential Graphics&#10;Ctrl+Клик — &quot;достает&quot; Scale и Position"
            onClick={handleCtrlClick}
          />
        );
      case "collect":
        return (
          <IconButton
            base={iconCollect}
            hover={iconCollectHover}
            pressed={iconCollectPressed}
            label="collect"
            useIcons={useIcons}
            title="Клик — чистка проекта&#10;Ctrl+Клик — чистка и сборка коллекта"
            onClick={handleCollectClick}
          />
        );
      case "render":
        return (
          <IconButton
            base={iconRender}
            hover={iconRenderHover}
            pressed={iconRenderPressed}
            label="render"
            useIcons={useIcons}
            onClick={handleRenderClick}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app" style={{ backgroundColor: bgColor }}>
      <div className="rrr-panel">
        {layout.map((slot) => {
          const id = slotKey(slot);
          const content = slot.kind === "builtin" ? renderBuiltin(slot.key) : customButtons[slot.id] ? <CustomButtonView def={customButtons[slot.id]} onRun={runCustomButtonAction} /> : null;
          if (!content) return null;
          return (
            <ButtonSlot key={id} slotId={id} onDelete={handleDeleteSlot}
              onEdit={
                slot.kind === "custom"
                  ? () => {
                      setEditingId(slot.id);
                      setDialogOpen(true);
                    }
                  : undefined
              }
            >
              {content}
            </ButtonSlot>
          );
        })}

        {customLangMode ? (
          <input
            className="rrr-lang-select rrr-lang-custom-input"
            autoFocus
            maxLength={2}
            value={customLangValue}
            onChange={(e) => setCustomLangValue(e.target.value.toUpperCase())}
            onBlur={commitCustomLang}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCustomLang();
              if (e.key === "Escape") setCustomLangMode(false);
            }}
          />
        ) : (
          <span className="rrr-lang-select-wrap">
            <select className="rrr-lang-select" value={lang} onChange={handleLangChange} title="Выделите папку в Project">
              {LANG_CODES.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
              {LANG_CODES.indexOf(lang) === -1 && <option value={lang}>{lang}</option>}
              <option value="CUSTOM">other</option>
            </select>
            <span className="rrr-lang-select-arrow" />
          </span>
        )}

        {/* CollectsRequestBar сам запрашивает getSavedCollectsRoot при монтировании
            (с собственным window.prompt-фолбэком на случай, если путь пропадёт
            позже) — монтируем её только после того, как SetupDialog ниже уже
            гарантированно сохранил путь, чтобы её фолбэк не сработал раньше и
            не показал второе, отдельное окно поверх первого запуска. */}
        {setupNeeded === false && (
          <CollectsRequestBar useIcons={useIcons}>
            <IconButton
              base={iconPlus}
              hover={iconPlusHover}
              pressed={iconPlusPressed}
              label="+"
              useIcons={useIcons}
              title="Добавить кнопку"
              onClick={() => setDialogOpen(true)}
            />
            <span className="rrr-info-btn-slot">
              <button className="rrr-info-btn" title="info" onClick={handleInfoClick}>
                i
              </button>
            </span>
          </CollectsRequestBar>
        )}
      </div>

      {dialogOpen && (
        <AddButtonDialog
          editingDef={editingId ? customButtons[editingId] : undefined}
          onClose={() => {
            setDialogOpen(false);
            setEditingId(null);
          }}
          onSave={handleAddCustomButton}
          onImportFromHistory={handleImportFromHistory}
        />
      )}

      {setupNeeded && <SetupDialog onSubmit={handleSetupSubmit} />}
    </div>
  );
};
