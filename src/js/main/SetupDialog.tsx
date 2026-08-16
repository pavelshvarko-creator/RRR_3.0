import { useEffect, useState } from "react";
import { DEFAULT_COLLECTS_ROOT } from "../../shared/defaults";
import { autoDetectCollectsRoot } from "../lib/collects/driveIndex";

// Показывается один раз при первом запуске панели (или после переустановки
// zxp, если настройки почему-то не сохранились) — раньше ник и путь к
// коллектам запрашивались двумя независимыми нативными window.prompt в
// разное время, теперь это одно обязательное окно с обоими полями сразу.
// Ни клика по фону, ни кнопки "Отмена" нет — без этих двух значений панель
// не может нормально работать (имя файлов рендера, поиск коллектов), так что
// закрыть окно можно только заполнив оба поля.
export const SetupDialog = ({ onSubmit }: { onSubmit: (name: string, collectsRoot: string) => void }) => {
  const [name, setName] = useState("");
  // Предзаполнено дефолтным путём (одинаковым почти у всей команды) —
  // редактируемо, не жёстко задано: у кого буква диска отличается, поле
  // просто правится перед сохранением. При монтировании пробуем найти
  // реальную букву диска автоматически (перебором) и подменяем дефолт на
  // неё, если нашли — так на большинстве машин вообще ничего править не
  // придётся.
  const [collectsRoot, setCollectsRoot] = useState(DEFAULT_COLLECTS_ROOT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    autoDetectCollectsRoot().then((detected) => {
      if (detected) setCollectsRoot(detected);
    });
  }, []);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("Введите ник.");
      return;
    }
    if (!collectsRoot.trim()) {
      setError("Укажите путь к папке с коллектами.");
      return;
    }
    onSubmit(name.trim(), collectsRoot.trim());
  };

  return (
    <div className="rrr-modal-overlay">
      <div className="rrr-modal">
        <div className="rrr-modal-title">Первый запуск RRR_3.0</div>

        <label className="rrr-modal-field">
          Ваш ник (для имени файлов рендера)
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="rrr-modal-field">
          Путь к папке с коллектами на Shared Drive
          <input
            type="text"
            value={collectsRoot}
            onChange={(e) => setCollectsRoot(e.target.value)}
            placeholder={'G:\\Общие диски\\BP_NEW_Collects(2024 - ...)'}
          />
        </label>

        {error && <div className="rrr-collects-status rrr-collects-status--error">{error}</div>}

        <div className="rrr-modal-actions">
          <button className="rrr-std-btn" onClick={handleSubmit}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
