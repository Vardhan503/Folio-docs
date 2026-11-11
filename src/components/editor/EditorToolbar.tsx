"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Check,
  ChevronDown,
  Ellipsis,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  TextQuote,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  type PaletteColor,
  type TextAlignment,
} from "@/lib/documents/formatting";

type EditorToolbarProps = {
  editor: Editor;
};

// The toolbar is a CSS container: controls move into "More" when the toolbar
// itself is narrow (phones, or the desktop editor with the sidebar open).
const TIER_2 = "hidden @min-[560px]:flex";
const TIER_3 = "hidden @min-[840px]:flex";
const TIER_3_BUTTON = "hidden @min-[840px]:inline-flex";
const IN_MENU_TIER_2 = "flex @min-[560px]:hidden";
const IN_MENU_TIER_3 = "flex @min-[840px]:hidden";

const ALIGNMENTS: { value: TextAlignment; label: string; icon: LucideIcon; shortcut: string }[] = [
  { value: "left", label: "Align left", icon: AlignLeft, shortcut: "Mod+Shift+L" },
  { value: "center", label: "Align center", icon: AlignCenter, shortcut: "Mod+Shift+E" },
  { value: "right", label: "Align right", icon: AlignRight, shortcut: "Mod+Shift+R" },
  { value: "justify", label: "Justify", icon: AlignJustify, shortcut: "Mod+Shift+J" },
];

