import { useState } from "react";

// Три состояния иконки — обычная / hover (_1) / нажатая (_2), как в старом
// ScriptUI-скрипте (wireIconStates: mouseover -> hover, mouseout -> default,
// mousedown -> pressed, mouseup -> hover).
type IconButtonProps = {
  base: string;
  hover: string;
  pressed: string;
  label: string;
  useIcons: boolean;
  title?: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

export const IconButton = ({ base, hover, pressed, label, useIcons, title, disabled, onClick }: IconButtonProps) => {
  const [src, setSrc] = useState(base);

  // Тумблер в гайде: стандартная текстовая кнопка вместо PNG-иконки — как в
  // старом ScriptUI-скрипте, если бы файл иконки не был найден.
  if (!useIcons) {
    return (
      <button className="rrr-std-btn" title={title} disabled={disabled} onClick={onClick}>
        {label}
      </button>
    );
  }

  return (
    <button
      className="rrr-icon-btn"
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => !disabled && setSrc(hover)}
      onMouseLeave={() => setSrc(base)}
      onMouseDown={() => !disabled && setSrc(pressed)}
      onMouseUp={() => !disabled && setSrc(hover)}
    >
      <img src={src} style={disabled ? { opacity: 0.4 } : undefined} />
    </button>
  );
};
