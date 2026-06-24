const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(value: string) {
  if (value === "now") return "now";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    if (/^\d+[mhdw]$/.test(value)) return value;
    return value;
  }

  const diff = Date.now() - parsed;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < DAY * 7) return `${Math.floor(diff / DAY)}d`;
  return new Date(parsed).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
