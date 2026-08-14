import { useState, type ReactNode } from "react";

// Перетаскивание для смены порядка убрано — в CEP-панели (embedded Chromium)
// не удалось завести его надёжно ни через нативный HTML5 Drag and Drop, ни
// через ручное отслеживание мыши. Осталось ПКМ → Редактировать/Удалить.
export const ButtonSlot = ({
  slotId,
  onDelete,
  onEdit,
  children,
}: {
  slotId: string;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
  children: ReactNode;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="rrr-button-slot"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      {children}
      {menuOpen && (
        <>
          <div
            className="rrr-context-menu-backdrop"
            onClick={() => setMenuOpen(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuOpen(false);
            }}
          />
          <div className="rrr-context-menu">
            {onEdit && (
              <div
                className="rrr-context-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(slotId);
                }}
              >
                Редактировать
              </div>
            )}
            <div
              className="rrr-context-menu-item rrr-context-menu-item--danger"
              onClick={() => {
                setMenuOpen(false);
                onDelete(slotId);
              }}
            >
              Удалить
            </div>
          </div>
        </>
      )}
    </div>
  );
};
