# Folio — Product Improvements & Final Polish Backlog

**Project:** Folio collaborative document workspace — Ajaia assessment
**Status of this file:** Requirements and implementation plan, not proof that features have been implemented. Progress notes are added under [Progress](#progress) as each slice is verified.
**Scope:** Local development first. Deployment is intentionally excluded from the current improvement sprint; the original assessment still requires a publicly accessible URL.

## Baseline to preserve

From the Task 6 implementation report, re-run before this sprint started (see [Progress](#progress)):

- Next.js 16, TypeScript, Tailwind, Tiptap v3, Supabase Auth/Postgres/RLS, Vitest.
- Authentication, owned/shared dashboards, create/rename/edit/autosave/reopen, `.txt`/`.md` import, owner/editor/viewer sharing.
- 209/209 unit tests passing in seven files; 33/33 hosted Supabase RLS checks; 43 local SQL policy checks; lint, type-check and production build passing.
- Task 6 fixes: stale authenticated data after logout/account switching, safer sign-out, stale dashboard refresh, sharing dialog focus, non-retriable save states, mobile drawer focus trapping, contrast fixes, and sensitive argument logging prevention.

Do not rewrite established authentication, secure RLS policies, editor autosave, sharing flows, or import paths merely to add UI features.

## Prioritized requirements

### P0 — Safeguard existing work (first)

- [ ] Review git status, review Task 6 changes and ensure `.env.local` and secrets are not staged.
- [ ] Run `npm run lint`, `npx tsc --noEmit`, `npm run test -- --run`, `npm run build` and, when demo accounts/environment are configured, `npm run test:rls-live`.
- [ ] Commit current working state before further changes.

### P1 — Expand rich-text toolbar

- [ ] Text color picker with a small predefined safe color palette and Reset color.
- [ ] Multi-color text highlighting with Remove highlight.
- [ ] Paragraph and heading alignment: left, center, right, justify; show active state.
- [ ] Selective useful extras: strikethrough, clear formatting, font size dropdown (bounded values), optional block quote; retain existing bold/italic/underline/headings/lists/undo/redo.
- [ ] Group toolbar controls with separators; use overflow or a More dropdown on mobile rather than an endlessly scrolling row.
- [ ] Keep the toolbar accessible with aria-label, active states, keyboard focus, and text-selection preservation when clicking controls.
- [ ] Viewer mode remains read-only. Editor/owner may format.
- [ ] **Critical:** extend the shared Tiptap schema/content validation to accept only the new supported marks/attributes (textStyle, color, highlight, textAlign, font size, etc.); use a bounded palette/whitelist rather than arbitrary CSS. Confirm JSON round-trip and autosave across reload. Ensure the import pipeline can coexist with this schema.
- [ ] Do not register duplicate Tiptap extensions. Prefer matching Tiptap v3 extensions: `@tiptap/extension-highlight`, `@tiptap/extension-text-align`, `@tiptap/extension-text-style` (TextStyleKit) where compatible with the installed version.

### P1 — Collapsible sidebar

- [ ] Explicit sidebar toggle visible from all workspace pages (open/close).
- [ ] On desktop, support expanded navigation and a compact/closed mode to give the editor more horizontal room. Use a compact icon rail only if it remains clear; otherwise fully collapse.
- [ ] On mobile, preserve the accessible drawer behavior from Task 6 (focus trap, Escape to close, focus restoration, overlay).
- [ ] No hydration mismatch from persistent client preferences; optional preference persistence only after hydration.
- [ ] Preserve active navigation state, account menu access, and keyboard navigation.

### P1 — Working document search

- [ ] Wire the existing dashboard search field; search document titles case-insensitively with clear/reset and a proper no-results state.
- [ ] Support both My Documents and Shared With Me (section-specific search or explicit scope switching).
- [ ] If the current lists are small, filter the already-authorized loaded data client-side; do not create a new broad search endpoint. If server search is needed, it must respect Supabase RLS and current user identity.
- [ ] Keyboard support: focus search, Esc clears, optional debounce if querying the server.
- [ ] Search reflects rename, imports, copies, shares, revocations and deletions; never exposes private titles when users switch accounts.

### P1 — Document actions menu

- [ ] A "…" menu on document rows and/or the document editor header: Rename (reuse existing), Make a copy, Download, Copy link, Delete (owner only).
- [ ] **Make a copy:** create a new document owned by the authenticated current user, preserving title/content JSON and formatting, with a distinct title such as "Copy of …". Confirm permissions before cloning; do not copy share permissions or transfer ownership.
- [ ] **Download:** start with `.txt` and `.md` exports from authorized content. Respect permissions. Use safe filenames. If local edits are pending, save first or clearly say the export is from the latest saved state.
- [ ] **Copy link:** copy the current document URL; explicitly note that the link itself grants no access and recipients still require a share invitation.
- [ ] **Delete:** owner-only, with a confirmation dialog naming the document and a clear permanent-delete warning (no Trash in this scope); remove the document and cascading share records, return to the dashboard, show success/error feedback. Prevent deletion of someone else's document through both Server Actions and RLS.
- [ ] On Shared With Me, limit actions according to role; don't present actions users can't perform. Defaults for this slice: owner may delete; owner/editor may duplicate and export; viewer may copy link and read only. Document these defaults.

### P1 — Import `.docx` into an editable document

- [ ] Extend the Import File UI to `.txt`, `.md`, and `.docx`.
- [ ] Parse `.docx` on the server and convert it into the same supported Tiptap JSON schema. Reuse the authenticated, owner-only, single-insert import pipeline and the existing title/validation/error handling.
- [ ] Preserve, best effort, paragraphs, H1/H2, bold, italic, underline and lists; alignment and colors where safely supported. Document conversion fidelity limits (tables, images, headers, comments, page layout, unsupported typography).
- [ ] Use a maintained free/open-source converter such as mammoth for DOCX-to-semantic HTML, but never render unsanitized converter HTML. Strip/reject scripts, event handlers, unsupported nodes, URLs and embedded images; transform only an explicit allowlist of content into Tiptap JSON and validate again.
- [ ] Keep external file access disabled. Limit `.docx` input (suggested 2 MB maximum, configurable) and the resulting JSON size (existing 500 KB document limit). Reject broken or suspicious archives, oversized decompression and excessive complexity as appropriate.
- [ ] Invalid files or conversion failures must not create database rows. Do not store the original raw files. No paid conversion APIs.
- [ ] Update the import hint, file picker, README, and sample files. The legacy `.doc` format remains unsupported.

### P2 — Additional polish from the Task 6 report

- [ ] Investigate the remaining ~0.1-second stale-dashboard flash during back navigation; fix without weakening access control or regressing responsiveness.
- [ ] Consider cross-tab logout propagation (e.g. BroadcastChannel or the storage event) without putting private data in messages; don't spend excessive time.
- [ ] Manually verify edge cases not covered by the Task 6 browser run: expired session while editing, offline autosave/retry, title rename via real focus/blur, native dialog Escape, import regression after recent fixes.
- [ ] Verify 375/768/1440 px layouts after the toolbar and sidebar changes; fix sticky toolbar/header offsets if required.
- [ ] Preserve accessible modal focus behavior, mobile drawer focus handling, and minimum contrast.

## Regressions and acceptance checks

1. Create document → format with new colors/alignment → wait for autosave → refresh → formatting identical.
2. Bold/italic/underline/headings/lists and old stored JSON continue to work.
3. Viewer cannot use new editing controls or call content-update actions; editor can format; owner can share.
4. Sidebar opens/closes on desktop and mobile without covering the editor unexpectedly; keyboard and focus work.
5. Search returns only authorized results and updates after create, rename, import, share, revoke, copy and delete.
6. Duplicate retains structured formatting, uses the authenticated user as owner, and does not inherit collaborator shares.
7. Delete requires confirmation, updates the list immediately, denies any further document fetch or edit, and follows RLS; deleting another user's document is forbidden.
8. Download produces a valid file for an authorized document, with clear limitations on format preservation.
9. DOCX import handles representative headings/emphasis/lists and malformed/oversized/dangerous files, with no unsanitized HTML rendered and no partial DB inserts.
10. Sign-out/account switch remains free of private data in visible or hidden markup; browser Back cannot reveal data.
11. Rerun lint, TypeScript, all unit tests, production build, and hosted RLS checks if permissions/data operations changed. Record exact results; do not assume a test passed.

## Implementation sequence (separate commits)

1. Baseline: verify and commit Task 6 work; create this file.
2. UI navigation and search: collapsible sidebar and working dashboard search; automated tests; commit.
3. Editor polish: extended Tiptap toolbar, schema and validation, persistence tests; commit.
4. Document actions: menu, duplicate, export `.txt`/`.md`, copy link, owner-only delete; security tests; commit.
5. DOCX import: server conversion, sanitization, limits, regression tests; commit.
6. Final QA: manually test both demo users, keyboard/mobile, all file types and export; update README, architecture, AI workflow and submission disclosures; commit.

## Timebox guardrails

If time is almost exhausted, prioritize: (a) baseline security and reliable save, (b) functional search/sidebar, (c) text highlighting/alignment, (d) duplicate/delete/download, and (e) DOCX import only if it can be safely tested. Do not sacrifice working sharing or persistence to create a large toolbar. State partial or incomplete work explicitly.

## Submission reminder

The original assessment requires a public live URL and a 3–5 minute walkthrough video. Both remain pending while deployment is excluded. Do not claim a complete submission without them.

## Implementation references

- [Tiptap TextAlign](https://tiptap.dev/docs/editor/extensions/functionality/textalign)
- [Tiptap Highlight](https://tiptap.dev/docs/editor/extensions/marks/highlight)
- [Tiptap TextStyleKit](https://tiptap.dev/docs/editor/extensions/functionality/text-style-kit)
- [Mammoth DOCX conversion and security notes](https://github.com/mwilliamson/mammoth.js)

## Progress

### Slice 1 — Baseline (Nov 11, 2026)

- Task 6 was already committed as `06760d1`; the working tree was clean. `.env.local` is ignored (`.gitignore` rule `.env*`), only `.env.example` is tracked, and a scan of the commit found no passwords, JWTs, or secret keys.
- Re-run results: `npm run lint` exit 0; `npx tsc --noEmit` exit 0; `npm run test -- --run` 209/209 in 7 files; `npm run build` exit 0; `npm run test:rls-live` 33 passed, 0 failed against the hosted project.
