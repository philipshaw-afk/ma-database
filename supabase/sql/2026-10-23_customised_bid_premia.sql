-- Customised bid premia (23-10-2026)
-- Applied to DIANA's project on 23-10-2026.
-- Share prices for the customised bid premia download, and the dividends / splits behind the
-- "M&A Monitor adjusted" price. Applied to DIANA's project as migration "customised_bid_premia".
--
-- M&A Monitor adjusted price (as the admin site's Price Adjustment Tool, but automatic): every dividend is deducted
-- from the prices before its ex-dividend date, and every split / consolidation scales the prices before its
-- ex-date (price / ratio). Where share_prices.adj_close is filled (e.g. the old database's adjusted series,
-- imported as it stands) that figure is used instead.

-- 1. an adjusted close can be stored with the prices -------------------------------------------------------------
alter table public.share_prices add column if not exists adj_close numeric;
comment on column public.share_prices.adj_close is
  'M&A Monitor adjusted close when imported ready-made (e.g. from the old database); otherwise the site adjusts the close using price_adjustments';

-- 2. dividends and splits by security -----------------------------------------------------------------------------
create table if not exists public.price_adjustments (
  id        uuid primary key default gen_random_uuid(),
  ric       text not null references public.price_securities(ric) on delete cascade,
  ex_date   date not null,
  kind      text not null check (kind in ('dividend', 'split')),
  amount    numeric,      -- dividend per share, in the share price's currency (pence for a pence-quoted share)
  ratio     numeric,      -- split: shares after per share before (2 = 2-for-1 split, 0.1 = 1-for-10 consolidation)
  note      text,
  loaded_at timestamptz not null default now(),
  loaded_by text,
  check ((kind = 'dividend' and amount > 0) or (kind = 'split' and ratio > 0))
);
create index if not exists price_adjustments_ric_idx on public.price_adjustments (ric, ex_date);
alter table public.price_adjustments enable row level security;   -- read and written only through db_* functions
revoke all on public.price_adjustments from anon, authenticated;
comment on table public.price_adjustments is
  'Dividends (deducted from prices before the ex-date) and splits / consolidations (prices before the ex-date divided by the ratio) for the M&A Monitor adjusted share price';

-- 3. admins: save a security's dividends and splits (the list replaces what was there) -----------------------------
-- p_rows: [{"d": "2026-05-14", "kind": "dividend", "amount": 0.25, "note": "final"}, {"d": ..., "kind": "split", "ratio": 2}]
create or replace function public.db_admin_save_adjustments(p_ric text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare who text; n int;
begin
  if not public.db_is_admin() then raise exception 'Only DataBase admins can change dividends and splits' using errcode = '42501'; end if;
  if not exists (select 1 from public.price_securities where ric = p_ric) then raise exception 'No share prices for RIC %', p_ric; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'Rows must be a list'; end if;
  who := coalesce((select u.email from auth.users u where u.id = auth.uid()), 'admin');
  delete from public.price_adjustments where ric = p_ric;
  insert into public.price_adjustments (ric, ex_date, kind, amount, ratio, note, loaded_by)
  select p_ric, (x->>'d')::date, x->>'kind',
         case when x->>'kind' = 'dividend' then (x->>'amount')::numeric end,
         case when x->>'kind' = 'split' then (x->>'ratio')::numeric end,
         nullif(btrim(x->>'note'), ''), who
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x;
  get diagnostics n = row_count;
  return jsonb_build_object('ric', p_ric, 'rows', n);
end $$;

-- 4. the Share price tab also gets the dividends / splits and the adjusted close -------------------------------------
create or replace function public.db_deal_prices(p_deal_number text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.db_can_read() then raise exception 'This login does not have access to the M&A DataBase' using errcode = '42501'; end if;
  select jsonb_build_object('ric', s.ric, 'isin', s.isin, 'name', s.name, 'currency', s.currency, 'source', s.source,
           'loaded_at', s.loaded_at,
           'rows', coalesce((select jsonb_agg(jsonb_build_array(p.trade_date, p.close) order by p.trade_date)
                               from public.share_prices p where p.ric = s.ric), '[]'::jsonb),
           'adj', coalesce((select jsonb_agg(jsonb_build_object('d', a.ex_date, 'kind', a.kind, 'amount', a.amount, 'ratio', a.ratio,
                                                                'note', a.note) order by a.ex_date)
                              from public.price_adjustments a where a.ric = s.ric), '[]'::jsonb))
    into r
    from public.deal_tickers t join public.price_securities s on s.ric = t.ric
   where t.deal_number = p_deal_number and t.role = 'target';
  return r;
end $$;

-- 5. admins' loader: an optional 8th value per row is a ready-made adjusted close -------------------------------------
create or replace function public.db_admin_load_prices(p_deal_number text, p_ric text, p_isin text, p_name text, p_currency text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int; who text;
begin
  if not public.db_is_admin() then raise exception 'Only DataBase admins can load share prices' using errcode = '42501'; end if;
  if coalesce(trim(p_ric), '') = '' then raise exception 'The file has no RIC'; end if;
  if not exists (select 1 from public.deals d where d.deal_number = p_deal_number and d.coverage_status = 'reported') then
    raise exception 'There is no reported deal %', p_deal_number;
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'No prices in the file'; end if;
  who := coalesce((select u.email from auth.users u where u.id = auth.uid()), 'admin');
  insert into public.price_securities as s (ric, isin, name, currency, loaded_at, loaded_by)
  values (trim(p_ric), nullif(trim(p_isin), ''), nullif(trim(p_name), ''), nullif(upper(trim(p_currency)), ''), now(), who)
  on conflict (ric) do update set isin = coalesce(excluded.isin, s.isin), name = coalesce(excluded.name, s.name),
    currency = coalesce(excluded.currency, s.currency), loaded_at = now(), loaded_by = who;
  insert into public.share_prices as p (ric, trade_date, close, open, high, low, volume, vwap, adj_close)
  select trim(p_ric), (x->>0)::date, (x->>1)::numeric, nullif(x->>2, '')::numeric, nullif(x->>3, '')::numeric,
         nullif(x->>4, '')::numeric, nullif(x->>5, '')::numeric, nullif(x->>6, '')::numeric, nullif(x->>7, '')::numeric
    from jsonb_array_elements(p_rows) x
   where nullif(x->>1, '') is not null
  on conflict (ric, trade_date) do update set close = excluded.close, open = excluded.open, high = excluded.high,
    low = excluded.low, volume = excluded.volume, vwap = excluded.vwap, adj_close = coalesce(excluded.adj_close, p.adj_close);
  get diagnostics n = row_count;
  update public.price_securities s set first_date = q.a, last_date = q.b
    from (select min(trade_date) a, max(trade_date) b from public.share_prices where ric = trim(p_ric)) q
   where s.ric = trim(p_ric);
  insert into public.deal_tickers (deal_number, role, ric, linked_by) values (p_deal_number, 'target', trim(p_ric), who)
  on conflict (deal_number, role) do update set ric = excluded.ric, linked_at = now(), linked_by = who;
  return jsonb_build_object('ric', trim(p_ric), 'rows', n,
    'first', (select first_date from public.price_securities where ric = trim(p_ric)),
    'last', (select last_date from public.price_securities where ric = trim(p_ric)));
end $$;

-- 6. the download: per deal, the target's security, prices in a window, dividends / splits and (UK & Irish offers)
-- the offer price path from the Offer Revisions data. p_req: [{"n": "0044819", "from": "2025-06-01", "to": "2026-12-31"}];
-- without from / to only the security, adjustments and path come back (used first, to work out the windows).
create or replace function public.db_premia_data(p_req jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.db_can_read() then raise exception 'This login does not have access to the M&A DataBase' using errcode = '42501'; end if;
  if jsonb_typeof(p_req) <> 'array' then raise exception 'p_req must be a list'; end if;
  if jsonb_array_length(p_req) > 500 then raise exception 'Send up to 500 deals at a time'; end if;
  return coalesce((
    select jsonb_object_agg(q.n, jsonb_build_object(
             'ric', s.ric, 'ccy', s.currency, 'name', s.name,
             'rows', case when s.ric is null or q.f is null or q.t is null then '[]'::jsonb else coalesce((
                       select jsonb_agg(jsonb_build_array(p.trade_date, p.close, p.open, p.high, p.low, p.volume, p.vwap, p.adj_close)
                                        order by p.trade_date)
                         from public.share_prices p where p.ric = s.ric and p.trade_date between q.f and q.t), '[]'::jsonb) end,
             'adj', coalesce((select jsonb_agg(jsonb_build_array(a.ex_date, a.kind, a.amount, a.ratio) order by a.ex_date)
                                from public.price_adjustments a where a.ric = s.ric), '[]'::jsonb),
             'path', (select o.path from public.db_uk_offer_paths o where o.deal_no = q.n)))
      from (select distinct on (e->>'n') e->>'n' as n, nullif(e->>'from', '')::date as f, nullif(e->>'to', '')::date as t
              from jsonb_array_elements(p_req) e where coalesce(e->>'n', '') <> '') q
      left join public.deal_tickers tk on tk.deal_number = q.n and tk.role = 'target'
      left join public.price_securities s on s.ric = tk.ric), '{}'::jsonb);
end $$;

revoke all on function public.db_admin_save_adjustments(text, jsonb), public.db_premia_data(jsonb) from public, anon;
grant execute on function public.db_admin_save_adjustments(text, jsonb), public.db_premia_data(jsonb) to authenticated;
