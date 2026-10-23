-- Word search inside the deal documents (23-10-2026)
-- The text of each document in deal_documents is read by the doc-text edge function into deal_document_pages
-- (one row per PDF page, Word part or PowerPoint slide) with a full-text index; db_doc_search / db_doc_snippets
-- search it for the website. Applied to DIANA's project as migration "document_text_search".

-- 1. reading state on each document --------------------------------------------------------------------------
alter table public.deal_documents
  add column if not exists text_status     text        not null default 'pending',
  add column if not exists text_pages      int,
  add column if not exists text_next       int         not null default 1,
  add column if not exists text_chars      bigint      not null default 0,
  add column if not exists text_attempts   int         not null default 0,
  add column if not exists text_lock_until timestamptz,
  add column if not exists text_gen        int         not null default 0,
  add column if not exists text_error      text,
  add column if not exists text_at         timestamptz;
alter table public.deal_documents drop constraint if exists deal_documents_text_status_chk;
alter table public.deal_documents add constraint deal_documents_text_status_chk
  check (text_status in ('pending', 'done', 'no_text', 'skipped', 'failed'));
comment on column public.deal_documents.text_status is
  'Text for the word search: pending (waiting / being read by doc-text), done, no_text (scanned, little or no text), skipped (file type not read), failed (see text_error)';

-- 2. the text, page by page ------------------------------------------------------------------------------------
create table if not exists public.deal_document_pages (
  document_id uuid not null references public.deal_documents(id) on delete cascade,
  page        int  not null,
  body        text not null,
  fts         tsvector generated always as (to_tsvector('english'::regconfig, body)) stored,
  primary key (document_id, page)
);
comment on table public.deal_document_pages is
  'Text of each deal document for the DataBase word search: one row per PDF page, Word part (about 2,500 words) or PowerPoint slide. Written only by the doc-text edge function.';
create index if not exists deal_document_pages_fts_idx on public.deal_document_pages using gin (fts);
alter table public.deal_document_pages enable row level security;   -- no policies: read only through db_doc_* functions
revoke all on public.deal_document_pages from anon, authenticated;

-- 3. a replaced file is read again ---------------------------------------------------------------------------
create or replace function public.deal_documents_text_reset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.uploaded_at is distinct from old.uploaded_at or new.path is distinct from old.path
     or new.size_bytes is distinct from old.size_bytes then
    delete from public.deal_document_pages where document_id = new.id;
    new.text_status := 'pending'; new.text_pages := null; new.text_next := 1; new.text_chars := 0;
    new.text_attempts := 0; new.text_lock_until := null; new.text_gen := old.text_gen + 1;
    new.text_error := null; new.text_at := null;
  end if;
  return new;
end $$;
drop trigger if exists deal_documents_text_reset on public.deal_documents;
create trigger deal_documents_text_reset before update on public.deal_documents
  for each row execute function public.deal_documents_text_reset();

-- 4. token the database uses to call doc-text (plain text in Vault, SHA-256 in app_secrets) ----------------------
do $$
declare t text;
begin
  if not exists (select 1 from public.app_secrets where name = 'doc-text') then
    t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    perform vault.create_secret(t, 'doc-text-token', 'x-docs-token the database sends to the doc-text edge function');
    insert into public.app_secrets (name, secret_sha256, created_at)
    values ('doc-text', encode(sha256(convert_to(t, 'UTF8')), 'hex'), now());
  end if;
end $$;

create or replace function public.doc_text_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_secrets s
                  where s.name in ('doc-text', 'deal-docs')
                    and s.secret_sha256 = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex'))
$$;

-- 5. queue: kick / claim / save / unlock / redo (service role only) ----------------------------------------------
create or replace function public.doc_text_kick() returns boolean
language plpgsql security definer set search_path = '' as $$
declare tok text; busy int; waiting int;
begin
  select count(*) filter (where text_lock_until > now()),
         count(*) filter (where text_lock_until is null or text_lock_until <= now())
    into busy, waiting
    from public.deal_documents where text_status = 'pending';
  if waiting = 0 or busy >= 3 then return false; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'doc-text-token';
  if tok is null then return false; end if;
  perform net.http_post(
    url := 'https://awpbhcyhfgsznmrqiddv.supabase.co/functions/v1/doc-text?action=run',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-docs-token', tok),
    timeout_milliseconds := 120000);
  return true;
end $$;

create or replace function public.deal_documents_text_kick_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.doc_text_kick();
  return null;
end $$;
drop trigger if exists deal_documents_text_kick on public.deal_documents;
create trigger deal_documents_text_kick after insert or update of uploaded_at, path, size_bytes on public.deal_documents
  for each statement execute function public.deal_documents_text_kick_trg();

