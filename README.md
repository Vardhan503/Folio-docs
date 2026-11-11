# Folio

Folio is a lightweight collaborative document editor inspired by Google Docs, built for the Ajaia engineering assessment.

This repository currently contains **Task 1: the application foundation and document dashboard**. No document data, editing, or collaboration features exist yet.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, Cache Components, Turbopack)
- React 19 and TypeScript
- Tailwind CSS 4
- [lucide-react](https://lucide.dev) icons

## Local setup

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Other scripts:

| Command          | Purpose                          |
| ---------------- | -------------------------------- |
| `npm run lint`   | Run ESLint                       |
| `npx tsc --noEmit` | Type-check the project         |
| `npm run build`  | Create a production build        |
| `npm start`      | Serve the production build       |

## Project structure

```
src/
  app/
    layout.tsx                 Root layout, fonts, metadata
    globals.css                Tailwind import and design tokens
    (workspace)/
      layout.tsx               Wraps workspace pages in the app shell
      page.tsx                 "/"        My Documents
      shared/page.tsx          "/shared"  Shared With Me
  components/
    layout/
      AppShell.tsx             Sidebar + header frame, mobile drawer state
      AppSidebar.tsx           Branding and primary navigation
      AppHeader.tsx            Breadcrumb, search field, avatar placeholder
      FolioLogo.tsx            Logo mark and wordmark
    documents/
      DocumentDashboard.tsx    Page heading, actions, owned/shared sections
      DocumentSection.tsx      Card that shows a document list or empty state
      DocumentList.tsx         Responsive title / owner / last edited list
      EmptyState.tsx           Reusable empty state
  lib/
    navigation.ts              Navigation items and active-route helpers
    format.ts                  Date formatting for "last edited"
  types/
    document.ts                DocumentSummary and related types
```

## Implementation status

### Done (Task 1)

- Responsive app shell: a fixed sidebar on desktop and a slide-in navigation drawer on mobile (closes with Escape, the close button, the backdrop, or after navigating).
- Header with workspace breadcrumb, document search field, and an avatar placeholder.
- **My Documents** (`/`) with "Owned by you" and "Shared with you" sections, each visually distinct and each with an empty state.
- **Shared With Me** (`/shared`) showing only shared documents.
- A typed, responsive `DocumentList` ready to display title, owner, and last edited time (a table-style layout on desktop and stacked rows on mobile). It isn't visible yet because there is no document data.
- Accessibility: skip link, labelled landmarks and regions, `aria-current` on active navigation, visible keyboard focus styles.

### Not implemented yet

These are intentionally out of scope for Task 1. Their controls are disabled and labelled "Soon" in the UI:

- Creating documents and the rich-text editor
- File import / upload
- Document search
- Authentication and user accounts (the avatar is a placeholder)
- Sharing and permissions
- Persistence (no database or local storage; every list is empty)
