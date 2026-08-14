const MAX_ICON_HEIGHT = 32;

// Без кропа — только ограничение по высоте. Если иконка выше 32px, сжимаем
// пропорционально до высоты 32 (ширина следует из исходных пропорций); если
// уже не выше — оставляем как есть, не растягиваем вверх.
export function loadAndScaleIcon(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось загрузить изображение."));
      img.onload = () => {
        const scale = img.naturalHeight > MAX_ICON_HEIGHT ? MAX_ICON_HEIGHT / img.naturalHeight : 1;
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas недоступен."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL("image/png"), width, height });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать файл."));
    reader.onload = () => {
      const result = reader.result as string;
      // "data:application/octet-stream;base64,XXXX" -> "XXXX"
      const commaIndex = result.indexOf(",");
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.readAsDataURL(file);
  });
}
