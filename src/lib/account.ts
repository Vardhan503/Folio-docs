export type AccountSummary = {
  displayName: string;
  email: string;
  initials: string;
};

export function buildAccountSummary(
  displayName: string | null | undefined,
  email: string | null | undefined,
): AccountSummary {
  const safeEmail = email ?? "";
  const name = displayName?.trim() || safeEmail.split("@")[0] || "Folio user";
  return { displayName: name, email: safeEmail, initials: getInitials(name) };
}

export function getInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
