# Folio architecture

Short overview of how the app is put together. Details and how-tos live in the [README](../README.md).

## Stack

- **Next.js 16** App Router with Cache Components and partial prefetching
- **React 19** / TypeScript / Tailwind CSS 4
- **Supabase** Auth (email/password) and Postgres with row-level security
- **Tiptap v3** for the editor
- **Vitest** for unit tests; a SQL suite and `npm run test:rls-live` for real RLS

## Request path

1. [`src/proxy.ts`](../src/proxy.ts) refreshes the session, redirects unauthenticated users to `/login`, and sets `Cache-Control: private, no-store`.
2. Server Components and Server Actions call `getClaims()` / `getOptionalUser()` again before any data access.
3. All database access uses the publishable key only. Postgres RLS decides what each signed-in user can read and change. There is no service-role client.

## Main surfaces

| Route | Role |
| --- | --- |
| `/login` | Sign-in |
| `/` | My Documents (owned + preview of shared) |
| `/shared` | Shared With Me |
| `/documents/[id]` | Editor for a document the user can access |

## Data and permissions

- Documents are owned by `owner_id` from the verified session, never from the client.
- Sharing uses `document_shares` with `viewer` / `editor`. Only the owner manages shares. Editors update `title`/`content` only; viewers are read-only.
- Import (`.txt` / `.md` / `.docx`), duplicate, export, and delete go through Server Actions that re-check the role. Delete is owner-only and cascades shares via the database.

## Client navigation notes

Next.js keeps visited pages mounted but hidden. Sign-out ends with a full page load to `/login`. Dashboards refresh when shown again. Other tabs are told about sign-out over a `BroadcastChannel` that carries only the event name.
