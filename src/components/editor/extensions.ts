import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ALLOWED_HEADING_LEVELS } from "@/lib/documents/validation";

/** Editor schema shared by the editor and the content validation tests. */
export function createEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [...ALLOWED_HEADING_LEVELS] },
      link: false,
    }),
    Placeholder.configure({ placeholder: "Start writing…" }),
  ];
}
