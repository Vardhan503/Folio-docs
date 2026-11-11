# Folio

Folio is a lightweight collaborative document editor inspired by Google Docs, built for the Ajaia engineering assessment.

This repository currently contains:

- **Task 1:** the application shell and document dashboard.
- **Task 2:** Supabase email/password authentication, route protection, and the database foundation (schema, row-level security, typed data access).
- **Task 3:** creating documents, rich-text editing with Tiptap, renaming, autosave, and reopening saved documents.
- **Task 4:** importing `.txt` and `.md` files as new documents.

Sharing is not implemented yet.

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

The `on_auth_user_created` trigger inserts a matching row into `public.profiles` for each user. Check **Table Editor → profiles** to confirm both rows exist. Two users let you verify that each person only sees their own documents now, and will be used to test sharing later.

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
| `npm run build`    | Create a production build  |
| `npm start`        | Serve the production build |

## Documents

### Creating documents

**Create Document** on My Documents calls a Server Action that verifies the session, inserts a row with `owner_id` taken from the verified user (never from the browser), the title "Untitled document", and an empty Tiptap document, then navigates to `/documents/<id>`. The button is disabled while the request runs, and repeat submissions are ignored, so a double click creates one document. Failures show an inline error.

### Editing and formatting

The editor at `/documents/[documentId]` uses Tiptap v3 (`StarterKit` plus `Placeholder`). The toolbar offers undo/redo, normal text, Heading 1, Heading 2, bold, italic, underline, bulleted and numbered lists, and shows which formats are active. Toolbar buttons keep the text selection, and the usual shortcuts work (`Ctrl/⌘+B`, `I`, `U`, `Z`, `Shift+Z`, `Ctrl/⌘+Alt+1/2/0`, `Ctrl/⌘+Shift+7/8`). Markdown-style input such as `# `, `- `, and `1. ` also works.

Click the title to rename it. It saves when the field loses focus or you press Enter (Escape cancels). Titles are trimmed and must be 1–120 characters; an empty title is rejected and the previous one kept. If a rename fails, the typed title stays in the field with a Retry button.

### Autosave

- Every edit bumps a local revision number and restarts a 900 ms debounce timer, so typing doesn't hit the database on every keystroke.
- When the timer fires, the editor's JSON (`editor.getJSON()`) is sent to a Server Action. Only one content save is in flight at a time; edits made meanwhile are sent in a follow-up save with the latest content, so an older save can never overwrite a newer one.
- The status reads **Unsaved changes**, **Saving…**, **All changes saved** (with the last save time), or **Save failed**. "All changes saved" only appears once the latest revision has been stored.
- On failure, edits stay in the editor, a Retry button appears, and the next edit retries automatically. `Ctrl/⌘+S` saves immediately.
- Leaving with unsaved changes triggers the browser's "leave page?" prompt; the in-app Back link asks for confirmation. If you navigate away inside the app, a final best-effort save is sent.
- Title and content are saved by separate actions that update separate columns, so renaming never overwrites content and vice versa.

### Persistence and ownership

- Content is stored as Tiptap JSON in `documents.content` (`jsonb`), never as HTML or plain text, and restored as-is when the document is reopened.
- All reads and writes go through [`src/lib/data/documents.ts`](src/lib/data/documents.ts): `createDocument`, `listOwnedDocuments`, `getDocumentById`, `updateDocumentTitle`, `updateDocumentContent`. Each one verifies the user with `getClaims()`, checks the document ID is a UUID, validates input, and filters by both `id` and `owner_id` on top of the RLS policies. Results are typed `{ ok: true, data } | { ok: false, code, error }`.
- Content must be a JSON object with a `doc` root, use only the node and mark types the editor produces, nest at most 40 levels, and stay under 500 KB. Links are disabled in the editor and rejected on save.
- A missing document, a malformed ID, and someone else's document all produce the same "Document not found" page, so the app never reveals whether a document exists. Database errors are logged on the server and shown to the user as a generic message.
- Document pages are rendered per request and marked `private, no-store`; nothing user-specific is cached on the server.

## Importing files

### How to import

On **My Documents**, click **Import File** (also shown in the empty state when you have no documents) and choose a file. While the file is checked and uploaded, the button shows **Importing…** with the file name and can't be clicked again. On success Folio creates a new document and opens it in the editor; on failure an error appears under the button and you can pick the same file again.

| Rule              | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Supported types   | `.txt` (plain text) and `.md` (Markdown), by file extension                |
| Maximum file size | 250 KB (256,000 bytes)                                                     |
| Encoding          | UTF-8 (a byte-order mark is fine); invalid UTF-8 and binary files are rejected |
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

