import { evalES, evalTS, openLinkInBrowser } from "../utils/bolt";
import { fs, path, os } from "../cep/node";
import type { CustomButtonDef } from "../../../shared/customButtons";

export async function runCustomButtonAction(def: CustomButtonDef): Promise<void> {
  const action = def.action;
  try {
    if (action.kind === "script") {
      // isGlobal: true — это произвольный пользовательский код, а не вызов
      // именованной функции из host[ns] (для чего вообще существует scoping
      // в evalES по умолчанию).
      await evalES(action.code, true);
    } else if (action.kind === "expression") {
      const result = await evalTS("applyExpressionToSelected", action.code);
      if (!result.ok) alert(result.message || "Не удалось применить выражение.");
    } else if (action.kind === "link") {
      openLinkInBrowser(action.url);
    } else if (action.kind === "preset") {
      const tempPath = path.join(os.tmpdir(), `rrr3_preset_${Date.now()}.ffx`);
      await fs.promises.writeFile(tempPath, Buffer.from(action.base64, "base64"));
      const result = await evalTS("applyPresetToSelected", tempPath);
      if (!result.ok) alert(result.message || "Не удалось применить пресет.");
    }
  } catch (e: any) {
    alert(`Ошибка кнопки "${def.tooltip}": ${e?.message || String(e)}`);
  }
}
