"use client";

import type { ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";

type EditorToolbarProps = {
  editor: Editor;
};

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      heading1: current.isActive("heading", { level: 1 }),
      heading2: current.isActive("heading", { level: 2 }),
      paragraph: current.isActive("paragraph"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-controls="document-content"
      className="flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-[0_1px_2px_rgba(28,27,25,0.04)]"
    >
      <ToolbarGroup>
        <ToolbarButton
          icon={Undo2}
          label="Undo"
          shortcut="Mod+Z"
          disabled={!state.canUndo}
          onClick={() => chain().undo().run()}
        />
        <ToolbarButton
          icon={Redo2}
          label="Redo"
          shortcut="Mod+Shift+Z"
          disabled={!state.canRedo}
          onClick={() => chain().redo().run()}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup>
        <ToolbarButton
          icon={Pilcrow}
          label="Normal text"
          shortcut="Mod+Alt+0"
          active={state.paragraph}
          onClick={() => chain().setParagraph().run()}
        />
        <ToolbarButton
          icon={Heading1}
          label="Heading 1"
          shortcut="Mod+Alt+1"
          active={state.heading1}
          onClick={() => chain().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          icon={Heading2}
          label="Heading 2"
          shortcut="Mod+Alt+2"
          active={state.heading2}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup>
        <ToolbarButton
          icon={Bold}
          label="Bold"
          shortcut="Mod+B"
          active={state.bold}
          onClick={() => chain().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="Italic"
          shortcut="Mod+I"
          active={state.italic}
          onClick={() => chain().toggleItalic().run()}
        />
        <ToolbarButton
          icon={Underline}
          label="Underline"
          shortcut="Mod+U"
          active={state.underline}
          onClick={() => chain().toggleUnderline().run()}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      <ToolbarGroup>
        <ToolbarButton
          icon={List}
          label="Bulleted list"
          shortcut="Mod+Shift+8"
          active={state.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="Numbered list"
          shortcut="Mod+Shift+7"
          active={state.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        />
      </ToolbarGroup>
    </div>
  );
}

function ToolbarGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />;
}

type ToolbarButtonProps = {
  icon: LucideIcon;
  label: string;
  shortcut: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
};

function ToolbarButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  active,
  disabled,
}: ToolbarButtonProps) {
  const shortcutHint = shortcut.replace("Mod", "Ctrl/⌘");

  return (
    <button
      type="button"
      // Keep the editor's selection and focus when clicking with a pointer.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      aria-keyshortcuts={shortcut.replace("Mod", "Control")}
      title={`${label} (${shortcutHint})`}
      className={`inline-flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-accent-soft text-accent"
          : "text-ink-muted hover:bg-black/[0.05] hover:text-ink"
      }`}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
