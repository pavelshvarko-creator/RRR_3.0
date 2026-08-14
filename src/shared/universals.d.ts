/**
 * @description Declare event types for listening with listenTS() and dispatching with dispatchTS()
 */
export type EventTS = {
  // Гайд и основная панель — разные окна CEP с независимым React-состоянием;
  // если путь к коллектам меняют в гайде, пока основная панель уже открыта,
  // её собственный индекс (построенный при монтировании из старого пути)
  // сам не обновится без этого события — см. CollectsRequestBar.tsx.
  collectsRootChanged: {
    path: string;
  };
};
