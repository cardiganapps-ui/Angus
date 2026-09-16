import { Icon, type IconName } from "./Icon";

/* An empty state is never a dead end: when the next step is a single
   unambiguous action (create the first piece, the first contact…), pass
   `actionLabel` + `onAction` and the screen offers it right here instead
   of leaving her to find the FAB. Screens whose empty state is a filter
   miss ("Nada coincide") stay text-only on purpose — the next step there
   is clearing the filter she just set, not creating a row. */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-body">{body}</div>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary empty-state-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
