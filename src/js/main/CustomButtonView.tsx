import type { CustomButtonDef } from "../../shared/customButtons";

export const CustomButtonView = ({ def, onRun }: { def: CustomButtonDef; onRun: (def: CustomButtonDef) => void }) => {
  if (def.iconDataUrl) {
    return (
      <button className="rrr-custom-icon-btn" style={{ width: def.iconWidth }} title={def.tooltip} onClick={() => onRun(def)}>
        <img src={def.iconDataUrl} alt="" />
      </button>
    );
  }
  return (
    <button className="rrr-std-btn" title={def.tooltip} onClick={() => onRun(def)}>
      {def.tooltip.slice(0, 2)}
    </button>
  );
};