const DEFAULT_FONT_SIZE_LABEL = "16";

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const textStyle = current.getAttributes("textStyle");
      const alignment = (["center", "right", "justify"] as const).find((value) =>
        current.isActive({ textAlign: value }),
      );
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        heading1: current.isActive("heading", { level: 1 }),
        heading2: current.isActive("heading", { level: 2 }),
        paragraph: current.isActive("paragraph"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        blockquote: current.isActive("blockquote"),
        textColor: typeof textStyle.color === "string" ? textStyle.color : null,
        fontSize: typeof textStyle.fontSize === "string" ? textStyle.fontSize : null,
        highlight: current.isActive("highlight"),
        highlightColor: (current.getAttributes("highlight").color as string | undefined) ?? null,
        alignment: alignment ?? "left",
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const chain = () => editor.chain().focus();

  const blockButtons = (
    <>
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
    </>
  );

  const listButtons = (
    <>
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
    </>
  );

  const strikeButton = (className?: string) => (
    <ToolbarButton
      icon={Strikethrough}
      label="Strikethrough"
      shortcut="Mod+Shift+S"
      active={state.strike}
      onClick={() => chain().toggleStrike().run()}
      className={className}
    />
  );

  const quoteButton = (className?: string) => (
    <ToolbarButton
      icon={TextQuote}
      label="Quote"
      shortcut="Mod+Shift+B"
      active={state.blockquote}
      onClick={() => chain().toggleBlockquote().run()}
      className={className}
    />
  );

  const clearButton = (
    <ToolbarButton
      icon={RemoveFormatting}
      label="Clear formatting"
      onClick={() => chain().unsetAllMarks().unsetTextAlign().run()}
    />
  );

  const alignmentButtons = ALIGNMENTS.map(({ value, label, icon, shortcut }) => (
    <ToolbarButton
      key={value}
      icon={icon}
      label={label}
      shortcut={shortcut}
      active={state.alignment === value}
      onClick={() =>
        value === "left"
          ? chain().unsetTextAlign().run()
          : chain().setTextAlign(value).run()
      }
    />
  ));

  const setFontSize = (size: string | null) =>
    size ? chain().setFontSize(size).run() : chain().unsetFontSize().run();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-controls="document-content"
      className="@container flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-[0_1px_2px_rgba(28,27,25,0.04)]"
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

      <ToolbarGroup divided className={TIER_2}>
        {blockButtons}
      </ToolbarGroup>

      <ToolbarGroup divided className={TIER_3}>
        <ToolbarPopover
          label={`Font size: ${state.fontSize ? state.fontSize : "16px (default)"}`}
          trigger={
            <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums">
              {state.fontSize ? state.fontSize.replace("px", "") : DEFAULT_FONT_SIZE_LABEL}
            </span>
          }
        >
          {(close) => (
            <FontSizeOptions
              current={state.fontSize}
              onSelect={(size) => {
                setFontSize(size);
                close();
              }}
            />
          )}
        </ToolbarPopover>
      </ToolbarGroup>

      <ToolbarGroup divided>
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
        {strikeButton(TIER_3_BUTTON)}
      </ToolbarGroup>

      <ToolbarGroup divided>
        <ToolbarPopover
          label="Text color"
          active={state.textColor !== null}
          trigger={
            <span className="relative inline-flex">
              <Baseline aria-hidden="true" className="size-4" />
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-1 h-1 rounded-full"
                style={{ backgroundColor: state.textColor ?? "var(--color-ink)" }}
              />
            </span>
          }
        >
          {(close) => (
            <ColorOptions
              label="Text color"
              colors={TEXT_COLORS}
              current={state.textColor}
              resetLabel="Default color"
              swatch="text"
              onSelect={(color) => {
                if (color) chain().setColor(color).run();
                else chain().unsetColor().run();
                close();
              }}
            />
          )}
        </ToolbarPopover>
        <ToolbarPopover
          label="Highlight"
          active={state.highlight}
          trigger={
            <span className="relative inline-flex">
              <Highlighter aria-hidden="true" className="size-4" />
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-1 h-1 rounded-full"
                style={{ backgroundColor: state.highlightColor ?? (state.highlight ? "#fef08a" : "transparent") }}
              />
            </span>
          }
        >
          {(close) => (
            <ColorOptions
              label="Highlight color"
              colors={HIGHLIGHT_COLORS}
              current={state.highlight ? (state.highlightColor ?? HIGHLIGHT_COLORS[0].value) : null}
              resetLabel="No highlight"
              swatch="background"
              onSelect={(color) => {
                if (color) chain().setHighlight({ color }).run();
                else chain().unsetHighlight().run();
                close();
              }}
            />
          )}
        </ToolbarPopover>
      </ToolbarGroup>

      <ToolbarGroup divided className={TIER_3}>
        {alignmentButtons}
      </ToolbarGroup>

      <ToolbarGroup divided className={TIER_2}>
        {listButtons}
        {quoteButton(TIER_3_BUTTON)}
      </ToolbarGroup>

      <ToolbarGroup divided className={TIER_3}>
        {clearButton}
      </ToolbarGroup>

      <ToolbarGroup divided className="flex @min-[840px]:hidden">
        <ToolbarPopover label="More formatting" align="end" trigger={<Ellipsis aria-hidden="true" className="size-4" />}>
          {(close) => (
            <div className="flex w-[15rem] flex-col gap-3" onClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) close();
            }}>
              <MenuSection label="Text style" className={IN_MENU_TIER_2}>
                {blockButtons}
              </MenuSection>
              <MenuSection label="Lists" className={IN_MENU_TIER_2}>
                {listButtons}
                {quoteButton()}
              </MenuSection>
              <MenuSection label="Lists" className="hidden @min-[560px]:flex @min-[840px]:hidden">
                {quoteButton()}
              </MenuSection>
              <MenuSection label="Style" className={IN_MENU_TIER_3}>
                {strikeButton()}
                {clearButton}
              </MenuSection>
              <MenuSection label="Alignment" className={IN_MENU_TIER_3}>
                {alignmentButtons}
              </MenuSection>
              <div className={`${IN_MENU_TIER_3} flex-col`}>
                <p className="mb-1.5 text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                  Font size
                </p>
                <FontSizeOptions current={state.fontSize} onSelect={setFontSize} />
              </div>
            </div>
          )}
        </ToolbarPopover>
      </ToolbarGroup>
    </div>
  );
}

