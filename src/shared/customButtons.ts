export type CustomButtonAction =
  | { kind: "script"; code: string }
  | { kind: "expression"; code: string }
  | { kind: "preset"; base64: string; fileName: string }
  | { kind: "link"; url: string };

export type CustomButtonDef = {
  id: string;
  tooltip: string; // подсказка на самой кнопке
  description: string; // отдельный текст — виден при наведении на строку в Истории
  action: CustomButtonAction;
  iconDataUrl: string | null; // уже уменьшенная (высота <= 32px) PNG data URL, или null — тогда текстовый фолбэк как у остальных кнопок
  iconWidth: number; // натуральная ширина иконки после масштабирования, px
  author?: string;
};

// Порядок и состав кнопок в панели — общий список для встроенных и
// пользовательских, чтобы drag/drop и удаление работали одинаково для всех.
export type ButtonSlot = { kind: "builtin"; key: string } | { kind: "custom"; id: string };

export type ButtonHistoryEntry = {
  id: string;
  author: string;
  tooltip: string;
  description: string;
  action: CustomButtonAction;
  iconDataUrl: string | null;
  iconWidth: number;
  addedAt: number;
};
