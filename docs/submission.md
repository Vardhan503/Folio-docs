# Submission status

The Ajaia assessment asks for:

1. A **publicly accessible URL** for the running app
2. A **3–5 minute walkthrough video**

**Both are still pending.** This improvement sprint deliberately excluded deployment. Do not treat the local app, this repository, or a private preview as a complete submission until those two deliverables exist.

## Before recording the walkthrough

- [ ] Apply migrations 001–003 on the hosted Supabase project
- [ ] Confirm two demo users can sign in
- [ ] Run the automated checks in [`qa-checklist.md`](qa-checklist.md)
- [ ] Deploy to a public host (for example Vercel) with the same env vars as `.env.example`
- [ ] Smoke-test sign-in, create/edit/share, import, and sign-out on the public URL

## Suggested video outline (3–5 minutes)

1. Sign in, create a document, format text, wait for autosave, reload
2. Import `sample.md` or `sample.docx`
3. Share with the second user as viewer, then editor; show role limits
4. Duplicate, download, delete (owner)
5. Sign out and show that Back does not reveal private data
