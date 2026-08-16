import filmSvg from "lucide-static/icons/film.svg?raw";
import clapperboardSvg from "lucide-static/icons/clapperboard.svg?raw";
import videoSvg from "lucide-static/icons/video.svg?raw";
import cameraSvg from "lucide-static/icons/camera.svg?raw";
import apertureSvg from "lucide-static/icons/aperture.svg?raw";
import scissorsSvg from "lucide-static/icons/scissors.svg?raw";
import layersSvg from "lucide-static/icons/layers.svg?raw";
import layers3Svg from "lucide-static/icons/layers-3.svg?raw";
import slidersHorizontalSvg from "lucide-static/icons/sliders-horizontal.svg?raw";
import wand2Svg from "lucide-static/icons/wand-2.svg?raw";
import wandSparklesSvg from "lucide-static/icons/wand-sparkles.svg?raw";
import sparklesSvg from "lucide-static/icons/sparkles.svg?raw";
import paletteSvg from "lucide-static/icons/palette.svg?raw";
import paintbrushSvg from "lucide-static/icons/paintbrush.svg?raw";
import typeSvg from "lucide-static/icons/type.svg?raw";
import imageSvg from "lucide-static/icons/image.svg?raw";
import imagesSvg from "lucide-static/icons/images.svg?raw";
import musicSvg from "lucide-static/icons/music.svg?raw";
import volume2Svg from "lucide-static/icons/volume-2.svg?raw";
import micSvg from "lucide-static/icons/mic.svg?raw";
import playSvg from "lucide-static/icons/play.svg?raw";
import pauseSvg from "lucide-static/icons/pause.svg?raw";
import skipBackSvg from "lucide-static/icons/skip-back.svg?raw";
import skipForwardSvg from "lucide-static/icons/skip-forward.svg?raw";
import rewindSvg from "lucide-static/icons/rewind.svg?raw";
import fastForwardSvg from "lucide-static/icons/fast-forward.svg?raw";
import repeatSvg from "lucide-static/icons/repeat.svg?raw";
import shuffleSvg from "lucide-static/icons/shuffle.svg?raw";
import timerSvg from "lucide-static/icons/timer.svg?raw";
import cropSvg from "lucide-static/icons/crop.svg?raw";
import moveSvg from "lucide-static/icons/move.svg?raw";
import rotateCwSvg from "lucide-static/icons/rotate-cw.svg?raw";
import zoomInSvg from "lucide-static/icons/zoom-in.svg?raw";
import maximizeSvg from "lucide-static/icons/maximize.svg?raw";
import grid3x3Svg from "lucide-static/icons/grid-3x3.svg?raw";
import blendSvg from "lucide-static/icons/blend.svg?raw";
import contrastSvg from "lucide-static/icons/contrast.svg?raw";
import focusSvg from "lucide-static/icons/focus.svg?raw";
import frameSvg from "lucide-static/icons/frame.svg?raw";
import captionsSvg from "lucide-static/icons/captions.svg?raw";
import monitorSvg from "lucide-static/icons/monitor.svg?raw";
import wavesSvg from "lucide-static/icons/waves.svg?raw";
import lassoSvg from "lucide-static/icons/lasso.svg?raw";
import penToolSvg from "lucide-static/icons/pen-tool.svg?raw";
import discSvg from "lucide-static/icons/disc.svg?raw";

export type LibraryIcon = { name: string; svg: string };

// Курировано из lucide-static (ISC) — только иконки, релевантные монтажу
// видео/моушн-дизайну/эффектам, а не весь набор из ~2000 общих UI-иконок.
export const ICON_LIBRARY: LibraryIcon[] = [
  { name: "film", svg: filmSvg },
  { name: "clapperboard", svg: clapperboardSvg },
  { name: "video", svg: videoSvg },
  { name: "camera", svg: cameraSvg },
  { name: "aperture", svg: apertureSvg },
  { name: "scissors", svg: scissorsSvg },
  { name: "layers", svg: layersSvg },
  { name: "layers-3", svg: layers3Svg },
  { name: "sliders-horizontal", svg: slidersHorizontalSvg },
  { name: "wand-2", svg: wand2Svg },
  { name: "wand-sparkles", svg: wandSparklesSvg },
  { name: "sparkles", svg: sparklesSvg },
  { name: "palette", svg: paletteSvg },
  { name: "paintbrush", svg: paintbrushSvg },
  { name: "type", svg: typeSvg },
  { name: "image", svg: imageSvg },
  { name: "images", svg: imagesSvg },
  { name: "music", svg: musicSvg },
  { name: "volume-2", svg: volume2Svg },
  { name: "mic", svg: micSvg },
  { name: "play", svg: playSvg },
  { name: "pause", svg: pauseSvg },
  { name: "skip-back", svg: skipBackSvg },
  { name: "skip-forward", svg: skipForwardSvg },
  { name: "rewind", svg: rewindSvg },
  { name: "fast-forward", svg: fastForwardSvg },
  { name: "repeat", svg: repeatSvg },
  { name: "shuffle", svg: shuffleSvg },
  { name: "timer", svg: timerSvg },
  { name: "crop", svg: cropSvg },
  { name: "move", svg: moveSvg },
  { name: "rotate-cw", svg: rotateCwSvg },
  { name: "zoom-in", svg: zoomInSvg },
  { name: "maximize", svg: maximizeSvg },
  { name: "grid-3x3", svg: grid3x3Svg },
  { name: "blend", svg: blendSvg },
  { name: "contrast", svg: contrastSvg },
  { name: "focus", svg: focusSvg },
  { name: "frame", svg: frameSvg },
  { name: "captions", svg: captionsSvg },
  { name: "monitor", svg: monitorSvg },
  { name: "waves", svg: wavesSvg },
  { name: "lasso", svg: lassoSvg },
  { name: "pen-tool", svg: penToolSvg },
  { name: "disc", svg: discSvg },
];

// В самих файлах lucide-static stroke="currentColor" — работает только для
// инлайновых <svg> в DOM, а не для <img src="data:...">, где currentColor
// резолвить не в что. Поэтому перед укладкой в data URL подставляем
// конкретный цвет, совпадающий с цветом текста панели ($font в variables.scss).
const LIBRARY_ICON_COLOR = "#bbbbbb";

export function libraryIconToDataUrl(svg: string): string {
  const colored = svg.replace(/stroke="currentColor"/, `stroke="${LIBRARY_ICON_COLOR}"`);
  return `data:image/svg+xml,${encodeURIComponent(colored)}`;
}
