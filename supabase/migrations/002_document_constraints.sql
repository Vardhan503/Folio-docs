-- Defense in depth for Task 3: the app validates titles and content before
-- saving, and these constraints reject invalid rows from any other client.

alter table public.documents
  add constraint documents_title_length
    check (char_length(btrim(title)) between 1 and 120),
  add constraint documents_content_is_doc
    check (
      jsonb_typeof(content) = 'object'
      and content ->> 'type' = 'doc'
      and jsonb_typeof(content -> 'content') = 'array'
    );
