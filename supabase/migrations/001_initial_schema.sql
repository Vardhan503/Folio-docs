-- User profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id)
    on delete cascade,
  title text not null default 'Untitled document',
  content jsonb not null default
    '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Document sharing
create table public.document_shares (
  document_id uuid not null references public.documents(id)
    on delete cascade,
  user_id uuid not null references public.profiles(id)
    on delete cascade,
  role text not null default 'viewer'
    check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index documents_owner_idx
  on public.documents(owner_id, updated_at desc);

create index document_shares_user_idx
  on public.document_shares(user_id);

-- Automatically create a profile for each new Auth user
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Maintain document updated_at
create function public.update_document_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_document_updated
before update on public.documents
for each row execute function public.update_document_timestamp();

-- Enable row-level security
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

-- Restrict exposed-table privileges
revoke all on public.profiles,
  public.documents,
  public.document_shares
from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete
  on public.documents to authenticated;
grant select, insert, delete
  on public.document_shares to authenticated;

-- Profiles: authenticated users can discover demo collaborators
create policy "Authenticated users read profiles"
on public.profiles for select to authenticated
using (true);

-- Documents: owner-only access for Task 2
create policy "Owners read documents"
on public.documents for select to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners create documents"
on public.documents for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners update documents"
on public.documents for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners delete documents"
on public.documents for delete to authenticated
using (owner_id = (select auth.uid()));

-- Sharing entries: visible to the recipient and owner
create policy "Participants read shares"
on public.document_shares for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.owner_id = (select auth.uid())
  )
);

create policy "Owners create shares"
on public.document_shares for insert to authenticated
with check (
  user_id <> (select auth.uid())
  and exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.owner_id = (select auth.uid())
  )
);

create policy "Owners revoke shares"
on public.document_shares for delete to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = document_id
      and d.owner_id = (select auth.uid())
  )
);
