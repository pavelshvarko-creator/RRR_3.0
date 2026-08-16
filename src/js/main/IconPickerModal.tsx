import { useState } from "react";
import { loadAndScaleIcon } from "../lib/buttons/icon";
import { ICON_LIBRARY, libraryIconToDataUrl } from "../lib/buttons/iconLibrary";

export const IconPickerModal = ({
  onPick,
  onClose,
}: {
  onPick: (dataUrl: string, width: number) => void;
  onClose: () => void;
}) => {
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { dataUrl, width } = await loadAndScaleIcon(file);
      onPick(dataUrl, width);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  return (
    <div className="rrr-modal-overlay rrr-icon-picker-overlay" onClick={onClose}>
      <div className="rrr-modal rrr-icon-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rrr-modal-title">Выбрать иконку</div>

        <label className="rrr-std-btn rrr-icon-picker-upload-btn">
          Подгрузить свою иконку
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              handleUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {error && <div className="rrr-collects-status rrr-collects-status--error">{error}</div>}

        <div className="rrr-icon-library-grid">
          {ICON_LIBRARY.map((icon) => {
            const dataUrl = libraryIconToDataUrl(icon.svg);
            return (
              <button key={icon.name} type="button" title={icon.name} className="rrr-icon-library-item" onClick={() => onPick(dataUrl, 32)}>
                <img src={dataUrl} alt={icon.name} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
