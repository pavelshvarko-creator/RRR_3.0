import React from "react";
import ReactDOM from "react-dom/client";
import { GuideApp } from "./GuideApp";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <GuideApp />
  </React.StrictMode>
);

// Известный баг CEP: окно, открытое программно через requestOpenExtension
// ("холодный старт"), иногда не получает от CEF первый paint в нативное
// окно — страница внутри полностью готова (DOM и CSS в порядке, проверено
// через удалённый DevTools), но на экране остаётся белый прямоугольник.
// window.resizeTo (первая попытка) не сработал — вероятно, CEP блокирует
// эту функцию для панелей. Форсируем reflow/repaint только через DOM,
// без обращения к window-уровню: временно убираем элемент из потока
// документа и возвращаем обратно — это заставляет движок пересчитать
// layout и перерисовать кадр, независимо от прав на управление окном.
function kickRepaint() {
  const el = document.getElementById("app");
  if (!el) return;
  const prevDisplay = el.style.display;
  el.style.display = "none";
  // Обращение к offsetHeight форсирует синхронный reflow прямо здесь,
  // а не когда движку будет удобно.
  void el.offsetHeight;
  el.style.display = prevDisplay;
}

window.addEventListener("load", () => {
  setTimeout(kickRepaint, 60);
  setTimeout(kickRepaint, 300);
  setTimeout(kickRepaint, 800);
});
