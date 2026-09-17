import { Icon } from "./Icon";
import { DEFAULT_TABS, MAX_TABS, MIN_TABS, NAV_ITEMS, navItem, type TabRoute } from "../data/nav";
import { haptic } from "../lib/haptics";

/* ── The bar, as she wants it ──
   The modules in her bottom pill, in order, with the rest offered as
   chips to add. Every change saves at once and the real pill at the
   bottom of the screen updates with it — that is the preview. Arrows
   rather than drag: reliable under a thumb, and a list of five never
   needs more. */

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function TabBarEditor({ value, onChange }: { value: readonly TabRoute[]; onChange: (next: TabRoute[]) => void }) {
  const chosen = value.flatMap((route) => {
    const item = navItem(route);
    return item ? [item] : [];
  });
  const remaining = NAV_ITEMS.filter((item) => !value.includes(item.route));
  const full = value.length >= MAX_TABS;
  const atMin = value.length <= MIN_TABS;
  const isDefault = value.length === DEFAULT_TABS.length && value.every((r, i) => r === DEFAULT_TABS[i]);

  const set = (next: TabRoute[]) => {
    haptic.tap();
    onChange(next);
  };

  return (
    <div className="tabbar-editor">
      <ol className="tabbar-editor-list" aria-label="Módulos en la barra, en orden">
        {chosen.map((item, i) => (
          <li className="tabbar-editor-row" key={item.route}>
            <span className="tabbar-editor-pos" aria-hidden="true">
              {i + 1}
            </span>
            <span className="settings-row-icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="tabbar-editor-label">{item.label}</span>
            <button
              type="button"
              className="tabbar-editor-btn btn-tap"
              aria-label={`Subir ${item.label}`}
              disabled={i === 0}
              onClick={() => set(move(value, i, i - 1))}
            >
              <Icon name="arrow-up" size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="tabbar-editor-btn btn-tap"
              aria-label={`Bajar ${item.label}`}
              disabled={i === chosen.length - 1}
              onClick={() => set(move(value, i, i + 1))}
            >
              <Icon name="arrow-down" size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className="tabbar-editor-btn tabbar-editor-btn--remove btn-tap"
              aria-label={`Quitar ${item.label} de la barra`}
              disabled={atMin}
              onClick={() => set(value.filter((r) => r !== item.route))}
            >
              <Icon name="x" size={16} strokeWidth={2.2} />
            </button>
          </li>
        ))}
      </ol>

      <div className="tabbar-editor-add">
        <div className="chip-group-title">{full ? `Máximo ${MAX_TABS} — quita uno para agregar otro` : "Agregar a la barra"}</div>
        <div className="chip-row">
          {remaining.map((item) => (
            <button
              key={item.route}
              type="button"
              className="chip"
              disabled={full}
              onClick={() => set([...value, item.route])}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!isDefault && (
        <button type="button" className="btn btn-ghost btn-mini tabbar-editor-reset" onClick={() => set([...DEFAULT_TABS])}>
          Volver a Dinero · Hoy · Agenda
        </button>
      )}
    </div>
  );
}
