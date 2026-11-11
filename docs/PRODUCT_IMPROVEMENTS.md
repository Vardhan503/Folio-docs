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

- [x] Review git status, review Task 6 changes and ensure `.env.local` and secrets are not staged.
- [x] Run `npm run lint`, `npx tsc --noEmit`, `npm run test -- --run`, `npm run build` and, when demo accounts/environment are configured, `npm run test:rls-live`.
- [x] Commit current working state before further changes.

### P1 — Expand rich-text toolbar

- [x] Text color picker with a small predefined safe color palette and Reset color.
- [x] Multi-color text highlighting with Remove highlight.
- [x] Paragraph and heading alignment: left, center, right, justify; show active state.
- [x] Selective useful extras: strikethrough, clear formatting, font size dropdown (bounded values), optional block quote; retain existing bold/italic/underline/headings/lists/undo/redo.
- [x] Group toolbar controls with separators; use overflow or a More dropdown on mobile rather than an endlessly scrolling row.
- [x] Keep the toolbar accessible with aria-label, active states, keyboard focus, and text-selection preservation when clicking controls.
- [x] Viewer mode remains read-only. Editor/owner may format.
- [x] **Critical:** extend the shared Tiptap schema/content validation to accept only the new supported marks/attributes (textStyle, color, highlight, textAlign, font size, etc.); use a bounded palette/whitelist rather than arbitrary CSS. Confirm JSON round-trip and autosave across reload. Ensure the import pipeline can coexist with this schema.
- [x] Do not register duplicate Tiptap extensions. Prefer matching Tiptap v3 extensions: `@tiptap/extension-highlight`, `@tiptap/extension-text-align`, `@tiptap/extension-text-style` (TextStyleKit) where compatible with the installed version.

### P1 — Collapsible sidebar

- [x] Explicit sidebar toggle visible from all workspace pages (open/close).
- [x] On desktop, support expanded navigation and a compact/closed mode to give the editor more horizontal room. Use a compact icon rail only if it remains clear; otherwise fully collapse.
- [x] On mobile, preserve the accessible drawer behavior from Task 6 (focus trap, Escape to close, focus restoration, overlay).
- [x] No hydration mismatch from persistent client preferences; optional preference persistence only after hydration.
- [x] Preserve active navigation state, account menu access, and keyboard navigation.

### P1 — Working document search

- [x] Wire the existing dashboard search field; search document titles case-insensitively with clear/reset and a proper no-results state.
- [x] Support both My Documents and Shared With Me (section-specific search or explicit scope switching).
- [x] If the current lists are small, filter the already-authorized loaded data client-side; do not create a new broad search endpoint. If server search is needed, it must respect Supabase RLS and current user identity.
- [x] Keyboard support: focus search, Esc clears, optional debounce if querying the server.
- [x] Search reflects rename, imports, copies, shares, revocations and deletions; never exposes private titles when users switch accounts.

### P1 — Document actions menu

- [x] A "…" menu on document rows and/or the document editor header: Rename (reuse existing), Make a copy, Download, Copy link, Delete (owner only).
- [x] **Make a copy:** create a new document owned by the authenticated current user, preserving title/content JSON and formatting, with a distinct title such as "Copy of …". Confirm permissions before cloning; do not copy share permissions or transfer ownership.
- [x] **Download:** start with `.txt` and `.md` exports from authorized content. Respect permissions. Use safe filenames. If local edits are pending, save first or clearly say the export is from the latest saved state.
- [x] **Copy link:** copy the current document URL; explicitly note that the link itself grants no access and recipients still require a share invitation.
- [x] **Delete:** owner-only, with a confirmation dialog naming the document and a clear permanent-delete warning (no Trash in this scope); remove the document and cascading share records, return to the dashboard, show success/error feedback. Prevent deletion of someone else's document through both Server Actions and RLS.
- [x] On Shared With Me, limit actions according to role; don't present actions users can't perform. Defaults for this slice: owner may delete; owner/editor may duplicate and export; viewer may copy link and read only. Document these defaults.

### P1 — Import `.docx` into an editable document

- [x] Extend the Import File UI to `.txt`, `.md`, and `.docx`.
- [x] Parse `.docx` on the server and convert it into the same supported Tiptap JSON schema. Reuse the authenticated, owner-only, single-insert import pipeline and the existing title/validation/error handling.
- [x] Preserve, best effort, paragraphs, H1/H2, bold, italic, underline and lists; alignment and colors where safely supported. Document conversion fidelity limits (tables, images, headers, comments, page layout, unsupported typography).
- [x] Use a maintained free/open-source converter such as mammoth for DOCX-to-semantic HTML, but never render unsanitized converter HTML. Strip/reject scripts, event handlers, unsupported nodes, URLs and embedded images; transform only an explicit allowlist of content into Tiptap JSON and validate again.
- [x] Keep external file access disabled. Limit `.docx` input (suggested 2 MB maximum, configurable) and the resulting JSON size (existing 500 KB document limit). Reject broken or suspicious archives, oversized decompression and excessive complexity as appropriate.
- [x] Invalid files or conversion failures must not create database rows. Do not store the original raw files. No paid conversion APIs.
- [x] Update the import hint, file picker, README, and sample files. The legacy `.doc` format remains unsupported.

### P2 — Additional polish from the Task 6 report

