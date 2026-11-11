-- Row-level security checks for 003_document_sharing.sql.
--
-- Run in the Supabase SQL editor after applying migrations 001–003. It needs
-- two existing users: set their emails below. Everything runs in one
-- transaction that is rolled back, so no data is kept.
--
-- Each check runs as the `authenticated` role with request.jwt.claims set to
-- that user, which is what auth.uid() reads, so the real policies apply.
-- Success ends with "ALL SHARING RLS CHECKS PASSED"; the first failing check
-- aborts with "FAIL: <check>".

begin;

select set_config('test.owner_email', 'owner@example.com', true);
select set_config('test.collaborator_email', 'collaborator@example.com', true);

-- Switch the current transaction to act as a user (or 'anon').
create function pg_temp.act_as(p_who text) returns void
language plpgsql as $$
declare
  user_id uuid;
begin
  execute 'reset role';
  if p_who = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    return;
  end if;
  select id into user_id from public.profiles
  where email = lower(current_setting('test.' || p_who || '_email'));
  if user_id is null then
    raise exception 'Set test.%_email to an existing user', p_who;
  end if;
  perform set_config('test.' || p_who || '_id', user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

create function pg_temp.check(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'PASS: %', p_label;
end;
$$;

-- Rows affected by a statement; -1 if it raised an error.
create function pg_temp.affected(p_sql text) returns integer
language plpgsql as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end;
$$;

create function pg_temp.doc() returns uuid
language sql as $$ select current_setting('test.doc_id')::uuid $$;

-- Resolve both user ids up front.
select pg_temp.act_as('collaborator');
select pg_temp.act_as('owner');

-- Owner creates a document.
with created as (
  insert into public.documents (owner_id, title)
  values ((select auth.uid()), 'RLS test document')
  returning id
)
select set_config('test.doc_id', id::text, true) from created;

select pg_temp.check(
  (select count(*) from public.documents where id = pg_temp.doc()) = 1,
  'owner reads own document');

-- Before sharing, the collaborator has no access.
select pg_temp.act_as('collaborator');
select pg_temp.check(
  (select count(*) from public.documents where id = pg_temp.doc()) = 0,
  'unshared user cannot read the document');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set title = %L where id = %L', 'hijack', pg_temp.doc())) = 0,
  'unshared user cannot update the document');
select pg_temp.check(
  (select count(*) from public.profiles where id = current_setting('test.owner_id')::uuid) = 0,
  'unshared user cannot read the owner profile');
select pg_temp.check(
  (select count(*) from public.profiles) = 1,
  'profiles directory is not exposed (only own profile visible)');
select pg_temp.check(
  pg_temp.affected(format(
    'select public.find_share_recipient(%L, %L)', pg_temp.doc(),
    current_setting('test.owner_email'))) = -1,
  'non-owner cannot resolve emails for the document');
select pg_temp.check(
  pg_temp.affected(format(
    'insert into public.document_shares (document_id, user_id, role) values (%L, %L, %L)',
    pg_temp.doc(), current_setting('test.collaborator_id'), 'editor')) = -1,
  'non-owner cannot grant themselves access');

-- Owner resolves the collaborator by exact email and shares as viewer.
select pg_temp.act_as('owner');
select pg_temp.check(
  public.find_share_recipient(pg_temp.doc(), upper(current_setting('test.collaborator_email')))
    = current_setting('test.collaborator_id')::uuid,
  'owner resolves a collaborator by email (case-insensitive)');
select pg_temp.check(
  public.find_share_recipient(pg_temp.doc(), 'no-such-user@folio.invalid') is null,
  'unknown email resolves to null');
select pg_temp.check(
  pg_temp.affected(format(
    'insert into public.document_shares (document_id, user_id, role) values (%L, %L, %L)',
    pg_temp.doc(), current_setting('test.owner_id'), 'editor')) = -1,
  'owner cannot share with themselves');
select pg_temp.check(
  pg_temp.affected(format(
    'insert into public.document_shares (document_id, user_id, role) values (%L, %L, %L)',
    pg_temp.doc(), current_setting('test.collaborator_id'), 'viewer')) = 1,
  'owner shares the document as viewer');
select pg_temp.check(
  pg_temp.affected(format(
    'insert into public.document_shares (document_id, user_id, role) values (%L, %L, %L)',
    pg_temp.doc(), current_setting('test.collaborator_id'), 'editor')) = -1,
  'a second share for the same user is rejected');

-- Viewer: read-only.
select pg_temp.act_as('collaborator');
select pg_temp.check(
  (select count(*) from public.documents where id = pg_temp.doc()) = 1,
  'viewer reads the shared document');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set title = %L where id = %L', 'viewer edit', pg_temp.doc())) = 0,
  'viewer cannot rename');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set content = %L::jsonb where id = %L',
    '{"type":"doc","content":[]}', pg_temp.doc())) = 0,
  'viewer cannot edit content');