### What happens on the server

The `importDocumentAction` Server Action passes the uploaded file to `importDocument` in [`src/lib/data/documents.ts`](src/lib/data/documents.ts), which:

1. Verifies the signed-in user with `getClaims()`.
2. Checks the file's extension, size, and title, reads it as strict UTF-8, and rejects binary content ([`file-rules.ts`](src/lib/import/file-rules.ts)).
3. Converts it to Tiptap JSON ([`convert.ts`](src/lib/import/convert.ts)), then checks the result against the editor's ProseMirror schema and the same content validation autosave uses (allowed nodes and marks, nesting depth, 500 KB limit). Anything that fails is rejected with a clear message.
4. Inserts one row into the existing `documents` table, with `owner_id` taken from the verified user and the converted JSON in `content`.

Nothing is written unless every step succeeds. The raw file is never stored and no Storage bucket is needed: imported documents are ordinary Tiptap JSON documents, so they open in the editor, autosave, appear in My Documents sorted by last edit, and can be renamed like any other document.

## Tests

```bash
npm run test -- --run
```

Vitest runs in Node with no network access or Supabase credentials:

- [`src/lib/documents/validation.test.ts`](src/lib/documents/validation.test.ts) covers title rules (valid, trimmed, empty, whitespace-only, overlong, non-string), content rules (valid documents, malformed roots and nodes, unsupported nodes and marks, heading levels, deep nesting, oversized and circular content), and UUID checks.
- [`src/lib/documents/editor-content.test.ts`](src/lib/documents/editor-content.test.ts) builds documents with the editor's real schema and checks they pass validation directly and after the JSON round trip used by autosave.
- [`src/lib/data/documents.test.ts`](src/lib/data/documents.test.ts) mocks the session and Supabase client to check that each operation uses the verified user's ID as owner, filters by owner, rejects bad input without touching the database, reports expired sessions, treats rows hidden by RLS as not found, and hides database error details. The import tests also check that a successful import makes exactly one insert, and that failed validation or conversion makes none.
- [`src/lib/import/import.test.ts`](src/lib/import/import.test.ts) covers file rules (extensions, empty and oversized files, invalid UTF-8, binary content, file-name titles) and pins the exact JSON produced for plain text and for each supported and unsupported Markdown construct, because `@tiptap/markdown` is still in beta.

These tests check the application logic only. They do **not** verify the live RLS policies; check those manually with two users (see below).

## How authentication works

- **Sessions live in cookies.** `@supabase/ssr` stores the Supabase session in cookies so both the browser and the server can read it.
- **The proxy refreshes and gates every request.** [`src/proxy.ts`](src/proxy.ts) (the Next.js 16 replacement for `middleware.ts`) calls `updateSession` in [`src/lib/supabase/proxy.ts`](src/lib/supabase/proxy.ts). It runs `supabase.auth.getClaims()`, which refreshes an expired access token and verifies its signature, then writes any refreshed cookies to the response. Requests without a verified user are redirected to `/login`; signed-in users who visit `/login` are redirected to `/`. Responses are marked `Cache-Control: private, no-store` so no shared cache stores a user's page or session cookies.
- **The server re-verifies before reading data.** The proxy is not the only check. [`getCurrentUser()`](src/lib/auth/session.ts) verifies the token again with `getClaims()` (never trusting an unverified `getSession()`), and every data-access function calls it before querying. If verification fails, page loads redirect to `/login`, while mutations such as autosave use `getOptionalUser()` and return an `unauthenticated` error instead, so unsaved edits aren't lost to a redirect.
- **Sign-in and sign-out are Server Actions** in [`src/lib/auth/actions.ts`](src/lib/auth/actions.ts). Sign-in validates input on both client and server, calls `signInWithPassword`, and maps Supabase errors to plain messages. Passwords and tokens are never logged or returned to the client.
- **Personal content is never cached across users.** With Cache Components, the user's name and document list are read at request time inside `<Suspense>` boundaries; only the generic page shell is prerendered.

## How row-level security works

Every table has RLS enabled, and the app only uses the publishable key, so all queries run as the signed-in user (`authenticated` role) and Postgres enforces the policies:

