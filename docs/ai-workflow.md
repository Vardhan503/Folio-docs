# AI-assisted development workflow

Folio was built with Cursor agents against the Ajaia assessment tasks. This note is a disclosure of how AI was used, not a claim that every line was hand-written.

## How work was split

1. **Requirements first.** Each task (and the later product-improvements backlog in [`PRODUCT_IMPROVEMENTS.md`](PRODUCT_IMPROVEMENTS.md)) was treated as the source of truth for scope, security constraints, and acceptance checks.
2. **Inspect before changing.** Agents read the existing Next.js 16 / Supabase / Tiptap code and the local `node_modules/next` guidance before editing, and avoided rewriting working auth, RLS, autosave, sharing, or import paths when adding UI features.
3. **Small commits.** Baseline → sidebar/search → editor formatting → document actions → DOCX import → final polish, each with automated checks.
4. **Verify, don't assume.** Lint, TypeScript, Vitest, production build, and (when credentials were available) hosted RLS checks were re-run after relevant changes. Browser checks used the two demo accounts. Failures were fixed before moving on.
5. **Honest gaps.** Items not verified in the browser (or limited by automation, such as clipboard focus) are called out in progress notes and the [QA checklist](qa-checklist.md).

## What AI was not allowed to do

- Disable or bypass RLS, or introduce a service-role key
- Commit `.env.local` or demo passwords
- Claim deployment or a walkthrough video that does not exist yet
- Treat mocked unit tests as proof of live database security

## Human responsibility

The implementer remains responsible for reviewing diffs, applying Supabase migrations, running the QA checklist before a demo, and completing the assessment's public URL and walkthrough video requirements.
