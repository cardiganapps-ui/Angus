import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon,
  title,
  body
}: {
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-body">{body}</div>
    </div>
  );
}