select pg_temp.check(
  (select count(*) from public.document_shares where document_id = pg_temp.doc()) = 1,
  'viewer sees their own share');
select pg_temp.check(
  (select count(*) from public.profiles where id = current_setting('test.owner_id')::uuid) = 1,
  'viewer can see the owner profile');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.document_shares set role = %L where document_id = %L', 'editor', pg_temp.doc())) = 0,
  'viewer cannot promote themselves');
select pg_temp.check(
  pg_temp.affected(format(
    'delete from public.document_shares where document_id = %L', pg_temp.doc())) = 0,
  'viewer cannot delete shares');

-- Owner promotes the collaborator to editor.
select pg_temp.act_as('owner');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.document_shares set role = %L where document_id = %L and user_id = %L',
    'editor', pg_temp.doc(), current_setting('test.collaborator_id'))) = 1,
  'owner changes the role to editor');
select pg_temp.check(
  (select count(*) from public.profiles where id = current_setting('test.collaborator_id')::uuid) = 1,
  'owner can see the collaborator profile');

-- Editor: can edit title and content, nothing else.
select pg_temp.act_as('collaborator');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set title = %L where id = %L', 'Edited by editor', pg_temp.doc())) = 1,
  'editor renames the document');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set content = %L::jsonb where id = %L',
    '{"type":"doc","content":[{"type":"paragraph"}]}', pg_temp.doc())) = 1,
  'editor edits content');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set owner_id = %L where id = %L',
    current_setting('test.collaborator_id'), pg_temp.doc())) = -1,
  'editor cannot change owner_id');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set created_at = now() - interval %L where id = %L',
    '1 year', pg_temp.doc())) = -1,
  'editor cannot change created_at');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set id = gen_random_uuid() where id = %L', pg_temp.doc())) = -1,
  'editor cannot change id');
select pg_temp.check(
  pg_temp.affected(format(
    'delete from public.documents where id = %L', pg_temp.doc())) = 0,
  'editor cannot delete the document');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.document_shares set role = %L where document_id = %L', 'viewer', pg_temp.doc())) = 0,
  'editor cannot manage shares');
select pg_temp.check(
  pg_temp.affected(format(
    'select public.find_share_recipient(%L, %L)', pg_temp.doc(),
    current_setting('test.owner_email'))) = -1,
  'editor cannot resolve emails for sharing');

-- Ownership is immutable for owners too.
select pg_temp.act_as('owner');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set owner_id = %L where id = %L',
    current_setting('test.collaborator_id'), pg_temp.doc())) = -1,
  'owner cannot transfer ownership through the API');

-- Revocation.
select pg_temp.check(
  pg_temp.affected(format(
    'delete from public.document_shares where document_id = %L and user_id = %L',
    pg_temp.doc(), current_setting('test.collaborator_id'))) = 1,
  'owner revokes access');

select pg_temp.act_as('collaborator');
select pg_temp.check(
  (select count(*) from public.documents where id = pg_temp.doc()) = 0,
  'revoked user can no longer read the document');
select pg_temp.check(
  pg_temp.affected(format(
    'update public.documents set content = %L::jsonb where id = %L',
    '{"type":"doc","content":[]}', pg_temp.doc())) = 0,
  'revoked user can no longer save');
select pg_temp.check(
  (select count(*) from public.document_shares where document_id = pg_temp.doc()) = 0,
  'revoked user no longer sees the share');
select pg_temp.check(
  (select count(*) from public.profiles where id = current_setting('test.owner_id')::uuid) = 0,
  'revoked user no longer sees the owner profile');

-- Signed-out requests.
select pg_temp.act_as('anon');
select pg_temp.check(
  pg_temp.affected(format(
    'select public.find_share_recipient(%L, %L)', pg_temp.doc(), 'a@b.c')) = -1,
  'anon cannot call find_share_recipient');
select pg_temp.check(
  pg_temp.affected('select 1 from public.documents') = -1,
  'anon cannot read documents');

reset role;
select 'ALL SHARING RLS CHECKS PASSED' as result;

rollback;
