export type IconName =
  | "home"
  | "palette"
  | "users"
  | "calendar"
  | "plus"
  | "x"
  | "chevron-right"
  | "chevron-left"
  | "chevron-down"
  | "trash"
  | "check"
  | "banknote"
  | "receipt"
  | "clock"
  | "alert"
  | "menu"
  | "settings"
  | "chart"
  | "trending"
  | "repeat"
  | "search"
  | "download"
  | "tag"
  | "graduation"
  | "book"
  | "map-pin"
  | "target"
  | "sparkles"
  | "bell"
  | "edit"
  | "star"
  | "filter"
  | "wallet"
  | "phone"
  | "mail"
  | "message"
  | "user"
  | "pause"
  | "play"
  | "clipboard";

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
  "chevron-left": "M15 5l-7 7 7 7",
  "chevron-down": "M5 9l7 7 7-7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  check: "M20 6L9 17l-5-5",
  banknote:
    "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0M5.5 9.7v4.6M18.5 9.7v4.6",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9.5 8.5h5M9.5 12.5h5",
  /* A deadline reads as time running out, not as a date on a grid —
     the calendar glyph belongs to the Agenda tab. */
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5.2l3.4 2",
  alert: "M12 3.6 21.5 20H2.5zM12 10v4M12 17h.01",
  menu: "M4 7h16M4 12h16M4 17h16",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  chart: "M4 20h16M7 16V10M12 16V5M17 16v-4",
  trending: "M3 17l6-6 4 4 8-8M15 7h6v6",
  repeat: "M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM21 21l-5-5",
  download: "M12 3v12M6 11l6 6 6-6M4 21h16",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  graduation: "M2 9l10-5 10 5-10 5zM6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5M22 9v6",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM9 7h6",
  "map-pin": "M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  sparkles: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8zM5 2l.6 1.6L7 4l-1.4.5L5 6l-.6-1.5L3 4l1.4-.4z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  edit: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17zM13 8l3 3",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7a2 2 0 0 1 2-2h11v2M16 13h5v3h-5a1.5 1.5 0 0 1 0-3z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  message: "M4 5h16v11H9l-5 4z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-3.9 3.6-7 8-7s8 3.1 8 7z",
  pause: "M8 5v14M16 5v14",
  play: "M7 4l12 8-12 8z",
  clipboard: "M9 4h6a1 1 0 0 1 1 1v2H8V5a1 1 0 0 1 1-1zM8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 13l2 2 4-4"
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
