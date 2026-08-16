import { useEffect, useState } from "react";
import { evalTS } from "../lib/utils/bolt";
import { loadButtonHistory } from "../lib/buttons/history";
import type { ButtonHistoryEntry } from "../../shared/customButtons";
import { DEFAULT_BUTTONS_HISTORY_PATH } from "../../shared/defaults";
import { autoDetectSharedPath } from "../lib/utils/autoDetectSharedPath";

const PREVIEW_MAX_WIDTH = 260;

// Живёт внутри диалога добавления/редактирования кнопки — вся история видна
// всем без исключения, поэтому отдельного переключателя "опубликовать" нет:
// любая новая кнопка публикуется автоматически (см. main.tsx).
export const ButtonHistoryList = ({ onImport }: { onImport: (entry: ButtonHistoryEntry) => void }) => {
  const [entries, setEntries] = useState<ButtonHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Всплывающее окно с описанием/гифкой — не title (тот умеет только текст и
  // не покажет картинку), а свой position:fixed попап, спозиционированный по
  // курсору. fixed, а не абсолютно внутри строки — список истории сам
  // скроллится (overflow-y: auto), и позиционирование внутри него обрезало
  // бы попап границами списка.
  const [preview, setPreview] = useState<{ x: number; y: number; entry: ButtonHistoryEntry } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let historyPath = await evalTS("getSavedButtonsHistoryPath");
        if (!historyPath) {
          const detected = await autoDetectSharedPath(DEFAULT_BUTTONS_HISTORY_PATH);
          if (detected) {
            historyPath = detected;
            evalTS("saveButtonsHistoryPath", detected);
          } else {
            const entered = window.prompt(
              "Путь к папке для истории кнопок на Google Drive (каждая кнопка — отдельный файл в ней):",
              DEFAULT_BUTTONS_HISTORY_PATH
            );
            if (!entered) {
              setLoading(false);
              return;
            }
            historyPath = entered;
            evalTS("saveButtonsHistoryPath", entered);
          }
        }
        const list = await loadButtonHistory(historyPath);
        setEntries(list);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
      setLoading(false);
    })();
  }, []);

  const hasPreview = (entry: ButtonHistoryEntry) => !!(entry.description || entry.descriptionGifDataUrl);

  return (
    <div className="rrr-button-history-list">
      {loading && <div className="rrr-collects-status">Загрузка…</div>}
      {error && <div className="rrr-collects-status rrr-collects-status--error">{error}</div>}
      {entries && entries.length === 0 && <div className="rrr-collects-status">Пока никто ничего не добавил.</div>}
      {entries &&
        entries.map((entry) => (
          <div
            key={entry.id}
            className="rrr-button-history-row"
            onClick={() => onImport(entry)}
            onMouseEnter={(e) => {
              if (hasPreview(entry)) setPreview({ x: e.clientX, y: e.clientY, entry });
            }}
            onMouseLeave={() => setPreview((p) => (p?.entry.id === entry.id ? null : p))}
          >
            <span className="rrr-button-history-col rrr-button-history-col--author">{entry.author || "?"}</span>
            <span className="rrr-button-history-col">{entry.tooltip}</span>
          </div>
        ))}

      {preview &&
        (() => {
          // Только горизонтальный зажим (попап не должен вылезти за правый
          // край окна панели) — по вертикали панель обычно достаточно
          // высокая, а сам попап ограничен max-height со скроллом на случай
          // длинного описания.
          const left = Math.min(preview.x + 16, Math.max(8, window.innerWidth - PREVIEW_MAX_WIDTH - 8));
          return (
            <div className="rrr-button-history-preview" style={{ left, top: preview.y + 12, maxWidth: PREVIEW_MAX_WIDTH }}>
              {preview.entry.descriptionGifDataUrl && <img src={preview.entry.descriptionGifDataUrl} alt="" />}
              {preview.entry.description && <div className="rrr-button-history-preview-text">{preview.entry.description}</div>}
            </div>
          );
        })()}
    </div>
  );
};
