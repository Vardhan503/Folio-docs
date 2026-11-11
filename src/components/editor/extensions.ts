import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import {
  ALIGNABLE_NODES,
  TEXT_ALIGNMENTS,
  isFontSize,
  isHighlightColor,
  isTextColor,
  normalizeFontSize,
  normalizeHighlightColor,
  normalizeTextColor,
} from "@/lib/documents/formatting";
import { ALLOWED_HEADING_LEVELS } from "@/lib/documents/validation";

// Color, font size, and highlight write their values into inline styles. These
// versions only parse (e.g. from pasted HTML) and render palette values, so
// pasted formatting outside the palette is dropped instead of failing to save.
const PaletteColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => normalizeTextColor(element.style.color),
            renderHTML: (attributes) =>
              isTextColor(attributes.color) ? { style: `color: ${attributes.color}` } : {},
          },
        },
      },
    ];
  },
});

const BoundedFontSize = FontSize.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => normalizeFontSize(element.style.fontSize),
            renderHTML: (attributes) =>
              isFontSize(attributes.fontSize) ? { style: `font-size: ${attributes.fontSize}` } : {},
          },
        },
      },
    ];
  },
});

const PaletteHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) =>
          normalizeHighlightColor(element.getAttribute("data-color") ?? element.style.backgroundColor),
        renderHTML: (attributes) =>
          isHighlightColor(attributes.color)
            ? { "data-color": attributes.color, style: `background-color: ${attributes.color}; color: inherit` }
            : {},
      },
    };
  },
});

/** Editor schema shared by the editor, imports, and the content validation tests. */
export function createEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [...ALLOWED_HEADING_LEVELS] },
      link: false,
    }),
    TextStyle,
    PaletteColor,
    BoundedFontSize,
    PaletteHighlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: [...ALIGNABLE_NODES],
      alignments: [...TEXT_ALIGNMENTS],
    }),
    Placeholder.configure({ placeholder: "Start writing…" }),
  ];
}
