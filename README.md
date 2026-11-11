# Folio

Folio is a lightweight collaborative document editor inspired by Google Docs, built for the Ajaia engineering assessment.

This repository currently contains:

- **Task 1:** the application shell and document dashboard.
- **Task 2:** Supabase email/password authentication, route protection, and the database foundation (schema, row-level security, typed data access).
- **Task 3:** creating documents, rich-text editing with Tiptap, renaming, autosave, and reopening saved documents.
- **Task 4:** importing `.txt` and `.md` files as new documents.
- **Task 5:** sharing documents with other registered users as viewers or editors, and the Shared With Me dashboard.
- **Task 6:** a quality, security, and usability pass: sign-out and account-switch privacy, refreshing preserved pages, clearer save failures, accessibility fixes, more tests, a live RLS check, and a [QA checklist](docs/qa-checklist.md).
- **Product improvements:** collapsible sidebar, title search, extended formatting toolbar, document actions (copy / download / delete), `.docx` import, and final polish — see [`docs/PRODUCT_IMPROVEMENTS.md`](docs/PRODUCT_IMPROVEMENTS.md). Submission status (public URL and walkthrough video) is in [`docs/submission.md`](docs/submission.md).

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, Cache Components, Turbopack)
- React 19 and TypeScript
- Tailwind CSS 4
- [lucide-react](https://lucide.dev) icons
- [Supabase](https://supabase.com) Auth and Postgres via `@supabase/supabase-js` and `@supabase/ssr`
- [Tiptap](https://tiptap.dev) v3 editor, with `@tiptap/markdown` for Markdown import
- [Vitest](https://vitest.dev) for unit tests

## Local setup

Requirements: Node.js 20.9 or newer, npm, and a Supabase project.

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database schema

In the Supabase dashboard, open **SQL Editor** and run the contents of
[`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
(With the Supabase CLI linked to your project, `npx supabase db push` does the same.)

This creates the `profiles`, `documents`, and `document_shares` tables, a trigger that creates a profile for every new Auth user, and the row-level security policies.

Then run [`supabase/migrations/002_document_constraints.sql`](supabase/migrations/002_document_constraints.sql). It adds check constraints so the database itself rejects empty or overlong titles (1–120 characters) and content that isn't a Tiptap `doc`. The app validates the same rules first, so it works without this migration, but it is recommended.

Finally run [`supabase/migrations/003_document_sharing.sql`](supabase/migrations/003_document_sharing.sql), which is required for sharing (see [Applying the sharing migration](#applying-the-sharing-migration)). Without it the rest of the app works, but sharing fails with a "couldn't share" message and nothing is shared with you.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

| Variable                               | Where to find it                                    |
| -------------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project Settings → API → Project URL                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key        |

Both values are safe to expose to the browser; row-level security is what protects the data. **Do not** add the `service_role` / secret key: the app never needs it. `.env.local` is git-ignored.

### 4. Create the two demo users

Registration is intentionally not part of the app. Create users manually:

1. In the Supabase dashboard, go to **Authentication → Users → Add user → Create new user**.
2. Enter an email and password and tick **Auto Confirm User**.
3. Repeat for a second user, e.g. `alice@example.com` and `bob@example.com`.
4. Optional: to set a display name, add `{"full_name": "Alice Chen"}` as user metadata when creating the user. Otherwise the part of the email before `@` is used.

The `on_auth_user_created` trigger inserts a matching row into `public.profiles` for each user. Check **Table Editor → profiles** to confirm both rows exist. Two users let you verify that each person only sees their own documents, and are needed to test sharing (see [Testing sharing with two users](#testing-sharing-with-two-users)).

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login`; sign in with one of the users you created.

### Scripts

| Command            | Purpose                    |
| ------------------ | -------------------------- |
| `npm run dev`      | Start the dev server       |
| `npm run lint`     | Run ESLint                 |
| `npx tsc --noEmit` | Type-check the project     |
| `npm run test`     | Run Vitest in watch mode   |
| `npm run test -- --run` | Run the tests once (CI) |
| `npm run test:rls-live` | Check RLS against your live project with two real users (see [Tests](#tests)) |
| `npm run build`    | Create a production build  |
| `npm start`        | Serve the production build |

## Documents

### Creating documents

**Create Document** on My Documents calls a Server Action that verifies the session, inserts a row with `owner_id` taken from the verified user (never from the browser), the title "Untitled document", and an empty Tiptap document, then navigates to `/documents/<id>`. The button is disabled while the request runs, and repeat submissions are ignored, so a double click creates one document. Failures show an inline error.

### Editing and formatting

The editor at `/documents/[documentId]` uses Tiptap v3: `StarterKit`, `Placeholder`, and the official `TextStyle`, `Color`, `FontSize`, `Highlight`, and `TextAlign` extensions. The toolbar offers:

- undo/redo; normal text, Heading 1, Heading 2;
- bold, italic, underline, strikethrough;
- text color (six colors plus default) and highlight (five colors plus none);
- font size (12, 14, 16 default, 18, 20, 24, 30 px);
- left, center, right, and justified alignment for paragraphs and headings;
- bulleted and numbered lists, quotes, and clear formatting.

Buttons show which formats are active and keep the text selection. The toolbar adapts to its own width (a CSS container query): narrow toolbars, on phones or with the sidebar open on smaller laptops, move the less common controls into a **More** menu instead of wrapping. Pickers close with Escape or a click outside. The usual shortcuts work (`Ctrl/⌘+B`, `I`, `U`, `Shift+S`, `Z`, `Shift+Z`, `Ctrl/⌘+Alt+1/2/0`, `Ctrl/⌘+Shift+7/8/B`, `Ctrl/⌘+Shift+L/E/R/J` for alignment). Markdown-style input such as `# `, `- `, and `1. ` also works. Viewers get no toolbar and a read-only editor.

**Formatting is whitelisted.** Colors, font sizes, and alignments are rendered as inline styles, so arbitrary values could inject CSS. [`src/lib/documents/formatting.ts`](src/lib/documents/formatting.ts) defines the only allowed values. The editor drops anything else when parsing pasted HTML (for example, a pasted color outside the palette becomes default text), renders only allowed values, and the server rejects any saved document that contains other values or unknown style attributes. Documents saved before these options existed still load and save unchanged.

Click the title to rename it. It saves when the field loses focus or you press Enter (Escape cancels). Titles are trimmed and must be 1–120 characters; an empty title is rejected and the previous one kept. If a rename fails, the typed title stays in the field with a Retry button.

### Autosave

- Every edit bumps a local revision number and restarts a 900 ms debounce timer, so typing doesn't hit the database on every keystroke.
- When the timer fires, the editor's JSON (`editor.getJSON()`) is sent to a Server Action. Only one content save is in flight at a time; edits made meanwhile are sent in a follow-up save with the latest content, so an older save can never overwrite a newer one.
- The status reads **Unsaved changes**, **Saving…**, **All changes saved** (with the last save time), or **Save failed**. "All changes saved" only appears once the latest revision has been stored.
- On failure, edits stay in the editor and the status never claims they were saved. For failures that a retry can fix (network or database errors, an expired session after signing in again in another tab), a Retry button appears and the next edit retries automatically. If the document is gone or your access was revoked or reduced to view-only, there's no Retry; the message tells you to copy anything you want to keep. `Ctrl/⌘+S` saves immediately.
- Leaving with unsaved changes triggers the browser's "leave page?" prompt; the in-app Back link asks for confirmation. If you navigate away inside the app, a final best-effort save is sent.
- Title and content are saved by separate actions that update separate columns, so renaming never overwrites content and vice versa.

### Document actions

The **⋯** button next to Share on a document page opens a menu (arrow keys, Home/End, and Escape work):

- **Rename** moves focus to the title field.
- **Make a copy** creates "Copy of …" with the same content and formatting, owned by you, and opens it. Shares are not copied, so the copy is private until you share it.
- **Download as plain text (.txt)** or **Download as Markdown (.md)** builds the file on the server from the stored document, named after the title with path separators and unsafe characters removed. Plain text keeps one line per block and list markers; Markdown keeps headings, bold, italic, strikethrough, lists, quotes, and code, writes underline as `<u>` and highlight as `==text==`, and drops color, size, and alignment, which Markdown can't express.
- **Copy link** copies the document's address. The link grants no access: only the owner and people it's shared with can open it.
- **Delete…** (owner only) asks for confirmation, naming the document and warning that deletion is permanent for everyone it's shared with. The document and its shares are removed, you return to My Documents with a confirmation, and the old address shows "Document not found".

Copying and downloading save pending edits first and wait for the save; if it fails, the action uses the last saved version and says so.

| Action                | Owner | Editor | Viewer |
| --------------------- | :---: | :----: | :----: |
| Rename                |  Yes  |  Yes   |   No   |
| Make a copy, download |  Yes  |  Yes   |   No   |
| Copy link             |  Yes  |  Yes   |  Yes   |
| Delete                |  Yes  |   No   |   No   |

The menu only shows what your role allows, but the server checks again: `duplicateDocument`, `exportDocument`, and `deleteDocument` read your role through RLS on every call and refuse other roles, and the database's delete policy only lets the owner delete.

### Persistence and ownership

- Content is stored as Tiptap JSON in `documents.content` (`jsonb`), never as HTML or plain text, and restored as-is when the document is reopened.
- All reads and writes go through [`src/lib/data/documents.ts`](src/lib/data/documents.ts): `createDocument`, `importDocument`, `listOwnedDocuments`, `getDocumentById`, `updateDocumentTitle`, `updateDocumentContent`, `duplicateDocument`, `exportDocument`, `deleteDocument`. Each one verifies the user with `getClaims()`, checks the document ID is a UUID, and validates input. Listing My Documents filters by `owner_id`; opening and saving a document rely on RLS to decide who can see it, and saving first checks that the user is the owner or an editor (see [Sharing](#sharing)). Results are typed `{ ok: true, data } | { ok: false, code, error }`.
- Content must be a JSON object with a `doc` root, use only the node and mark types the editor produces, nest at most 40 levels, and stay under 500 KB. Links are disabled in the editor and rejected on save.
- A missing document, a malformed ID, and someone else's document all produce the same "Document not found" page, so the app never reveals whether a document exists. Database errors are logged on the server and shown to the user as a generic message.
- Document pages are rendered per request and marked `private, no-store`; nothing user-specific is cached on the server.

## Importing files

### How to import

On **My Documents**, click **Import File** (also shown in the empty state when you have no documents) and choose a file. While the file is checked and uploaded, the button shows **Importing…** with the file name and can't be clicked again. On success Folio creates a new document and opens it in the editor; on failure an error appears under the button and you can pick the same file again.

| Rule              | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Supported types   | `.txt` (plain text), `.md` (Markdown), and `.docx` (Word), by file extension |
| Maximum file size | `.txt` and `.md`: 250 KB (256,000 bytes); `.docx`: 1 MB (1,000,000 bytes)  |
| Encoding          | `.txt` and `.md`: UTF-8 (a byte-order mark is fine); invalid UTF-8 and binary files are rejected |
| Title             | The file name without its extension, e.g. `meeting-notes.txt` → `meeting-notes` |

The browser checks the file first for quick feedback, and the server repeats every check, so skipping the browser check doesn't help. MIME types are ignored because Markdown files are reported differently by each OS. File names are reduced to their last path segment, control and bidirectional-override characters are removed, whitespace is collapsed, and the result must pass the normal 1–120 character title rule; otherwise the import is rejected with a message asking you to rename the file.

### Plain text (`.txt`)

Each line becomes a paragraph and blank lines become empty paragraphs. Windows (`\r\n`) and Unix (`\n`) line endings both work. The text is never interpreted as HTML or Markdown, so `<`, `>`, `&`, `#`, and `**` appear exactly as written.

### Markdown (`.md`)

Markdown is converted with [`@tiptap/markdown`](https://tiptap.dev/docs/editor/markdown) using the editor's own extensions, so imports only contain formatting the editor supports:

- Paragraphs, **Heading 1** (`#`) and **Heading 2** (`##`)
- **Bold** (`**text**`, `__text__`), *italic* (`*text*`, `_text_`), and both together
- Bulleted (`-`, `*`, `+`) and numbered (`1.`) lists, including nested lists and custom start numbers
- Also kept because the editor supports them: hard line breaks, blockquotes, code and code blocks, strikethrough, and horizontal rules

Constructs the editor doesn't support are handled predictably, keeping their text:

| Markdown                    | Imported as                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| `###` to `######` headings  | Normal paragraphs                                                    |
| Links and images            | Their link text or alt text; URLs are dropped (links aren't enabled) |
| Raw HTML (`<b>`, `<script>`) | Literal text; it is never rendered                                  |
| Tables                      | One paragraph per row, cells separated by ` \| `                    |
| Task lists (`- [ ] item`)   | List items starting with a literal `[ ]` or `[x]`                    |
| Single line breaks          | Spaces, as in rendered Markdown                                      |

### Word (`.docx`)

Word documents are converted on the server with [mammoth](https://github.com/mwilliamson/mammoth.js) (free, BSD-2-Clause, runs locally; no external service). Folio reads mammoth's parsed document model and builds Tiptap JSON from it directly; the HTML mammoth can produce is discarded, so no HTML is ever stored, rendered, or sanitized.

| Word                                              | Imported as                                    |
| ------------------------------------------------- | ---------------------------------------------- |
| Title, Heading 1                                  | Heading 1                                      |
| Subtitle, Heading 2                               | Heading 2                                      |
| Heading 3 and below                               | Normal paragraphs                              |
| Bold, italic, underline, strikethrough            | The same marks                                 |
| Bulleted and numbered lists, including nesting    | Bulleted and numbered lists                    |
| Quote and Intense Quote styles                    | A quote block                                  |
| Center, right, and justified alignment            | The same alignment                             |
| Line breaks                                       | Line breaks (page and column breaks are dropped) |
| Tables                                            | One paragraph per row, cells separated by ` \| ` |
| Hyperlinks                                        | Their text; the address is dropped             |
| Images, fonts, colors, sizes, highlights, comments, footnotes | Dropped                            |

Safety limits, checked before mammoth runs ([`docx-archive.ts`](src/lib/import/docx-archive.ts)):

- The file must be a ZIP archive containing `[Content_Types].xml` and `word/document.xml`. Password-protected, multi-volume, ZIP64, and unknown-compression archives, duplicate entry names, and entries whose real size doesn't match their header are rejected.
- Every entry is decompressed with a hard output cap, so the archive's own size claims aren't trusted: at most 1,000 entries, 10 MB per entry, and 25 MB in total. Larger archives (for example zip bombs) are rejected with a message before any parsing.
- mammoth runs with external file access off, and images are never read.
- The converted document must still pass the schema and the 500 KB content limit.

Older Word `.doc` files aren't supported; the error message asks you to save the file as `.docx`. [`sample.docx`](sample.docx) shows what's kept.

### What happens on the server

The `importDocumentAction` Server Action passes the uploaded file to `importDocument` in [`src/lib/data/documents.ts`](src/lib/data/documents.ts), which:

1. Verifies the signed-in user with `getClaims()`.
2. Checks the file's extension, size, and title ([`file-rules.ts`](src/lib/import/file-rules.ts)). Text files are read as strict UTF-8 and binary content is rejected; `.docx` files go through the archive checks above.
3. Converts it to Tiptap JSON ([`convert.ts`](src/lib/import/convert.ts), [`docx.ts`](src/lib/import/docx.ts)), then checks the result against the editor's ProseMirror schema and the same content validation autosave uses (allowed nodes and marks, nesting depth, 500 KB limit). Anything that fails is rejected with a clear message.
4. Inserts one row into the existing `documents` table, with `owner_id` taken from the verified user and the converted JSON in `content`.

Nothing is written unless every step succeeds. The raw file is never stored and no Storage bucket is needed: imported documents are ordinary Tiptap JSON documents, so they open in the editor, autosave, appear in My Documents sorted by last edit, and can be renamed like any other document.

## Sharing

### How to share

1. Open a document you own and click **Share** in the editor header (only owners see it).
2. Enter the email address of another Folio user, choose **Viewer** or **Editor**, and click **Share**.
3. The person appears under **People with access**. Use the role menu next to their name to switch between Viewer and Editor, or **Remove** (then confirm) to revoke access.

The person you shared with sees the document on **Shared With Me** (and in the shared section of My Documents) with its title, owner, last edit time, and a Viewer or Editor badge. Shares take effect on their next page load.

Errors are shown inline in the dialog: an invalid email, an email with no Folio account, your own email, someone who already has access, an expired session, and database failures each get their own message. The Share button is disabled while a request is in flight, so repeated clicks don't send duplicate requests, and a duplicate share is rejected by the database anyway.

### Permission model

| Action                                | Owner | Editor | Viewer |
| ------------------------------------- | :---: | :----: | :----: |
| Open and read the document            |  Yes  |  Yes   |  Yes   |
| Edit content and rename               |  Yes  |  Yes   |   No   |
| Share, change permissions, or revoke  |  Yes  |   No   |   No   |
| Make a copy or download               |  Yes  |  Yes   |   No   |
| Delete the document                   |  Yes  |   No   |   No   |
| Change the document's owner           |   No  |   No   |   No   |

- **Owners** keep the existing editor plus the Share button.
- **Editors** get the full editor with autosave and renaming, plus an "Editor" badge, but no sharing controls.
- **Viewers** get a read-only page: the content isn't editable, the title is plain text, the toolbar and save status are hidden, autosave never runs, and a "View only" badge and note explain why.

These UI differences are for clarity only. Every save is checked again by the server (`requireEditAccess` in [`documents.ts`](src/lib/data/documents.ts)) and by RLS in the database, so a viewer who edits the page by hand still can't save.

### Applying the sharing migration

Migration 003 is not applied automatically. Apply it yourself once per Supabase project:

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the contents of [`supabase/migrations/003_document_sharing.sql`](supabase/migrations/003_document_sharing.sql) and click **Run**. (Or, with the Supabase CLI linked, `npx supabase db push`.)
3. It should finish with "Success. No rows returned". If it reports that a function or policy "already exists", the migration was already applied.

The migration only adds functions, policies, and column privileges and drops one policy; it doesn't change or delete any rows or existing owner policies.

To check the policies against your project, open [`supabase/tests/003_document_sharing_rls.sql`](supabase/tests/003_document_sharing_rls.sql), replace the two placeholder emails at the top with your demo users' emails, and run it in the SQL editor. It runs 43 checks, switching the second user through unshared, viewer, editor, and revoked access and also testing anonymous access, inside a transaction that is rolled back, so it leaves no data behind, and ends with `ALL SHARING RLS CHECKS PASSED` or stops at the first failing check.

### Security model

- **No admin access.** The app only uses the publishable key, so every query runs as the signed-in user and RLS decides what they can see and change. There is no service-role key anywhere.
- **The database enforces roles.** Migration 003 adds two policies on `documents`: collaborators can read documents shared with them, and editors can update them. The owner policies from 001 are unchanged.
- **Ownership can't be changed.** Update privileges on `documents` are limited to the `title` and `content` columns, so nobody (owner or editor) can change `owner_id`, `id`, or `created_at` through the API. On `document_shares` only `role` can be updated, and only by the document's owner.
- **Only the owner manages sharing.** The server checks ownership before every sharing operation, and the 001 policies on `document_shares` (plus the new owner-only update policy) enforce it again. Owner IDs are never accepted from the browser; the server always uses the verified user.
- **No user directory.** 001 let any signed-in user read every profile. 003 replaces that with: your own profile, plus the profiles of people you share documents with. To add someone by email, the owner calls the `find_share_recipient` RPC, which returns a user ID only for an exact email match and only when the caller owns the document.
- **SECURITY DEFINER helpers are locked down.** Policies need to look at shares from documents and documents from shares; doing that with plain subqueries would make the policies recursive. The lookups therefore go through four small SECURITY DEFINER functions in a `private` schema that the Data API doesn't expose. Each sets `search_path = ''`, uses fully qualified names, checks `auth.uid()`, and is executable only by `authenticated`. The one public RPC is a SECURITY INVOKER wrapper.
- **Safe errors.** A document you can't access looks the same as one that doesn't exist. Database errors are logged on the server and shown as generic messages.

### Testing sharing with two users

After applying migration 003 and creating two users (called A and B here):

1. Sign in as A, create a document, type some text, and click **Share**. Share it with B's email as **Viewer**.
2. In a private window, sign in as B. The document appears on **Shared With Me** with a Viewer badge. Open it: it's read-only and shows "View only".
3. As A, change B to **Editor**. B reloads the document, sees the toolbar, edits the text and the title, and waits for "All changes saved". A reloads and sees B's changes.
4. As A, click **Remove** next to B and confirm. B reloads: the document is gone from Shared With Me and opening its URL shows "Document not found". If B still had it open, their next save fails with a clear message.
5. Also try sharing with A's own email, an unknown email, and B again while B already has access; each shows an inline error.

### Sharing limitations

- There is no realtime sync. Changes made by other people, and changes to your own access, show up when you reload or navigate back to a page. Two people editing at once is last-write-wins.
- Revoking access stops future loads and saves, but can't remove content that's already open in the other person's browser.
- Only registered users can be added, by exact email. The dialog tells the owner whether an email has a Folio account; that's necessary to share, but it does reveal account existence to document owners.
- Ownership can't be transferred, and collaborators can't remove themselves from a document.
- Collaborators on the same document can't see each other; only the owner sees the full list.

## Tests

```bash
npm run test -- --run
```

Vitest runs in Node with no network access or Supabase credentials:

- [`src/lib/documents/validation.test.ts`](src/lib/documents/validation.test.ts) covers title rules (valid, trimmed, empty, whitespace-only, overlong, non-string), content rules (valid documents, malformed roots and nodes, unsupported nodes and marks, heading levels, deep nesting, oversized and circular content), and UUID checks.
- [`src/lib/documents/editor-content.test.ts`](src/lib/documents/editor-content.test.ts) builds documents with the editor's real schema and checks they pass validation directly and after the JSON round trip used by autosave.
- [`src/lib/documents/formatting.test.ts`](src/lib/documents/formatting.test.ts) checks that colored, highlighted, resized, and aligned content survives the editor schema and the autosave round trip unchanged; that every palette value is accepted; that off-palette colors, CSS injection attempts, unbounded font sizes, unknown style attributes, and alignment on lists are rejected; that the editor won't render off-palette values; that older documents without alignment still validate; and how pasted CSS colors and sizes are normalized.
- [`src/lib/search.test.ts`](src/lib/search.test.ts) and [`src/lib/sidebar-preference.test.ts`](src/lib/sidebar-preference.test.ts) cover the title filter (case, accents, regex characters, only the given list) and the stored sidebar preference (default, invalid values, broken storage).
- [`src/lib/data/documents.test.ts`](src/lib/data/documents.test.ts) mocks the session and Supabase client to check that each operation uses the verified user's ID as owner, checks edit access before saving, rejects bad input without touching the database, reports expired sessions, treats rows hidden by RLS as not found, and hides database error details. The import tests also check that a successful import makes exactly one insert, and that failed validation or conversion makes none.
  The document action tests check that a copy is inserted with the caller as owner and never touches `document_shares`; that viewers can't copy or download; that unknown download formats are refused before any query; and that delete is refused for editors and viewers, filters by both `id` and `owner_id`, and treats a document RLS hides, or a delete that removed no row, as not found.
- [`src/lib/import/docx.test.ts`](src/lib/import/docx.test.ts) builds Word documents in the test with a small ZIP writer and checks headings, marks, nested and numbered lists, quotes, alignment, tables, line breaks, and link text; that markup-like text stays literal and link addresses never appear; that Word fonts and colors are dropped; and that empty, non-archive, non-Word, and malformed-XML files are rejected. It also forges archives to check that truncated files, encrypted entries, unknown compression, duplicate names, lying size headers, a zip bomb under 1 MB that claims to be small, too much total data, and too many entries are all rejected; plus the `.docx` size limit, the `.doc` message, and an end-to-end upload.
- [`src/lib/documents/export.test.ts`](src/lib/documents/export.test.ts) covers "Copy of" titles within the title limit, download filenames (path traversal, control and invisible characters, HTML, accents, length), plain-text and Markdown output for every block type, HTML typed as text being escaped in Markdown, and which roles may copy, download, and delete.
- [`src/lib/import/import.test.ts`](src/lib/import/import.test.ts) covers file rules (extensions, empty and oversized files, invalid UTF-8, binary content, file-name titles) and pins the exact JSON produced for plain text and for each supported and unsupported Markdown construct, because `@tiptap/markdown` is still in beta.
- [`src/components/editor/autosave-controller.test.ts`](src/components/editor/autosave-controller.test.ts) drives the autosave state machine with fake timers: debouncing, one save in flight with the newest content sent last, "saved" only once the latest revision is stored, failures for expired sessions, revoked access, view-only access, and database errors (edits kept, never shown as saved, Retry offered only when it can help), network failures followed by a successful retry, no saves when nothing was edited, and the final save when leaving the page.
- [`src/lib/server-actions.test.ts`](src/lib/server-actions.test.ts) checks that every document, sharing, and auth Server Action refuses a signed-out caller before touching Supabase, that sign-out clears only Supabase auth cookies when Supabase can't be reached (without logging cookie values), and the rule that reloads the page when the signed-in user changes.
- [`src/lib/data/sharing.test.ts`](src/lib/data/sharing.test.ts) covers sharing with the same mocks: owner, editor, and viewer roles when opening a document; unshared users treated as not found; editors saving and viewers refused (including an editor downgraded between saves); invalid document IDs, roles, and emails; sharing with yourself; unknown emails; duplicate shares; owner-only management of shares; permission changes; revocation; expired sessions; generic error messages; and update payloads that never contain `owner_id`. It also reads migration 003 to check the column-level update grants and that SECURITY DEFINER functions live in the `private` schema with an empty `search_path`.

That's 209 tests in 7 files. They check the application logic only; mocked tests can't prove the live RLS policies are correct. There are two ways to check the real database:

- **SQL suite.** Run [`supabase/tests/003_document_sharing_rls.sql`](supabase/tests/003_document_sharing_rls.sql) in the Supabase SQL editor (see [Applying the sharing migration](#applying-the-sharing-migration)). It tests the policies directly in Postgres and rolls back.
- **Live API check.** [`scripts/rls-live-check.mjs`](scripts/rls-live-check.mjs) signs in as two real users with the publishable key, exactly as the app does, and runs 39 checks through the Supabase Data API: unshared, viewer, editor, revoked, and anonymous access, ownership changes, who may manage shares, and who may delete. It creates one temporary document owned by the first user and ends by deleting it as the owner, checking that viewers and signed-out requests can't delete it and that its shares are removed with it. Credentials come only from environment variables:

  ```bash
  FOLIO_OWNER_EMAIL=... FOLIO_OWNER_PASSWORD=... \
  FOLIO_COLLABORATOR_EMAIL=... FOLIO_COLLABORATOR_PASSWORD=... \
  npm run test:rls-live
  ```

  It reads the project URL and publishable key from `.env.local` and exits non-zero if any check fails.

Then follow [Testing sharing with two users](#testing-sharing-with-two-users) and the manual checklist in [`docs/qa-checklist.md`](docs/qa-checklist.md).

## How authentication works

- **Sessions live in cookies.** `@supabase/ssr` stores the Supabase session in cookies so both the browser and the server can read it.
- **The proxy refreshes and gates every request.** [`src/proxy.ts`](src/proxy.ts) (the Next.js 16 replacement for `middleware.ts`) calls `updateSession` in [`src/lib/supabase/proxy.ts`](src/lib/supabase/proxy.ts). It runs `supabase.auth.getClaims()`, which refreshes an expired access token and verifies its signature, then writes any refreshed cookies to the response. Requests without a verified user are redirected to `/login`; signed-in users who visit `/login` are redirected to `/`. Responses are marked `Cache-Control: private, no-store` so no shared cache stores a user's page or session cookies.
- **The server re-verifies before reading data.** The proxy is not the only check. [`getCurrentUser()`](src/lib/auth/session.ts) verifies the token again with `getClaims()` (never trusting an unverified `getSession()`), and every data-access function calls it before querying. If verification fails, page loads redirect to `/login`, while mutations such as autosave use `getOptionalUser()` and return an `unauthenticated` error instead, so unsaved edits aren't lost to a redirect.
- **Sign-in and sign-out are Server Actions** in [`src/lib/auth/actions.ts`](src/lib/auth/actions.ts). Sign-in validates input on both client and server, calls `signInWithPassword`, and maps Supabase errors to plain messages. Passwords and tokens are never logged or returned to the client.
- **Personal content is never cached across users.** With Cache Components, the user's name and document list are read at request time inside `<Suspense>` boundaries; only the generic page shell is prerendered.
- **Sign-out ends with a full page load.** Next.js keeps previously visited pages mounted but hidden (React `<Activity>`) so Back is instant. After sign-out those hidden pages would still hold the previous user's documents, so the account menu calls the sign-out action and then replaces the page with `/login` using a full browser navigation. That discards the router cache and every hidden page; the browser Back button then makes a fresh request, which the proxy redirects to `/login`. If Supabase can't be reached during sign-out, the server deletes the Supabase auth cookies itself, so the session still ends locally.
- **Account switches reload the page.** [`SessionBoundary`](src/components/auth/SessionBoundary.tsx) remembers which user the current page was rendered for. If a different user (or nobody) is seen without a full page load, for example after signing in as someone else in another tab, it reloads the page. Pages restored from the browser's back-forward cache while signed in are reloaded too, so they're checked against the current session.
- **Hidden pages refresh when shown again.** Dashboards call `router.refresh()` in a layout-effect transition when a preserved page becomes visible again, and show list placeholders while that refresh is pending so old titles aren't painted. Caching stays enabled. The document page remounts its editor when your role changes. The Share dialog closes when its page is hidden, so it can't leave the next page blocked.
- **Sign-out reaches other tabs.** After a successful sign-out the account menu posts `{ type: "signed-out" }` on a `BroadcastChannel` (event name only). Other signed-in tabs navigate to `/login`.
- **Action arguments aren't logged.** `logging.serverFunctions` is off in [`next.config.ts`](next.config.ts), because the dev server would otherwise print document content and email addresses passed to Server Actions.

## How row-level security works

Every table has RLS enabled, and the app only uses the publishable key, so all queries run as the signed-in user (`authenticated` role) and Postgres enforces the policies:

- **`profiles`**: users can read their own profile and the profiles of people they share documents with (migration 003; 001 allowed reading every profile). Nobody can write them from the app; the `handle_new_user` trigger creates them.
- **`documents`**: the owner (`owner_id = auth.uid()`) can read, create, update, and delete a document. The insert policy rejects rows whose `owner_id` isn't the caller, so the client can't create documents on someone else's behalf. With 003, viewers and editors can also read documents shared with them and editors can update them, and only `title` and `content` can be updated by anyone.
- **`document_shares`**: the owner of a document can grant, change, and revoke shares; the owner and the recipient can see a share. Only the `role` column can be updated.
- The `anon` role has no table privileges at all.

## Project structure

```
src/
  proxy.ts                     Session refresh + route protection (Next.js Proxy)
  app/
    layout.tsx                 Root layout, fonts, metadata
    globals.css                Tailwind import and design tokens
    login/
      page.tsx                 "/login" sign-in page
      LoginForm.tsx            Email/password form with validation and loading state
    (workspace)/
      layout.tsx               App shell; streams the signed-in account into the header
      page.tsx                 "/"        My Documents (loads the user's documents)
      shared/page.tsx          "/shared"  Shared With Me (documents shared with the user)
      documents/[documentId]/
        page.tsx               Loads a document the user can access and renders the editor for their role
        not-found.tsx          Shared "not found or no access" page
      _components/
        WorkspaceAccount.tsx   Loads the profile and renders the account menu
  components/
    account/AccountMenu.tsx    Initials avatar, name/email, Sign out (full page load afterwards)
    auth/SessionBoundary.tsx   Reloads the page if the signed-in user changes without one
    layout/                    AppShell, AppSidebar, AppHeader, FolioLogo
    documents/                 DocumentDashboard, DocumentSection, DocumentList (linked rows),
                               CreateDocumentButton, ImportFileButton, LocalDateTime, EmptyState,
                               RefreshOnReturn (useRefreshOnReturn: transition refresh on return),
                               DocumentActionsMenu (copy, download, copy link, delete dialog)
    feedback/NoticeProvider.tsx  Confirmation messages that survive a navigation
    search/                    SearchProvider (per-page title query), HeaderSearch
    editor/
      DocumentEditor.tsx       Tiptap editor page: back link, title, toolbar, canvas, status
      EditorToolbar.tsx        Formatting controls, pickers, and the narrow-width More menu
      DocumentTitleInput.tsx   Rename on blur/Enter with validation and retry
      SaveStatusIndicator.tsx  Unsaved / Saving / Saved / Failed + Retry
      autosave-controller.ts   Debounced, serialized content autosave (framework-free, unit tested)
      useAutosave.ts           React binding for the autosave controller
      DocumentEditorStates.tsx Loading skeleton and message states
      extensions.ts            Editor extensions (also the schema used to validate imports)
    sharing/ShareDialog.tsx    Owner-only Share button and dialog (add, change role, remove)
  lib/
    supabase/
      client.ts                Browser client
      server.ts                Server client (Server Components, Actions, Route Handlers)
      proxy.ts                 Proxy session refresh helper
      env.ts                   Reads and validates the public Supabase env vars
      database.types.ts        TypeScript types for the database schema
    auth/
      session.ts               getCurrentUser(): verified identity or redirect
      actions.ts               signIn / signOut Server Actions
      session-boundary.ts      Auth cookie and account-switch helpers
      validation.ts            Shared credential validation
    data/
      profiles.ts              getCurrentProfile()
      documents.ts             Document create / import / list / get / rename / save / copy / export /
                               delete, access role checks
      sharing.ts               Share, list collaborators, change role, revoke, list shared documents
      result.ts                DataResult type and safe error logging
    sharing/
      roles.ts                 Roles, what each may do, and email validation (shared client/server)
      actions.ts               Server Actions used by the Share dialog
    documents/
      actions.ts               Server Actions used by the dashboard and editor
      validation.ts            Title, content, and UUID validation (shared client/server)
      formatting.ts            Allowed colors, highlight colors, font sizes, and alignments
      export.ts                Copy titles, safe download names, .txt and .md output (server)
      export-formats.ts        Download formats and MIME types (shared client/server)
    import/
      file-rules.ts            File type, size, UTF-8, and title rules (shared client/server)
      convert.ts               Plain text and Markdown → validated Tiptap JSON
      prepare-import.ts        Validates and converts an uploaded file before any insert
      docx-archive.ts          ZIP structure and decompression limits for .docx (server)
      docx.ts                  Word document model → Tiptap JSON via mammoth (server)
    account.ts                 Display name and initials helpers
    navigation.ts              Navigation items and active-route helpers
    search.ts                  Title normalization and filtering
    sidebar-preference.ts      Stored desktop sidebar preference
    format.ts                  Date formatting for "last edited"
  types/
    document.ts                DocumentSummary (UI-facing document shape)
supabase/
  migrations/001_initial_schema.sql
  migrations/002_document_constraints.sql
  migrations/003_document_sharing.sql   Sharing policies, private helpers, column privileges
  tests/003_document_sharing_rls.sql    Self-checking RLS test (run manually, rolls back)
scripts/rls-live-check.mjs     Live two-user RLS check through the Data API (npm run test:rls-live)
docs/
  PRODUCT_IMPROVEMENTS.md      Backlog and verified progress
  qa-checklist.md              Manual QA checklist
  architecture.md              Short system overview
  ai-workflow.md               How Cursor agents were used
  submission.md                Public URL / video status (still pending)
vitest.config.mts              Test config (path alias, server-only stub)
```

`database.types.ts` is maintained by hand to match the migration. With the Supabase CLI you can regenerate it with `npx supabase gen types typescript --project-id <ref>`.

## Implementation status

### Done

- Responsive app shell with a mobile navigation drawer and a desktop sidebar that can be hidden with the button at the left of the header (the choice is remembered in this browser).
- Title search in the header. On My Documents it filters both lists, on Shared With Me the shared list; on a document page, Enter opens My Documents with the search applied. Matching ignores case and accents, `/` focuses the field, and Escape clears it. Search only filters the documents the page has already loaded for you, so it never reaches documents you can't open and needs no extra database query.
- Email/password sign-in at `/login` with client and server validation, a loading state, and clear error messages.
- Route protection: every page except `/login` requires a verified session; signed-in users are sent from `/login` to `/`.
- Header account menu showing the signed-in user's name, email, and initials, with a working **Sign out**.
- **My Documents** lists the user's real documents, most recently edited first, each linking to the editor. With no documents it shows the empty state; load failures show an error message instead of a misleading empty list. A missing profile falls back to the email address.
- Document creation, the Tiptap editor, renaming, and autosave (see [Documents](#documents)).
- Importing `.txt`, `.md`, and `.docx` files as new documents (see [Importing files](#importing-files)).
- Sharing with viewer and editor roles, permission changes, revocation, and the Shared With Me dashboard (see [Sharing](#sharing)).
- Document actions: make a copy, download as `.txt` or `.md`, copy link, and owner-only delete (see [Document actions](#document-actions)).
- Typed schema, Supabase clients, and a data-access layer kept separate from UI components.

### Known limitations

- Only the in-app Back link asks before leaving with unsaved changes. Sidebar links rely on the final best-effort save, and closing or reloading the tab uses the browser's prompt.
- There is no realtime collaboration. Opening the same document in two tabs or by two people is last-write-wins across sessions; there is no conflict detection.
- There is no version history and no comments. Downloads are `.txt` and `.md` only (no PDF or DOCX), and Markdown can't carry colors, font sizes, or alignment.
- Going back to a dashboard shows loading placeholders while server data refreshes; if the refresh is slow, that placeholder state lasts until it finishes.
- If `BroadcastChannel` is unavailable, signing out in another tab isn't noticed until the open tab next talks to the server.
- Deletion is permanent; there is no trash or undo.
- The document actions menu is on the document page only, not on dashboard rows.
- The editor only supports the formats listed above; links, images, tables, font families, and custom colors are not available. Pasted formatting outside the palette and size list is dropped.
- Import accepts one `.txt` or `.md` file (up to 250 KB) or `.docx` file (up to 1 MB) at a time, chosen with the file picker (no drag-and-drop). `.doc`, PDF, and other formats aren't supported. The `.docx` limit stays under the 1 MB default Server Action request size, so the limit for every other action is unchanged.
- `.docx` imports drop images, links, fonts, colors, sizes, comments, footnotes, and Heading 3–6 styles, and flatten tables into rows of text.
- Markdown imports keep the text of unsupported constructs but not their structure: link and image URLs, table layout, task-list checkboxes, and H3–H6 heading styles are lost. Link reference definitions and footnote definitions aren't standard rendered text and are dropped, as in rendered Markdown.
- A file of many very short lines can be under 250 KB yet exceed the 500 KB document limit once converted; such imports are rejected with a message to split the file.
- Importing the same file twice creates two documents.
- See [Sharing limitations](#sharing-limitations) for sharing.

### Not implemented yet

Their controls are disabled and labelled "Soon" where they appear in the UI:

- Realtime collaboration
- Registration and password reset (users are created in the Supabase dashboard)
