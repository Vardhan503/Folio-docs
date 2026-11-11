-- Task 5: document sharing with viewer/editor roles.
--
-- Additive on top of 001: the owner policies on documents and document_shares
-- are kept as they are, and new permissive policies grant collaborators access.
-- The only policy removed is the open profiles directory.
--
-- Run once in the Supabase SQL editor (or `npx supabase db push`). Safe to run
-- inside a transaction; it does not touch existing rows.

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------
-- Policies on documents need to look at document_shares and vice versa. Doing
-- that with plain subqueries makes each table's policy depend on the other's,
-- so the lookups go through SECURITY DEFINER functions instead. They live in a
-- schema the Data API does not expose, so they can't be called over HTTP.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Role the signed-in user holds on a document through a share ('viewer' or
-- 'editor'), or null. Owners are handled by the existing owner policies.
create function private.document_share_role(p_document_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.document_shares s
  where s.document_id = p_document_id
    and s.user_id = (select auth.uid())
    and (select auth.uid()) is not null;
$$;

-- True when the signed-in user owns the document.
create function private.owns_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.documents d
      where d.id = p_document_id
        and d.owner_id = (select auth.uid())
    );
$$;

-- True when the signed-in user may see another user's profile: they are a
-- collaborator on a document the caller owns, or they own a document shared
-- with the caller. Everyone can also see their own profile (separate policy).
create function private.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.document_shares s
      join public.documents d on d.id = s.document_id
      where (d.owner_id = (select auth.uid()) and s.user_id = p_profile_id)
         or (s.user_id = (select auth.uid()) and d.owner_id = p_profile_id)
    );
$$;

-- Resolves an exact email address to a user id, but only for the owner of the
-- given document, so it can't be used to browse the user directory. Returns
-- null when no account uses the address.
create function private.find_share_recipient(p_document_id uuid, p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  recipient uuid;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.documents d
    where d.id = p_document_id and d.owner_id = caller
  ) then
    raise exception 'Only the document owner can add collaborators'
      using errcode = '42501';
  end if;

  if p_email is null or char_length(p_email) > 320 then
    return null;
  end if;

  select p.id into recipient
  from public.profiles p
  where p.email = lower(btrim(p_email));

  return recipient;
end;
$$;

revoke all on function private.document_share_role(uuid) from public;
revoke all on function private.owns_document(uuid) from public;
revoke all on function private.can_view_profile(uuid) from public;
revoke all on function private.find_share_recipient(uuid, text) from public;

grant execute on function private.document_share_role(uuid) to authenticated;
grant execute on function private.owns_document(uuid) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.find_share_recipient(uuid, text) to authenticated;

-- The one RPC the app calls. SECURITY INVOKER: it runs as the caller and only
-- forwards to the private helper, which enforces ownership itself.
create function public.find_share_recipient(p_document_id uuid, p_email text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select private.find_share_recipient(p_document_id, p_email);
$$;

-- Supabase grants new public functions to anon and authenticated by default.
revoke all on function public.find_share_recipient(uuid, text) from public, anon;
grant execute on function public.find_share_recipient(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create policy "Collaborators read shared documents"
on public.documents for select to authenticated
using (private.document_share_role(id) is not null);

create policy "Editors update shared documents"
on public.documents for update to authenticated
using (private.document_share_role(id) = 'editor')
with check (private.document_share_role(id) = 'editor');

-- Only title and content can change through the API, for owners and editors
-- alike. owner_id, id, created_at, and updated_at (set by trigger) are
-- immutable. Insert and delete privileges are unchanged.
revoke update on public.documents from authenticated;
grant update (title, content) on public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- document_shares
-- ---------------------------------------------------------------------------
-- Select, insert, and delete policies from 001 already restrict management to
-- the owner and let recipients see their own share. Owners can now also change
-- a collaborator's role; nothing else on a share row can be updated.

grant update (role) on public.document_shares to authenticated;

create policy "Owners change share roles"
on public.document_shares for update to authenticated
using (private.owns_document(document_id))
with check (private.owns_document(document_id));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Replace the open directory with: your own profile, plus the profiles of
-- people you share documents with. Adding a collaborator by email goes through
-- find_share_recipient instead of reading the table.

drop policy "Authenticated users read profiles" on public.profiles;

create policy "Users read own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Users read collaborator profiles"
on public.profiles for select to authenticated
using (private.can_view_profile(id));
