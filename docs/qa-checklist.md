# Folio QA checklist

Manual checks to run before a demo or after changes to auth, documents, sharing, or the database. You need two users created as described in the [README](../README.md#4-create-the-two-demo-users); they're called **A** (owner) and **B** (collaborator) below. Use a normal window for A and a private window for B unless a step says otherwise.

Never commit real credentials. Pass them to scripts as environment variables only.

## Automated checks

Run these first; all must pass.

```bash
npm run lint
npx tsc --noEmit
npm run test -- --run
npm run build
```

Then check RLS against the real project (both are described in the [README](../README.md#tests)):

```bash
FOLIO_OWNER_EMAIL=... FOLIO_OWNER_PASSWORD=... \
FOLIO_COLLABORATOR_EMAIL=... FOLIO_COLLABORATOR_PASSWORD=... \
npm run test:rls-live
```

and run [`supabase/tests/003_document_sharing_rls.sql`](../supabase/tests/003_document_sharing_rls.sql) in the Supabase SQL editor after setting the two emails at the top. It must end with `ALL SHARING RLS CHECKS PASSED`.

The Vitest suite uses mocks and doesn't prove database security. The two RLS checks above do, for the cases they cover.

## Authentication

- [ ] Visiting `/`, `/shared`, or a document URL while signed out redirects to `/login`.
- [ ] A wrong password shows "Incorrect email or password." An empty or malformed email shows a field error. No technical details appear.
- [ ] Signing in lands on My Documents, and the account menu shows the right name and email.
- [ ] Visiting `/login` while signed in redirects to `/`.
- [ ] With an editor open, sign out in a second tab, then type in the first tab. The save fails with "Your session has expired…", the text stays, and nothing says "saved". Sign in again in the second tab, then click Retry in the first: it saves.

## Sign-out and account switching

- [ ] Sign in as A, open My Documents, Shared With Me, and a document, then sign out. On `/login`, open the browser dev tools and search the page (Elements panel) for one of A's document titles: it must not be found.
- [ ] After signing out, press the browser Back button. You stay on (or are sent back to) `/login`; none of A's documents, names, or emails appear.
- [ ] Sign in as B in the same window. Only B's documents and documents shared with B appear. Search the page for one of A's private titles: not found. Repeat the other way round.
- [ ] With A signed in in two tabs, sign out in one and sign in as B there. In the other tab, navigate or reload: it shows B's data (or `/login`), never a mix.

## Document lifecycle

- [ ] **Create Document** opens a new "Untitled document"; a double click creates only one.
- [ ] Typing shows "Unsaved changes", then "Saving…", then "All changes saved" with a time. Reload: the text is still there.
- [ ] Each toolbar button (headings, bold, italic, underline, lists, undo/redo) works and shows its active state; buttons are disabled when they can't apply.
- [ ] Rename: click the title, change it, press Enter. Reload: the new title stays. An empty title is rejected and the old one kept; Escape cancels.
- [ ] Rename, then use the in-app Back link and the browser Back button. My Documents shows the new title (the old one may flash for a moment).
- [ ] With the dev tools' Network panel set to Offline, type: "Save failed" appears with Retry and the edits stay. Go back online and click Retry: "All changes saved".
- [ ] Opening a random UUID at `/documents/<uuid>` shows "Document not found".

## Import

- [ ] Import a small `.txt` file: a new document opens, titled after the file, with paragraphs preserved.
- [ ] Import a `.md` file with headings, lists, bold, and italic: they appear formatted.
- [ ] Import [`sample.docx`](../sample.docx): title is `sample`; headings, bold/italic/underline/strikethrough, lists, a quote, and a table flattened to ` | ` rows appear. Fonts, colors, images, and link addresses do not.
- [ ] Try a `.pdf`, a `.doc`, an empty file, a text file renamed to `.docx`, and a file over the limit (250 KB for text, 1 MB for `.docx`): each is rejected with a clear message and no document is created.
- [ ] Return to My Documents: the imported document is listed and owned by you.

## Sharing

As A, on a document A owns:

- [ ] **Share** opens a dialog with focus in the email field; Escape and the close button close it; Tab stays inside the dialog.
- [ ] Sharing with A's own email, an unknown email, and an invalid email each shows an inline error and shares nothing.
- [ ] Share with B as **Viewer**. Sharing with B again says B already has access.

As B:

- [ ] Shared With Me lists the document with a Viewer badge and A as owner. Opening it shows the content read-only: no toolbar, no title field, no save status, "View only" badge.

As A, change B to **Editor**. As B:

- [ ] Go to My Documents and back to Shared With Me (no reload): the badge now says Editor. Opening the document shows the toolbar; B's edits and renames save. A reloads and sees them.
- [ ] B has no Share button and can't change or remove anyone's access.

With B's editor still open, A clicks **Remove** for B. As B:

- [ ] Typing shows "Save failed: This document doesn't exist or you don't have access to it." with no Retry button. The typed text stays on screen, and A doesn't see it after reloading.
- [ ] Reloading the document shows "Document not found". Shared With Me no longer lists it.

## Row-level security

The automated checks above cover these. To spot-check by hand, use the browser console on the app while signed in as B, or the SQL editor's role switcher:

- [ ] B can't read, update, or delete a document of A's that isn't shared with B.
- [ ] As viewer, B can't update the document; as editor, B can update `title` and `content` but not `owner_id`, `created_at`, or `updated_at`, and can't delete it.
- [ ] Only A can insert, update, or delete rows in `document_shares` for A's documents.
- [ ] Inserting a document with someone else's `owner_id` fails.
- [ ] Signed out (the `anon` role), nothing can be read.

## Responsive layout and accessibility

Check at 1440, 768, and 375 px wide (dev tools device toolbar):

- [ ] No horizontal scrolling on My Documents, Shared With Me, or the editor.
- [ ] Below 1024 px the sidebar becomes a menu button. The drawer moves focus to its close button, Tab stays inside it, and Escape or the close button returns focus to the menu button.
- [ ] While scrolling a long document, the editor toolbar sticks directly under the header without a gap or overlap. At 375 px it wraps to two rows.
- [ ] The Share dialog and account menu fit on screen at 375 px.
- [ ] Every control can be reached and used with the keyboard, with a visible focus ring. "Skip to content" appears on the first Tab.

## Known limitations

These are expected and not bugs:

- No realtime collaboration. Two people or tabs editing the same document is last-write-wins.
- Import accepts one `.txt` or `.md` (up to 250 KB) or `.docx` (up to 1 MB) at a time. `.docx` drops images, fonts, colors, link URLs, comments, and H3+ styles.
- No version history, comments, or file export.
- No deleting documents, search, registration, or password reset.
- Revoking access can't remove content that's already open in the other person's browser; it only stops further saves and loads.
- Going back to a dashboard can show its previous contents for a moment before it refreshes.
- Signing out in another tab isn't noticed until the open tab next contacts the server.

## Results from the Task 6 pass (Nov 11, 2026)

Run against the hosted Supabase project with two real users:

- `npm run test:rls-live`: 33 passed, 0 failed. The SQL suite (43 checks) passed on a local Postgres with the migrations applied.
- Sign-out, browser Back after sign-out, and switching between A and B: no previous user's data in the page, including hidden markup.
- Sharing: the self, unknown-email, and duplicate errors; the viewer read-only UI; viewer save requests refused by the server; promotion to editor picked up without a reload; editor saves; revocation while the editor was open (save failed, text kept, no Retry); "Document not found" and an updated Shared With Me after revocation.
- Layout at 375, 768, and 1440 px: no horizontal overflow; the toolbar's sticky offset matched the measured header height (109 px on mobile, 61 px from 640 px up); the Share dialog and account menu fit at 375 px; mobile drawer focus and Escape behaved as listed.

Not run by hand in that pass: the expired-session flow, the offline save flow, import, and renaming by typing in the browser (the test browser couldn't fire real focus and blur events; the rename save path was exercised directly). Unit tests cover the autosave failure and retry logic.