- [x] Investigate the remaining ~0.1-second stale-dashboard flash during back navigation; fix without weakening access control or regressing responsiveness.
- [x] Consider cross-tab logout propagation (e.g. BroadcastChannel or the storage event) without putting private data in messages; don't spend excessive time.
- [ ] Manually verify edge cases not covered by the Task 6 browser run: expired session while editing, offline autosave/retry, title rename via real focus/blur, native dialog Escape, import regression after recent fixes. (Partially covered: rename via React `onBlur` and `.docx` import verified in this pass; session/offline/Escape still open on the checklist.)
- [x] Verify 375/768/1440 px layouts after the toolbar and sidebar changes; fix sticky toolbar/header offsets if required.
- [x] Preserve accessible modal focus behavior, mobile drawer focus handling, and minimum contrast (carried forward from Task 6 / earlier slices; re-checked with layout pass).

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

### Slice 2 — Sidebar and search (`c1de1e4`)

- Desktop sidebar toggle (preference in `localStorage`, read with `useSyncExternalStore` and a server snapshot of "expanded", so there is no hydration mismatch); the Task 6 mobile drawer is unchanged.
- Header title search over the lists each page already loaded (no new endpoint): case- and accent-insensitive, `/` to focus, Escape to clear, a match count, and a "No matching documents" state with Clear search. The query is kept in memory per page and resets on sign-out because the full page load discards it.
- Verified in the browser as the second demo user at 1440 px and 375 px. Tests: 224/224.

### Slice 3 — Editor formatting (`c748b33`)

- Official Tiptap `TextStyle`, `Color`, `FontSize`, `Highlight` (multicolor), and `TextAlign` extensions, wrapped so they parse and render only palette values. Toolbar: text color, highlight, font size, strikethrough, alignment, quote, and clear formatting, with a container-query **More** menu on narrow toolbars.
- `validation.ts` accepts `textStyle` and `highlight` marks and `textAlign` only with values from `formatting.ts`; anything else is rejected on save.
- Verified in the browser: colour, highlight, size, and alignment survive autosave and a reload with identical JSON; layouts at 375, 1100 (sidebar open and closed), and 1440 px. Tests: 246/246; lint, tsc, build clean; `npm audit --omit=dev` 0 vulnerabilities.

### Slice 4 — Document actions (`1cb5bcd`)

- Editor-header **⋯** menu: Rename, Make a copy, Download `.txt` / `.md`, Copy link, and owner-only Delete with a confirmation dialog. No migration: the owner-only delete policy and the `on delete cascade` from shares already existed.
- Server functions re-check the role through RLS: copy and download need owner or editor, delete needs owner (and filters by `owner_id`). Delete calls `revalidatePath("/", "layout")` so pages kept in the client cache are refetched.
- Verified in the browser as the second demo user on their own document: rename, both downloads (content and the `Q3 plan final` filename), copy made right after an edit includes that edit, delete dialog (Cancel focused by default) returns to My Documents with a notice, the copy's URL then shows "Document not found"; as an editor on a shared document the menu has no Delete. Not verified in the browser: viewer menu (only Copy link) and a successful clipboard write (the automation tab has no window focus, so the clipboard is refused and the fallback message was shown).
- `npm run test:rls-live`: 39 passed, 0 failed (new: anonymous and viewer can't delete, owner deletes exactly one row, shares are removed with the document).
- Tests: 282/282 in 11 files; lint, tsc, build clean.

### Slice 5 — DOCX import

- Import accepts `.txt`, `.md`, and `.docx`. `.docx` uses mammoth locally (no paid API); Folio reads mammoth's document model and builds Tiptap JSON directly — the HTML mammoth can produce is discarded. Images are never read; external file access is off.
- Before mammoth runs, [`docx-archive.ts`](../src/lib/import/docx-archive.ts) inspects the ZIP: required Word parts, no encryption / ZIP64 / multi-volume / unknown compression, measured decompression with caps (1,000 entries, 10 MB/entry, 25 MB total). Invalid or unsafe archives never touch the database.
- Best-effort conversion: Title/H1/H2, bold/italic/underline/strike, nested lists, quotes, alignment, tables flattened to ` | `, link text kept without URLs. Fonts, colors, sizes, images, comments, and H3+ are dropped. Legacy `.doc` is rejected with a clear message. Limit: 1 MB upload (under the default Server Action body size).
- Verified in the browser with [`sample.docx`](../sample.docx): opened as title `sample` with headings, marks, lists, quote, and flattened table; no scripts/URLs in content. Damaged `.docx` creates no row (unit-tested).
- Tests: 304/304 in 12 files (including the checked-in `sample.docx` fixture); lint, tsc, build clean. RLS live suite not re-run for this slice (import uses the same owner-only insert path; no policy change).

### Slice 6 — Final polish

- Dashboard return path: `useRefreshOnReturn` runs `router.refresh()` inside `useLayoutEffect` + `useTransition`, and the list sections show their loading placeholders while the transition is pending so previous titles are not painted. Browser check: after rename + Back, the old title never appeared; the new title showed once data arrived.
- Cross-tab sign-out: `BroadcastChannel("folio-session")` posts `{ type: "signed-out" }` only (no emails, tokens, or document data). Other signed-in tabs replace the page with `/login`.
- Layouts after toolbar/sidebar work: at 375 / 768 / 1440 px, no horizontal overflow; sticky toolbar offsets matched header height (109 px mobile, 61 px from `sm` up); desktop sidebar 256 px at 1440.
- Docs: [`architecture.md`](architecture.md), [`ai-workflow.md`](ai-workflow.md), [`submission.md`](submission.md) (public URL and walkthrough video still pending).
- Validation this slice: lint 0, `tsc --noEmit` 0, Vitest **305/305** in 12 files, `npm run build` 0. Hosted RLS not re-run (no policy or data-access permission changes).
- Still open for a human pass: expired-session-while-editing, offline autosave/retry, native dialog Escape, and a focused clipboard "Copy link" check (automation often lacks window focus).

