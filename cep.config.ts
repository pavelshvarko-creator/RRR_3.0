import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

const config: CEP_Config = {
  version,
  // id — внутренний CSXS-идентификатор, завязан на уже установленные копии
  // расширения; НЕ переименован вместе с отображаемыми названиями ниже —
  // это отдельное, ломающее совместимость решение (см. ответ в чате).
  id: "com.rrr3.panel",
  displayName: "RRR_3.0",
  symlink: "local",
  port: 3001,
  servePort: 5001,
  startingDebugPort: 8870,
  extensionManifestVersion: 6.0,
  requiredRuntimeVersion: 9.0,
  hosts: [{ name: "AEFT", version: "[0.0,99.9]" }],

  type: "Panel",
  iconDarkNormal: "./src/assets/light-icon.png",
  iconNormal: "./src/assets/dark-icon.png",
  iconDarkNormalRollOver: "./src/assets/light-icon.png",
  iconNormalRollOver: "./src/assets/dark-icon.png",
  parameters: ["--v=0", "--enable-nodejs", "--mixed-context"],
  width: 500,
  height: 550,

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: "RRR_3.0",
      autoVisible: true,
      width: 600,
      height: 650,
    },
    {
      // Раньше было type: "Modeless" (отдельное плавающее окно, не
      // пристыкованное к основной панели — как старое ScriptUI-окно
      // Window("palette", ...)). В этой версии AE/CEP "Modeless"-окна не
      // перерисовываются после программного открытия (requestOpenExtension) —
      // содержимое полностью корректно (проверено через удалённый DevTools),
      // но на экране остаётся белый прямоугольник, и никакие трюки с
      // перерисовкой изнутри страницы не помогают. "Panel" — тип, которым
      // уже работает основная панель RRR без единого сбоя, — переключаемся
      // на него и для гайда.
      mainPath: "./guide/index.html",
      name: "guide",
      panelDisplayName: "RRR_3.0 Guide",
      // true, а не false: гарантирует, что экземпляр панели гайда уже создан
      // AE к моменту клика по кнопке "i" — иначе requestOpenExtension не
      // может открыть его "с нуля" (см. handleInfoClick в main.tsx).
      autoVisible: true,
      type: "Panel",
      width: 420,
      height: 600,
    },
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    country: "US",
    province: "CA",
    org: "Company",
    password: "password",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: ["adm-zip"],
  // Экспортированный Output Module Template (Edit > Templates > Output
  // Module... > Save All...) — Adobe не даёт создать/установить его скриптом
  // (см. renderButtonClick в aeft.ts), поэтому вместо этого шаблон зашивается
  // в саму сборку: любой пользователь может один раз выполнить Load... и
  // выбрать этот файл, вместо того чтобы настраивать битрейт/формат вручную.
  copyAssets: ["resources/mp4 110MB.aom"],
  copyZipAssets: [],
};
export default config;
