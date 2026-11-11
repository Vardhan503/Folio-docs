/**
 * The only formatting values documents may store. The editor, the toolbar, and
 * server-side validation all use these lists, so arbitrary CSS can never be
 * saved or rendered (attribute values are written into inline `style`).
 */

export type PaletteColor = { label: string; value: string };

/** Text colors; each has at least 4.5:1 contrast on white. */
export const TEXT_COLORS = [
  { label: "Gray", value: "#57534e" },
  { label: "Red", value: "#b91c1c" },
  { label: "Orange", value: "#c2410c" },
  { label: "Green", value: "#15803d" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Purple", value: "#7e22ce" },
] as const satisfies readonly PaletteColor[];

/** Highlight colors; light enough that default text keeps at least 4.5:1 contrast. */
export const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
] as const satisfies readonly PaletteColor[];

/** Font sizes other than the default (16px body text). */
export const FONT_SIZES = ["12px", "14px", "18px", "20px", "24px", "30px"] as const;

export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/** Blocks that can be aligned. */
export const ALIGNABLE_NODES = ["paragraph", "heading"] as const;

const TEXT_COLOR_VALUES: ReadonlySet<string> = new Set(TEXT_COLORS.map((color) => color.value));
const HIGHLIGHT_COLOR_VALUES: ReadonlySet<string> = new Set(
  HIGHLIGHT_COLORS.map((color) => color.value),
);
const FONT_SIZE_VALUES: ReadonlySet<string> = new Set(FONT_SIZES);
const ALIGNMENT_VALUES: ReadonlySet<string> = new Set(TEXT_ALIGNMENTS);

export function isTextColor(value: unknown): value is string {
  return typeof value === "string" && TEXT_COLOR_VALUES.has(value);
}

export function isHighlightColor(value: unknown): value is string {
  return typeof value === "string" && HIGHLIGHT_COLOR_VALUES.has(value);
}

export function isFontSize(value: unknown): value is string {
  return typeof value === "string" && FONT_SIZE_VALUES.has(value);
}

export function isTextAlignment(value: unknown): value is TextAlignment {
  return typeof value === "string" && ALIGNMENT_VALUES.has(value);
}

/** Converts "#ABC", "#aabbcc", or "rgb(170, 187, 204)" to lowercase "#aabbcc"; anything else is null. */
export function toHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim().toLowerCase();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(input);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (/^#[0-9a-f]{6}$/.test(input)) return input;

  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:1|1\.0+)\s*)?\)$/.exec(input);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** For pasted HTML: keep a color only if it's exactly one of the palette colors. */
export function normalizeTextColor(value: unknown): string | null {
  const hex = toHexColor(value);
  return isTextColor(hex) ? hex : null;
}

export function normalizeHighlightColor(value: unknown): string | null {
  const hex = toHexColor(value);
  return isHighlightColor(hex) ? hex : null;
}

/** For pasted HTML: keep a font size only if it's exactly one of the allowed sizes. */
export function normalizeFontSize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const size = value.trim().toLowerCase();
  return isFontSize(size) ? size : null;
}
