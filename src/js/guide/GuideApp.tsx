import { useEffect, useState } from "react";
import { version } from "../../shared/shared";
import { evalTS, openLinkInBrowser } from "../lib/utils/bolt";
import { DEFAULT_COLLECTS_ROOT } from "../../shared/defaults";
import "./guide.scss";

// Содержимое гайда — аккордеон: заголовок с превью-«кнопками» + стрелочка, под ней текст.
// Развёрнуто одновременно может быть только одно описание. Текст и группировка —
// как в старом ScriptUI-скрипте (RRR.jsx, GUIDE_SECTIONS): 1:1 перенесены к 16:9 —
// обе кнопки используют одну и ту же механику (блюр-фон), Render/Collect — в новом порядке.
// Превью — чёрные прямоугольники с подписью (как в оригинальном addBlackPreviewBox),
// а не настоящие PNG-иконки.
type GuideSection = {
  previewLabels?: string[];
  previewDropdown?: boolean;
  title: string;
  bullets: string[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    previewLabels: ["9:16", "4:3", "1:1", "16:9"],
    title: "кроп/дубликат",
    bullets: [
      "Click — создаёт копию нужного разрешения, выделенной в панели project композиции.",
      "Ctrl+Click — заменяет выделенную на timeline композицию, дубликатом выбранного разрешения.",
      "Alt+Click — создаёт пустую композицию с сейф-зонами.",
      "Alt+Click на 1:1 / 16:9 — блюр-фон билд (только из композиции 1080x1350)."
    ]
  },
  {
    previewLabels: ["ctrl"],
    title: "внешние контроллеры прекомпа",
    bullets: [
      "Click — \"достает\" все ключи через Essential Graphics.",
      "Ctrl+Click — \"достает\" position и scale всех непривязанных слоёв."
    ]
  },
  {
    previewLabels: ["collect"],
    title: "сборка и/или наведение порядка одной кнопкой",
    bullets: [
      "Переименовывает выбранные композиции,",
      "удаляет лишние папки и файлы,",
      "объединяет одинаковые файлы,",
      "создает нужные папки и сортирует все по ним.",
      "+ctrl запускает коллект"
    ]
  },
  {
    previewLabels: ["render"],
    title: "отправка в очередь",
    bullets: [
      "проект должен быть назван по формуле MM.YY_AA_TaskName,",
      "выберите композиции/папки для рендера",
      "создает все нужные папки на рабочем столе и отправляет на Render."
    ]
  },
  {
    previewDropdown: true,
    title: "дубликат папки",
    bullets: [
      "Выберите папку в панели project и создайте независимый дубликат для локализации."
    ]
  }
];

const TUTORIAL_URL = "https://drive.google.com/drive/folders/1FvJb8II1V7HoEj5KQXLXc0fw8hdg3ybn?usp=drive_link";
// Файл релиза называется по cep.config.ts id ("com.rrr3.panel"), а не по
// отображаемому имени RRR_3.0 — id внутренний и намеренно не переименован
// (см. предыдущий ответ в чате про риск для уже установленных копий).
const LATEST_ZXP_URL = "https://github.com/pavelshvarko-creator/RRR_3.0/releases/latest/download/com.rrr3.panel.zxp";