- **`profiles`**: any signed-in user can read profiles (needed to pick collaborators later). Nobody can write them from the app; the `handle_new_user` trigger creates them.
- **`documents`**: only the owner (`owner_id = auth.uid()`) can read, create, update, or delete a document. The insert policy rejects rows whose `owner_id` isn't the caller, so the client can't create documents on someone else's behalf.
- **`document_shares`**: the owner of a document can grant and revoke shares; the owner and the recipient can see a share. Shared documents' contents are not yet readable by recipients; that policy arrives with the sharing task.
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
      shared/page.tsx          "/shared"  Shared With Me
      documents/[documentId]/
        page.tsx               Loads an owned document and renders the editor
        not-found.tsx          Shared "not found or no access" page
      _components/
        WorkspaceAccount.tsx   Loads the profile and renders the account menu
  components/
    account/AccountMenu.tsx    Initials avatar, name/email, Sign out
    layout/                    AppShell, AppSidebar, AppHeader, FolioLogo
    documents/                 DocumentDashboard, DocumentSection, DocumentList (linked rows),
                               CreateDocumentButton, ImportFileButton, LocalDateTime, EmptyState
    editor/
      DocumentEditor.tsx       Tiptap editor page: back link, title, toolbar, canvas, status
      EditorToolbar.tsx        Formatting buttons with active states
      DocumentTitleInput.tsx   Rename on blur/Enter with validation and retry
      SaveStatusIndicator.tsx  Unsaved / Saving / Saved / Failed + Retry
      useAutosave.ts           Debounced, serialized content autosave
      DocumentEditorStates.tsx Loading skeleton and message states
      extensions.ts            Editor extensions (also the schema used to validate imports)
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
      validation.ts            Shared credential validation
    data/
      profiles.ts              getCurrentProfile()
      documents.ts             Document create / list / get / rename / save content
      result.ts                DataResult type and safe error logging
    documents/
      actions.ts               Server Actions used by the dashboard and editor
      validation.ts            Title, content, and UUID validation (shared client/server)
    import/
      file-rules.ts            File type, size, UTF-8, and title rules (shared client/server)
      convert.ts               Plain text and Markdown → validated Tiptap JSON
      prepare-import.ts        Validates and converts an uploaded file before any insert
    account.ts                 Display name and initials helpers
    navigation.ts              Navigation items and active-route helpers
    format.ts                  Date formatting for "last edited"
  types/
    document.ts                DocumentSummary (UI-facing document shape)
supabase/
  migrations/001_initial_schema.sql
  migrations/002_document_constraints.sql
vitest.config.mts              Test config (path alias, server-only stub)
```

`database.types.ts` is maintained by hand to match the migration. With the Supabase CLI you can regenerate it with `npx supabase gen types typescript --project-id <ref>`.

## Implementation status

### Done

- Responsive app shell with a desktop sidebar and a mobile navigation drawer.
- Email/password sign-in at `/login` with client and server validation, a loading state, and clear error messages.
- Route protection: every page except `/login` requires a verified session; signed-in users are sent from `/login` to `/`.
- Header account menu showing the signed-in user's name, email, and initials, with a working **Sign out**.
- **My Documents** lists the user's real documents, most recently edited first, each linking to the editor. With no documents it shows the empty state; load failures show an error message instead of a misleading empty list. A missing profile falls back to the email address.
- Document creation, the Tiptap editor, renaming, and autosave (see [Documents](#documents)).
- Importing `.txt` and `.md` files as new documents (see [Importing files](#importing-files)).
- Typed schema, Supabase clients, and a data-access layer kept separate from UI components.

### Known limitations

- Only the in-app Back link asks before leaving with unsaved changes. Sidebar links rely on the final best-effort save, and closing or reloading the tab uses the browser's prompt.
- Opening the same document in two tabs is last-write-wins; there is no realtime sync or conflict detection.
- After editing, using the browser's Back button may briefly show the dashboard's previous titles and order until the page is reloaded or revisited.
- Documents can't be deleted from the UI yet.
- The editor only supports the formats listed above; links, images, and tables are not available.
- Import accepts one `.txt` or `.md` file at a time, up to 250 KB, chosen with the file picker (no drag-and-drop). DOCX, PDF, and other formats aren't supported.
- Markdown imports keep the text of unsupported constructs but not their structure: link and image URLs, table layout, task-list checkboxes, and H3–H6 heading styles are lost. Link reference definitions and footnote definitions aren't standard rendered text and are dropped, as in rendered Markdown.
- A file of many very short lines can be under 250 KB yet exceed the 500 KB document limit once converted; such imports are rejected with a message to split the file.
- Importing the same file twice creates two documents.

### Not implemented yet

Their controls are disabled and labelled "Soon" where they appear in the UI:

- Deleting documents
- Document search
- Sharing UI and reading documents shared with you
- Realtime collaboration
- Registration and password reset (users are created in the Supabase dashboard)
