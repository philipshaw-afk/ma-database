-- 24/10/2026: company names on the site spelt as the deal reports spell them.
-- The database holds names in capitals and the site title-cases them ("TK ELEVATOR GMBH" -> "Tk Elevator GmbH").
-- For each word in a deal's names (target, bidder, seller, ultimate bidder, bidding subsidiary, ultimate divestor) these
-- tables record how the deal's own report text writes it - lines with no small letters (headings) left out, and
-- all-small-letter uses ("it", "on", "bank") ignored - so acronyms and brand spellings come out right: TK, SFR, USI, KKR,
-- BlackRock, easyJet.
--   db_name_case_deal  per deal: the word's spellings with counts; nc = the deal's own spellings where they differ from
--                      the site-wide ones ('' = plain capitalisation)
--   db_name_case       site-wide spelling of a word: in capitals, with a capital inside, or (for a word without vowels)
--                      as written, used in at least 60% of the reports' capitalised mentions; short function words
--                      (ON, OF, DE ...) are left to each deal
-- db_name_case_sweep() reads new and changed deals and rebuilds both (pg_cron job db-name-case-sweep, every 10 minutes);
-- db_deal_index() returns the site-wide spellings ('case') and each deal's own differences ('nc').

create table if not exists public.db_name_case_deal (
  deal_id uuid primary key references public.deals(id) on delete cascade,
  counts jsonb not null default '{}'::jsonb,
  nc jsonb,
  computed_at timestamptz not null default now()
);
create table if not exists public.db_name_case (
  word text primary key,
  cased text not null,
  n integer not null,
  tot integer not null
);
alter table public.db_name_case_deal enable row level security;
alter table public.db_name_case enable row level security;
revoke all on public.db_name_case_deal, public.db_name_case from anon, authenticated;

create or replace function public.db_name_case_sweep(p_limit integer default 400)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  k integer := 0; gone integer := 0;
  stop text[] := array['IS','ON','OF','AND','IN','AT','TO','BY','FOR','THE','AN','OR','AS','BE','IF','SO','NO','UP','OUT','OFF','NEW','ONE','ALL','ITS','OUR','WE',
    'DE','DA','DI','DO','DU','LA','LE','EL','EN','ET','UND','DER','DIE','DAS','VON','VAN','DEN','DES','DEL','DELLA','DELLE','DEGLI','DEI','LES','LOS','LAS','AL','AM','IM','ZU'];
begin
  -- 1) new and changed deals: how their report text spells each word of their names
  with todo as (
    select d.id from public.deals d left join public.db_name_case_deal c on c.deal_id = d.id
    where d.coverage_status = 'reported' and d.admin_state = 'LIVE' and d.deal_number is not null and d.export_path is not null
      and (c.deal_id is null or d.updated_at > c.computed_at)
    order by d.updated_at desc limit p_limit),
  src as (
    select d.id,
      upper(concat_ws(' ', d.target, d.bidder, d.seller, d.fields->>'Ultimate Bidder', d.fields->>'pdf_bidding_subsidiary', d.fields->>'Ultimate Divestor name')) as names,
      regexp_replace(concat_ws(E'\n', d.overview, d.profiles, d.background, d.target_details), '^[^[:lower:]]*$', '', 'gn') as txt
    from public.deals d join todo using (id)),
  pat as (
    select s.id, s.txt, '\m(' || string_agg(distinct t.w, '|') || ')\M' as re
    from src s cross join lateral regexp_split_to_table(s.names, '[^[:alnum:]]+') t(w)
    where length(t.w) between 2 and 40 and t.w ~ '[[:alpha:]]'
    group by s.id, s.txt),
  hits as (
    select p.id, upper(x[1]) as w, x[1] as v
    from pat p cross join lateral regexp_matches(p.txt, p.re, 'gi') x
    where x[1] ~ '[[:upper:]]'),
  per as (select id, w, jsonb_object_agg(v, n) as vs from (select id, w, v, count(*)::int as n from hits group by 1, 2, 3) z group by 1, 2),
  agg as (select t.id, coalesce((select jsonb_object_agg(per.w, per.vs) from per where per.id = t.id), '{}'::jsonb) as counts from todo t)
  insert into public.db_name_case_deal (deal_id, counts, computed_at)
  select id, counts, now() from agg
  on conflict (deal_id) do update set counts = excluded.counts, computed_at = excluded.computed_at;
  get diagnostics k = row_count;

  delete from public.db_name_case_deal c where not exists (
    select 1 from public.deals d where d.id = c.deal_id and d.coverage_status = 'reported' and d.admin_state = 'LIVE'
      and d.deal_number is not null and d.export_path is not null);
  get diagnostics gone = row_count;
  if k = 0 and gone = 0 then return jsonb_build_object('read', 0); end if;

  -- 2) site-wide spellings
  delete from public.db_name_case;
  insert into public.db_name_case (word, cased, n, tot)
  select w, v, n, tot from (
    select distinct on (w) w, v, n, tot from (
      select w.key as w, v.key as v, sum((v.value)::int)::int as n, (sum(sum((v.value)::int)) over (partition by w.key))::int as tot
      from public.db_name_case_deal c cross join lateral jsonb_each(c.counts) w cross join lateral jsonb_each(w.value) v
      group by 1, 2) z
    order by w, n desc, v) b
  where n >= 0.6 * tot and not (w = any(stop))
    and ((v = w and v ~ '[[:alpha:]]') or v ~ '[[:lower:]][[:upper:]]' or (w !~ '[AEIOUY]' and w ~ '^[[:upper:]]+$' and v ~ '^[[:upper:]]'));

  -- 3) each deal's own spellings where they differ from the site-wide ones (at least two capitalised mentions, 60%)
  update public.db_name_case_deal c set nc = o.nc
  from (
    select c2.deal_id,
      (select jsonb_object_agg(x.w, x.own)
         from (select w.key as w, b.n, b.tot,
                 case when (b.v = w.key and b.v ~ '[[:alpha:]]') or b.v ~ '[[:lower:]][[:upper:]]'
                        or (w.key !~ '[AEIOUY]' and w.key ~ '^[[:upper:]]+$' and b.v ~ '^[[:upper:]]') then b.v else '' end as own
               from jsonb_each(c2.counts) w
               cross join lateral (select v.key as v, (v.value)::int as n, (sum((v.value)::int) over ())::int as tot
                                   from jsonb_each(w.value) v order by (v.value)::int desc, v.key limit 1) b) x
         left join public.db_name_case g on g.word = x.w
        where x.tot >= 2 and x.n >= 0.6 * x.tot and x.own is distinct from coalesce(g.cased, '')) as nc
    from public.db_name_case_deal c2) o
  where o.deal_id = c.deal_id and c.nc is distinct from o.nc;

  return jsonb_build_object('read', k, 'removed', gone,
    'words', (select count(*) from public.db_name_case),
    'deals_with_own', (select count(*) from public.db_name_case_deal where nc is not null),
    'waiting', (select count(*) from public.deals d left join public.db_name_case_deal c on c.deal_id = d.id
                where d.coverage_status = 'reported' and d.admin_state = 'LIVE' and d.deal_number is not null and d.export_path is not null
                  and (c.deal_id is null or d.updated_at > c.computed_at)));
