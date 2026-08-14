import { useEffect, useState } from "react";
import { evalTS } from "../lib/utils/bolt";
import { loadButtonHistory } from "../lib/buttons/history";
import type { ButtonHistoryEntry } from "../../shared/customButtons";
import { DEFAULT_BUTTONS_HISTORY_PATH } from "../../shared/defaults";

// Живёт внутри диалога добавления/редактирования кнопки — вся история видна
// всем без исключения, поэтому отдельного переключателя "опубликовать" нет:
// любая новая кнопка публикуется автоматически (см. main.tsx).
export const ButtonHistoryList = ({ onImport }: { onImport: (entry: ButtonHistoryEntry) => void }) => {
  const [entries, setEntries] = useState<ButtonHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let historyPath = await evalTS("getSavedButtonsHistoryPath");
        if (!historyPath) {
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
        const list = await loadButtonHistory(historyPath);
        setEntries(list);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="rrr-button-history-list">
      {loading && <div className="rrr-collects-status">Загрузка…</div>}
      {error && <div className="rrr-collects-status rrr-collects-status--error">{error}</div>}
      {entries && entries.length === 0 && <div className="rrr-collects-status">Пока никто ничего не добавил.</div>}
      {entries &&
        entries.map((entry) => (
          <div key={entry.id} className="rrr-button-history-row" title={entry.description || undefined} onClick={() => onImport(entry)}>
            <span className="rrr-button-history-col rrr-button-history-col--author">{entry.author || "?"}</span>
            <span className="rrr-button-history-col">{entry.tooltip}</span>
          </div>
        ))}
    </div>
  );
};