-- the next waiting document (smallest first, so announcements are searchable before the annual reports);
-- at most 3 documents are read at once
create or replace function public.doc_text_claim()
returns table (id uuid, path text, mime_type text, file_name text, text_next int, text_attempts int, text_gen int, text_chars bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if (select count(*) from public.deal_documents x where x.text_status = 'pending' and x.text_lock_until > now()) >= 3 then
    return;
  end if;
  return query
  update public.deal_documents d
     set text_lock_until = now() + interval '3 minutes', text_attempts = d.text_attempts + 1
   where d.id = (select x.id from public.deal_documents x
                  where x.text_status = 'pending' and (x.text_lock_until is null or x.text_lock_until <= now())
                  order by x.size_bytes nulls last, x.uploaded_at
                  limit 1 for update skip locked)
  returning d.id, d.path, d.mime_type, d.file_name, d.text_next, d.text_attempts, d.text_gen, d.text_chars;
end $$;

-- p_pages: [{"p": page, "t": text}, ...]; ignored if the file was replaced while it was being read (text_gen)
create or replace function public.doc_text_save(p_id uuid, p_gen int, p_pages jsonb, p_next int, p_total int,
                                                p_chars bigint, p_status text, p_error text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.deal_documents where id = p_id and text_gen = p_gen for update;
  if not found then return false; end if;
  insert into public.deal_document_pages (document_id, page, body)
  select p_id, (e->>'p')::int, e->>'t'                       -- (doc-text strips NUL and other control characters)
    from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) e
   where coalesce(btrim(e->>'t'), '') <> ''
  on conflict (document_id, page) do update set body = excluded.body;
  update public.deal_documents
     set text_attempts = case when coalesce(p_next, text_next) > text_next or coalesce(p_status, 'pending') <> 'pending'
                              then 0 else text_attempts end,
         text_next = coalesce(p_next, text_next),
         text_pages = coalesce(p_total, text_pages),
         text_chars = coalesce(p_chars, text_chars),
         text_status = coalesce(p_status, text_status),
         text_error = p_error,
         text_lock_until = null,
         text_at = now()
   where id = p_id;
  return true;
end $$;

-- a storage or save problem: the document waits 2 minutes before the next try; after 8 tries it is marked failed
create or replace function public.doc_text_unlock(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.deal_documents
     set text_lock_until = now() + interval '2 minutes',
         text_status = case when text_attempts >= 8 then 'failed' else text_status end,
         text_error = case when text_attempts >= 8 then coalesce(text_error, 'could not be saved after 8 tries') else text_error end
   where id = p_id
$$;

create or replace function public.doc_text_redo(p_deal text default null, p_id uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_deal is null and p_id is null then return 0; end if;
  delete from public.deal_document_pages p using public.deal_documents d
   where p.document_id = d.id and (d.deal_number = p_deal or d.id = p_id);
  update public.deal_documents
     set text_status = 'pending', text_pages = null, text_next = 1, text_chars = 0, text_attempts = 0,
         text_lock_until = null, text_gen = text_gen + 1, text_error = null, text_at = null
   where deal_number = p_deal or id = p_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.doc_text_token_ok(text), public.doc_text_kick(), public.doc_text_claim(),
  public.doc_text_save(uuid, int, jsonb, int, int, bigint, text, text), public.doc_text_unlock(uuid),
  public.doc_text_redo(text, uuid), public.deal_documents_text_reset(), public.deal_documents_text_kick_trg()
  from public, anon, authenticated;
grant execute on function public.doc_text_token_ok(text), public.doc_text_kick(), public.doc_text_claim(),
  public.doc_text_save(uuid, int, jsonb, int, int, bigint, text, text), public.doc_text_unlock(uuid),
  public.doc_text_redo(text, uuid) to service_role;

-- 6. searching (website) -------------------------------------------------------------------------------------
-- The same boxes as the report word search. In documents: each of "all these words" must be somewhere in the same
-- document, the exact phrase on one page, one of the "one or more" words anywhere in it; a document with any
-- unwanted word is left out.
create or replace function public.db_ws_parts(p_all text, p_phrase text, p_any text[], p_not text,
                                              out comps tsquery[], out anyq tsquery, out notq tsquery)
language plpgsql stable set search_path = '' as $$
declare a tsquery; w text; i int;
begin
  comps := '{}';
  if nullif(btrim(p_all), '') is not null then
    foreach w in array regexp_split_to_array(btrim(p_all), '\s+') loop
      a := plainto_tsquery('english', w);
      if numnode(a) > 0 then comps := array_append(comps, a); end if;
    end loop;
  end if;
  if nullif(btrim(p_phrase), '') is not null then
    a := phraseto_tsquery('english', p_phrase);
    if numnode(a) > 0 then comps := array_append(comps, a); end if;
  end if;
  if p_any is not null then
    a := null;
    foreach w in array p_any loop
      if nullif(btrim(w), '') is not null and numnode(plainto_tsquery('english', w)) > 0 then
        a := case when a is null then plainto_tsquery('english', w) else a || plainto_tsquery('english', w) end;
      end if;
    end loop;
    if a is not null then comps := array_append(comps, a); end if;
  end if;
  if nullif(btrim(p_not), '') is not null then
    foreach w in array regexp_split_to_array(btrim(p_not), '\s+') loop
      a := plainto_tsquery('english', w);
      if numnode(a) > 0 then notq := case when notq is null then a else notq || a end; end if;
    end loop;
  end if;
  if cardinality(comps) > 0 then
    anyq := comps[1];
    for i in 2 .. cardinality(comps) loop anyq := anyq || comps[i]; end loop;
  end if;
end $$;

-- documents (of deals on the site) that match; pages = up to 12 matching pages, best first
create or replace function public.db_doc_search(p_all text default null, p_phrase text default null,
                                                p_any text[] default null, p_not text default null)
returns table (deal_number text, document_id uuid, directory text, file_name text, path text, mime_type text,
               doc_date date, hits int, pages int[])
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare w record; n int;
begin
  if not public.db_can_read() then
    raise exception 'This login does not have access to the M&A DataBase' using errcode = '42501';
  end if;
  select * into w from public.db_ws_parts(p_all, p_phrase, p_any, p_not);
  n := coalesce(cardinality(w.comps), 0);
  if n = 0 then return; end if;
  return query
  with c as (select u.q, u.ord::int as ord from unnest(w.comps) with ordinality as u(q, ord)),
  m as (select p.document_id, p.page, c.ord from public.deal_document_pages p join c on p.fts @@ c.q),
  ok as (select m.document_id from m group by m.document_id having count(distinct m.ord) = n),
  pg as (select m.document_id, m.page, count(distinct m.ord) as k
           from m join ok on ok.document_id = m.document_id group by m.document_id, m.page),
  rk as (select pg.document_id, pg.page, pg.k, ts_rank(p.fts, w.anyq) as r
           from pg join public.deal_document_pages p on p.document_id = pg.document_id and p.page = pg.page)
  select d.deal_number, d.id, d.directory, d.file_name, d.path, d.mime_type, d.doc_date,
         count(*)::int,
         (array_agg(rk.page order by rk.k desc, rk.r desc, rk.page))[1:12]
    from rk join public.deal_documents d on d.id = rk.document_id
   where (w.notq is null or not exists (select 1 from public.deal_document_pages x
                                         where x.document_id = d.id and x.fts @@ w.notq))
     -- unwanted words in the deal's own report rule the deal out, as in db_word_search
     and (w.notq is null or not exists (select 1 from public.deals dn
                                         where dn.deal_number = d.deal_number and dn.coverage_status = 'reported'
                                           and dn.admin_state = 'LIVE' and dn.fts @@ w.notq))
     and exists (select 1 from public.deals dl
                  where dl.deal_number = d.deal_number and dl.coverage_status = 'reported' and dl.admin_state = 'LIVE'
                    and dl.export_path is not null)
   group by d.id
   order by d.deal_number, max(rk.k) desc, max(rk.r) desc;
end $$;

-- highlighted extracts for the pages shown (p_docs[i] / p_pages[i] pairs); matches are wrapped in U+E000 / U+E001
create or replace function public.db_doc_snippets(p_docs uuid[], p_pages int[], p_all text default null,
                                                  p_phrase text default null, p_any text[] default null)
returns table (document_id uuid, page int, snippet text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare w record;
begin
  if not public.db_can_read() then
    raise exception 'This login does not have access to the M&A DataBase' using errcode = '42501';
  end if;
  select * into w from public.db_ws_parts(p_all, p_phrase, p_any, null);
  if w.anyq is null then return; end if;
  return query
  select p.document_id, p.page,
         ts_headline('english', p.body, w.anyq,
                     format('StartSel=%s, StopSel=%s, MaxWords=34, MinWords=16, ShortWord=2, MaxFragments=2, FragmentDelimiter=" … "',
                            chr(57344), chr(57345)))
    from (select distinct u.d, u.pg from unnest(p_docs, p_pages) as u(d, pg) limit 600) s
    join public.deal_document_pages p on p.document_id = s.d and p.page = s.pg;
end $$;

-- how much of the documents can be searched (shown under the tick box)
create or replace function public.db_doc_text_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.db_can_read() then
    raise exception 'This login does not have access to the M&A DataBase' using errcode = '42501';
  end if;
  return (select jsonb_build_object('docs', count(*), 'deals', count(distinct deal_number),
                                    'done', count(*) filter (where text_status = 'done'),
                                    'pending', count(*) filter (where text_status = 'pending'),
                                    'no_text', count(*) filter (where text_status in ('no_text', 'skipped', 'failed')),
                                    'pages', (select count(*) from public.deal_document_pages))
            from public.deal_documents);
end $$;

revoke all on function public.db_ws_parts(text, text, text[], text), public.db_doc_search(text, text, text[], text),
  public.db_doc_snippets(uuid[], int[], text, text, text[]), public.db_doc_text_stats() from public, anon;
grant execute on function public.db_doc_search(text, text, text[], text), public.db_doc_snippets(uuid[], int[], text, text, text[]),
  public.db_doc_text_stats() to authenticated;
grant execute on function public.db_ws_parts(text, text, text[], text) to authenticated, service_role;

-- 7. sweeper: restarts reading if a call was cut off (pg_cron) ---------------------------------------------------
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'doc-text-sweep';
select cron.schedule('doc-text-sweep', '*/2 * * * *', $cron$select public.doc_text_kick()$cron$);
