// A fixed locale and time zone keep server-rendered and hydrated output identical.
const lastEditedFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatLastEdited(isoTimestamp: string): string {
  return lastEditedFormatter.format(new Date(isoTimestamp));
}