export const GuideApp = () => {
  const [openIndex, setOpenIndex] = useState(-1);
  const [updating, setUpdating] = useState(false);
  const [useIcons, setUseIcons] = useState(true);
  const [creatorName, setCreatorName] = useState("");
  const [collectsRoot, setCollectsRoot] = useState("");

  useEffect(() => {
    evalTS("getIconModeSetting").then((saved) => setUseIcons(saved !== false));
    evalTS("getSavedCreatorName").then((saved) => setCreatorName(saved || ""));
    evalTS("getSavedCollectsRoot").then((saved) => setCollectsRoot(saved || DEFAULT_COLLECTS_ROOT));
  }, []);

  const handleCreatorNameBlur = () => {
    evalTS("saveCreatorNameOnly", creatorName.trim());
  };

  const handleCollectsRootBlur = () => {
    evalTS("saveCollectsRoot", collectsRoot.trim());
  };

  const handleToggleIcons = () => {
    const next = !useIcons;
    setUseIcons(next);
    evalTS("setIconModeSetting", next);
  };

  const handleUpdateClick = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      // Модуль обновления (использует Node.js fs/path) подключаем динамически,
      // а не в самом верху файла — чтобы его загрузка не могла сломать
      // самую первую отрисовку окна гайда, если что-то в этом окружении
      // пойдёт не так.
      const { checkForUpdate, downloadAndInstallUpdate } = await import("../lib/utils/update");
      const result = await checkForUpdate();
      if (!result.hasUpdate) {
        alert("У вас уже установлена последняя версия (" + version + ").");
        return;
      }
      if (!result.downloadUrl) {
        alert("Найдена версия " + result.latestVersion + ", но в релизе нет .zip-файла для установки.");
        return;
      }
      // allowElevation: true — это явный клик пользователя, здесь можно
      // показать системный запрос прав администратора (UAC), если он
      // понадобится для записи в защищённую папку расширения.
      await downloadAndInstallUpdate(result.downloadUrl, true);
      alert(
        "✅ Обновление до версии " + result.latestVersion + " установлено.\n" +
        "Перезапустите After Effects, чтобы изменения вступили в силу."
      );
    } catch (e: any) {
      alert("Ошибка обновления: " + (e && e.message ? e.message : String(e)));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="guide-window">
      <div className="guide-heading">RRR — Resize · Rename · Render</div>
      {GUIDE_SECTIONS.map((section, index) => {
        const isOpen = index === openIndex;
        return (
          <div className="guide-card" key={index}>
            <div
              className="guide-header"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
            >
              <span className="guide-arrow">{isOpen ? "▾" : "▸"}</span>
              {section.previewLabels &&
                section.previewLabels.map((label, i) => (
                  <span className="guide-preview-box" key={i}>{label}</span>
                ))}
              {section.previewDropdown && (
                <span className="guide-preview-box guide-preview-dropdown">
                  <span>EN</span>
                  <span className="guide-preview-chevron" />
                </span>
              )}
              <span className="guide-title">{section.title}</span>
            </div>
            {isOpen && (
              <div className="guide-body">
                {section.bullets.map((bullet, i) => (
                  <div className="guide-bullet" key={i}>• {bullet}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="guide-settings">
        <label className="guide-settings-field">
          <span>Ваш ник (для имени файлов рендера)</span>
          <input
            type="text"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            onBlur={handleCreatorNameBlur}
          />
        </label>
        <label className="guide-settings-field">
          <span>Путь к папке с коллектами на Shared Drive</span>
          <input
            type="text"
            value={collectsRoot}
            onChange={(e) => setCollectsRoot(e.target.value)}
            onBlur={handleCollectsRootBlur}
            placeholder={DEFAULT_COLLECTS_ROOT}
          />
        </label>
      </div>

      <div className="guide-footer">
        <button className="guide-tutor-link" onClick={() => openLinkInBrowser(TUTORIAL_URL)} title="Tutor">
          <span className="guide-tutor-icon" />
        </button>

        <div className="guide-footer-version">
          <div className="guide-version">версия {version}</div>
          <button className="guide-update-btn" onClick={handleUpdateClick} disabled={updating}>
            {updating ? "Проверка..." : "Обновить"}
          </button>
          <button className="guide-zxp-link" onClick={() => openLinkInBrowser(LATEST_ZXP_URL)}>
            Скачать последнюю версию
          </button>
        </div>

        <div className="guide-icon-toggle" title="Иконки кнопок / стандартные кнопки">
          <span>Иконки</span>
          <span
            className={"guide-toggle-switch" + (useIcons ? " on" : "")}
            onClick={handleToggleIcons}
          >
            <span className="guide-toggle-knob" />
          </span>
        </div>
      </div>
    </div>
  );
};
