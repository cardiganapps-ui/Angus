export type IconName =
  | "home"
  | "palette"
  | "users"
  | "calendar"
  | "plus"
  | "x"
  | "chevron-right"
  | "trash";

const PATHS: Record<IconName, string> = {
  home: "M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  palette:
    "M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7zM7 12a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm3-4a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm5 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm2.5 4a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6H2zm12.5-5c2.9.3 5.5 2.4 5.5 5h-3.2c0-1.9-.9-3.6-2.3-5z",
  calendar:
    "M7 2v3M17 2v3M3.5 8h17M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  plus: "M12 4v16M4 12h16",
  x: "M5 5l14 14M19 5 5 19",
  "chevron-right": "M9 5l7 7-7 7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
