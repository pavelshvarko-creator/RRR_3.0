import { useState } from "react";
import type { CustomButtonDef, CustomButtonAction, ButtonHistoryEntry } from "../../shared/customButtons";
import { loadAndScaleIcon, readFileAsBase64, readImageAsDataURL } from "../lib/buttons/icon";
import { ButtonHistoryList } from "./ButtonHistoryList";

type ActionKind = CustomButtonAction["kind"];

const ACTION_LABELS: Record<ActionKind, string> = {
  script: "Скрипт (ExtendScript)",
  expression: "Expression",
  preset: "Пресет (.ffx)",
  link: "Ссылка",
};

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function actionFromDef(action: CustomButtonAction) {
  return {
    actionKind: action.kind,
    code: action.kind === "script" || action.kind === "expression" ? action.code : "",
    linkUrl: action.kind === "link" ? action.url : "",
    presetBase64: action.kind === "preset" ? action.base64 : "",
    presetFileName: action.kind === "preset" ? action.fileName : "",
  };
}

export const AddButtonDialog = ({
  editingDef,
  onClose,
  onSave,
  onImportFromHistory,
}: {
  editingDef?: CustomButtonDef;
  onClose: () => void;
  onSave: (def: CustomButtonDef, isEdit: boolean) => void;
  onImportFromHistory: (entry: ButtonHistoryEntry) => void;
}) => {
  const seed = editingDef ? actionFromDef(editingDef.action) : null;

  const [tooltip, setTooltip] = useState(editingDef?.tooltip || "");
  const [description, setDescription] = useState(editingDef?.description || "");
  const [descriptionGifDataUrl, setDescriptionGifDataUrl] = useState<string | null>(editingDef?.descriptionGifDataUrl ?? null);
  const [actionKind, setActionKind] = useState<ActionKind>(seed?.actionKind || "script");
  const [code, setCode] = useState(seed?.code || "");
  const [linkUrl, setLinkUrl] = useState(seed?.linkUrl || "");
  const [presetFileName, setPresetFileName] = useState(seed?.presetFileName || "");
  const [presetBase64, setPresetBase64] = useState(seed?.presetBase64 || "");
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(editingDef?.iconDataUrl ?? null);
  const [iconWidth, setIconWidth] = useState(editingDef?.iconWidth ?? 56);
  const [error, setError] = useState<string | null>(null);

  const handleIconChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { dataUrl, width } = await loadAndScaleIcon(file);
      setIconDataUrl(dataUrl);
      setIconWidth(width);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleDescriptionGifChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataURL(file);
      setDescriptionGifDataUrl(dataUrl);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  // Ctrl+V в поле "Описание". Два случая клипборда: скопирован сам ФАЙЛ
  // (например Ctrl+C по .gif в проводнике) — тогда clipboardData.files несёт
  // оригинальные байты, анимация сохранится в точности как при выборе файла;
  // либо скопировано "изображение" (например через "Копировать картинку" в
  // браузере) — тогда в clipboardData.items лежит уже растровый снимок, и
  // большинство приложений/ОС на этом этапе сворачивают гифку до одного
  // кадра — это ограничение самого системного буфера обмена, а не наше.
  const handleDescriptionPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      const fileArr = Array.from(files);
      const file = fileArr.find((f) => f.type.startsWith("image/")) || fileArr[0];
      e.preventDefault();
      handleDescriptionGifChange(file);
      return;
    }
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            handleDescriptionGifChange(blob);
            return;
          }
        }
      }
    }
  };

  const handlePresetChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const base64 = await readFileAsBase64(file);
      setPresetBase64(base64);
      setPresetFileName(file.name);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleSave = () => {
    if (!tooltip.trim()) {
      setError("Укажите название (подсказку) кнопки.");
      return;
    }
    let action: CustomButtonAction;
    if (actionKind === "script" || actionKind === "expression") {
      if (!code.trim()) {
        setError("Введите код.");
        return;
      }
      action = { kind: actionKind, code };
    } else if (actionKind === "link") {
      if (!linkUrl.trim()) {
        setError("Введите ссылку.");
        return;
      }
      action = { kind: "link", url: linkUrl.trim() };
    } else {
      if (!presetBase64) {
        setError("Выберите файл пресета (.ffx).");
        return;
      }
      action = { kind: "preset", base64: presetBase64, fileName: presetFileName };
    }

    const def: CustomButtonDef = {
      id: editingDef?.id || makeId(),
      tooltip: tooltip.trim(),
      description: description.trim(),
      descriptionGifDataUrl,
      action,
      iconDataUrl,
      iconWidth,
    };
    onSave(def, !!editingDef);
  };

  return (
    <div className="rrr-modal-overlay" onClick={onClose}>
      <div className="rrr-modal rrr-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="rrr-modal-columns">
          <div className="rrr-modal-form">
            <div className="rrr-modal-title">{editingDef ? "Редактировать кнопку" : "Новая кнопка"}</div>

            <label className="rrr-modal-field">
              Название (подсказка при наведении)
              <input type="text" value={tooltip} onChange={(e) => setTooltip(e.target.value)} />
            </label>

            <label className="rrr-modal-field">
              Тип действия
              <select value={actionKind} onChange={(e) => setActionKind(e.target.value as ActionKind)}>
                {(Object.keys(ACTION_LABELS) as ActionKind[]).map((k) => (
                  <option key={k} value={k}>
                    {ACTION_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>

            {(actionKind === "script" || actionKind === "expression") && (
              <label className="rrr-modal-field">
                Код
                <textarea
                  rows={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={actionKind === "script" ? "// ExtendScript" : "// Expression"}
                />
              </label>
            )}

            {actionKind === "link" && (
              <label className="rrr-modal-field">
                Ссылка
                <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
              </label>
            )}

            {actionKind === "preset" && (
              <label className="rrr-modal-field">
                Файл пресета (.ffx)
                <input type="file" accept=".ffx" onChange={(e) => handlePresetChange(e.target.files?.[0])} />
                {presetFileName && <span className="rrr-modal-hint">{presetFileName}</span>}
              </label>
            )}

            <label className="rrr-modal-field">
              Иконка (высота автоматически ограничена 32px, без искажений)
              <input type="file" accept="image/*" onChange={(e) => handleIconChange(e.target.files?.[0])} />
              {iconDataUrl && <img src={iconDataUrl} alt="" className="rrr-modal-icon-preview" />}
            </label>

            <label className="rrr-modal-field">
              Описание (видно во всплывающем окне в Истории при наведении на строку)
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onPaste={handleDescriptionPaste}
              />
            </label>

            <label className="rrr-modal-field">
              Гифка для описания (необязательно, до 5 МБ — вместо описания, вместе с ним, или Ctrl+V в поле описания)
              <input type="file" accept="image/gif" onChange={(e) => handleDescriptionGifChange(e.target.files?.[0])} />
              {descriptionGifDataUrl && (
                <span className="rrr-modal-gif-preview-wrap">
                  <img src={descriptionGifDataUrl} alt="" className="rrr-modal-gif-preview" />
                  <button type="button" className="rrr-modal-gif-remove" onClick={() => setDescriptionGifDataUrl(null)}>
                    ✕
                  </button>
                </span>
              )}
            </label>

            {error && <div className="rrr-collects-status rrr-collects-status--error">{error}</div>}

            <div className="rrr-modal-actions">
              <button className="rrr-std-btn" onClick={onClose}>
                Отмена
              </button>
              <button className="rrr-std-btn" onClick={handleSave}>
                {editingDef ? "Сохранить" : "Добавить"}
              </button>
            </div>
          </div>

          <div className="rrr-modal-history">
            <div className="rrr-modal-title">История кнопок</div>
            <ButtonHistoryList onImport={onImportFromHistory} />
          </div>
        </div>
      </div>
    </div>
  );
};
