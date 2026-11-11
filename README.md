# Folio

Folio is a lightweight collaborative document editor inspired by Google Docs, built for the Ajaia engineering assessment.

This repository currently contains:

- **Task 1:** the application shell and document dashboard.
- **Task 2:** Supabase email/password authentication, route protection, and the database foundation (schema, row-level security, typed data access).

Document editing, creating documents, and sharing are not implemented yet.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, Cache Components, Turbopack)
- React 19 and TypeScript
- Tailwind CSS 4
- [lucide-react](https://lucide.dev) icons
- [Supabase](https://supabase.com) Auth and Postgres via `@supabase/supabase-js` and `@supabase/ssr`

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
| `npm run build`    | Create a production build  |
| `npm start`        | Serve the production build |

## How authentication works

- **Sessions live in cookies.** `@supabase/ssr` stores the Supabase session in cookies so both the browser and the server can read it.
- **The proxy refreshes and gates every request.** [`src/proxy.ts`](src/proxy.ts) (the Next.js 16 replacement for `middleware.ts`) calls `updateSession` in [`src/lib/supabase/proxy.ts`](src/lib/supabase/proxy.ts). It runs `supabase.auth.getClaims()`, which refreshes an expired access token and verifies its signature, then writes any refreshed cookies to the response. Requests without a verified user are redirected to `/login`; signed-in users who visit `/login` are redirected to `/`. Responses are marked `Cache-Control: private, no-store` so no shared cache stores a user's page or session cookies.
- **The server re-verifies before reading data.** The proxy is not the only check. [`getCurrentUser()`](src/lib/auth/session.ts) verifies the token again with `getClaims()` (never trusting an unverified `getSession()`), and every data-access function calls it before querying. If verification fails it redirects to `/login`.
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
      _components/
        WorkspaceAccount.tsx   Loads the profile and renders the account menu
  components/
    account/AccountMenu.tsx    Initials avatar, name/email, Sign out
    layout/                    AppShell, AppSidebar, AppHeader, FolioLogo
    documents/                 DocumentDashboard, DocumentSection, DocumentList, EmptyState
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
      documents.ts             listOwnedDocuments()
      result.ts                DataResult type and safe error logging
    account.ts                 Display name and initials helpers
    navigation.ts              Navigation items and active-route helpers
    format.ts                  Date formatting for "last edited"
  types/
    document.ts                DocumentSummary (UI-facing document shape)
supabase/
  migrations/001_initial_schema.sql
```

`database.types.ts` is maintained by hand to match the migration. With the Supabase CLI you can regenerate it with `npx supabase gen types typescript --project-id <ref>`.

## Implementation status

### Done

- Responsive app shell with a desktop sidebar and a mobile navigation drawer.
- Email/password sign-in at `/login` with client and server validation, a loading state, and clear error messages.
- Route protection: every page except `/login` requires a verified session; signed-in users are sent from `/login` to `/`.
- Header account menu showing the signed-in user's name, email, and initials, with a working **Sign out**.
- **My Documents** loads the user's real documents from Supabase (none exist yet, so it shows the empty state). Load failures show an error message instead of a misleading empty list. A missing profile falls back to the email address.
- Typed schema, Supabase clients, and a data-access layer kept separate from UI components.

### Not implemented yet

Their controls are disabled and labelled "Soon" where they appear in the UI:

- Creating, editing, and deleting documents (rich-text editor)
- File import / upload
- Document search
- Sharing UI and reading documents shared with you
- Realtime collaboration
- Registration and password reset (users are created in the Supabase dashboard)