function ToolbarGroup({
  children,
  divided = false,
  className = "flex",
}: {
  children: ReactNode;
  divided?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${className} items-center gap-0.5 ${
        divided ? "before:mx-1 before:h-5 before:w-px before:bg-line before:content-['']" : ""
      }`}
    >
      {children}
    </div>
  );
}

/** `className` sets the display (e.g. a tier class), so it must include `flex` when visible. */
function MenuSection({ label, className = "flex", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`flex-col gap-1.5 ${className}`}>
      <p aria-hidden="true" className="text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-0.5">{children}</div>
    </div>
  );
}

const buttonBase =
  "items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";
const buttonIdle = "text-ink-muted hover:bg-black/[0.05] hover:text-ink";
const buttonActive = "bg-accent-soft text-accent";

type ToolbarButtonProps = {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Display utilities; defaults to "inline-flex". */
  className?: string;
};

function ToolbarButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  active,
  disabled,
  className = "inline-flex",
}: ToolbarButtonProps) {
  const shortcutHint = shortcut?.replace("Mod", "Ctrl/⌘");

  return (
    <button
      type="button"
      // Keep the editor's selection and focus when clicking with a pointer.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      aria-keyshortcuts={shortcut?.replace("Mod", "Control")}
      title={shortcutHint ? `${label} (${shortcutHint})` : label}
      className={`${buttonBase} size-8 shrink-0 ${active ? buttonActive : buttonIdle} ${className}`}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}

type ToolbarPopoverProps = {
  label: string;
  trigger: ReactNode;
  active?: boolean;
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
};

/** A toolbar button that opens a small panel. Escape or clicking outside closes it. */
function ToolbarPopover({ label, trigger, active = false, align = "start", children }: ToolbarPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedWithKeyboardRef = useRef(false);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    if (openedWithKeyboardRef.current) {
      panelRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const focusInside = rootRef.current?.contains(document.activeElement);
      setIsOpen(false);
      if (focusInside) {
        event.preventDefault();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative flex">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          openedWithKeyboardRef.current = event.detail === 0;
          setIsOpen((open) => !open);
        }}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-haspopup="true"
        title={label}
        className={`${buttonBase} inline-flex h-8 shrink-0 gap-0.5 pr-1 pl-2 ${active || isOpen ? buttonActive : buttonIdle}`}
      >
        {trigger}
        <ChevronDown aria-hidden="true" className="size-3 opacity-60" />
      </button>
      {isOpen ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={label}
          className={`absolute top-full z-30 mt-1.5 rounded-xl border border-line bg-surface p-2.5 shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children(() => setIsOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

type ColorOptionsProps = {
  label: string;
  colors: readonly PaletteColor[];
  current: string | null;
  resetLabel: string;
  swatch: "text" | "background";
  onSelect: (color: string | null) => void;
};

function ColorOptions({ label, colors, current, resetLabel, swatch, onSelect }: ColorOptionsProps) {
  return (
    <div className="flex w-max flex-col gap-2">
      <div className="flex gap-1" role="group" aria-label={label}>
        {colors.map((color) => {
          const selected = current === color.value;
          return (
            <button
              key={color.value}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(color.value)}
              aria-label={color.label}
              aria-pressed={selected}
              title={color.label}
              className={`relative inline-flex size-7 items-center justify-center rounded-md border text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                selected ? "border-ink" : "border-line-strong hover:border-ink-muted"
              }`}
              style={
                swatch === "text"
                  ? { color: color.value, backgroundColor: "#ffffff" }
                  : { backgroundColor: color.value, color: "var(--color-ink)" }
              }
            >
              {selected ? <Check aria-hidden="true" className="size-3.5" /> : <span aria-hidden="true">A</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect(null)}
        aria-pressed={current === null}
        className="rounded-md px-2 py-1 text-left text-xs font-medium text-ink-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        {resetLabel}
      </button>
    </div>
  );
}

function FontSizeOptions({
  current,
  onSelect,
}: {
  current: string | null;
  onSelect: (size: string | null) => void;
}) {
  const options: { value: string | null; label: string }[] = [
    { value: null, label: `${DEFAULT_FONT_SIZE_LABEL} (default)` },
    ...FONT_SIZES.map((size) => ({ value: size, label: size.replace("px", "") })),
  ].sort((a, b) => Number.parseInt(a.label) - Number.parseInt(b.label));

  return (
    <div className="grid w-max grid-cols-4 gap-1" role="group" aria-label="Font size">
      {options.map((option) => {
        const selected = current === option.value;
        return (
          <button
            key={option.label}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(option.value)}
            aria-pressed={selected}
            aria-label={option.value ? `${option.label} pixels` : "16 pixels (default)"}
            className={`h-7 rounded-md px-2 text-xs font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
              option.value === null ? "col-span-2" : ""
            } ${selected ? buttonActive : "text-ink-muted hover:bg-canvas hover:text-ink"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