end $function$;
revoke all on function public.db_name_case_sweep(integer) from public, anon, authenticated;

-- the deal index: site-wide spellings ('case') and each deal's own differences ('nc')
create or replace function public.db_deal_index()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare keys text[] := array['Deal Attitude','Consideration type','Ultimate Bidder','pdf_bidding_subsidiary','Target Activities',
  'pdf_stock_index','Enterprise Value','Implied Total Equity Value','Pre-bid speculation premium','Enterprise Value/EBITDA',
  'Enterprise Value/Sales','Price/Earnings','Price/Book','Turnover (Sales)','EBITDA','Net Income (Earnings)','Ultimate Divestor name',
  'Bidder''s Legal Advisor','Bidder''s Financial Advisor','Target/Divestor''s Legal Advisor','Target/Divestor''s Financial Advisor',
  'pdf_cross_border'];
begin
  if not public.db_can_read() then raise exception 'This login does not have access to the M&A DataBase' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'deals', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'n', d.deal_number, 't', d.target, 'b', d.bidder, 's', d.seller,
        'tc', d.target_country, 'bc', d.bidder_country, 'sc', d.seller_country, 'rg', d.region,
        'pub', d.is_public, 'sec', d.sector, 'ty', d.deal_type, 'st', d.deal_status,
        'v', d.value, 'cur', d.currency, 'veur', d.value_eur, 'da', d.date_announced,
        'add', coalesce(d.exported_at, d.created_at)::date, 'op', d.offer_price, 'opc', d.offer_currency,
        'p', d.export_path, 'nc', c.nc,
        'f', (select jsonb_object_agg(e.key, e.value) from jsonb_each(d.fields) e where e.key = any(keys))
      )) order by d.deal_number desc)
      from public.deals d left join public.db_name_case_deal c on c.deal_id = d.id
      where d.coverage_status = 'reported' and d.admin_state = 'LIVE' and d.deal_number is not null and d.export_path is not null), '[]'::jsonb),
    'status', coalesce((select jsonb_object_agg(s.deal_no, s.data) from public.db_offer_status s), '{}'::jsonb),
    'status_as_of', (select max(s.as_of) from public.db_offer_status s),
    'case', coalesce((select jsonb_object_agg(n.word, n.cased) from public.db_name_case n), '{}'::jsonb)
  );
end $function$;

-- every 10 minutes: read new and changed deals
select cron.schedule('db-name-case-sweep', '*/10 * * * *', $$select public.db_name_case_sweep()$$);
