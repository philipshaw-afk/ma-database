-- 24/10/2026: the deal index carries the report's own Cross Border field (pdf_cross_border, Yes / No).
-- The site uses it for the Search Form's Cross Border filter and the Home dashboard's private deals summary,
-- instead of comparing the target's and bidder's countries (the recorded field also counts a foreign seller).
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
        'p', d.export_path,
        'f', (select jsonb_object_agg(e.key, e.value) from jsonb_each(d.fields) e where e.key = any(keys))
      )) order by d.deal_number desc)
      from public.deals d
      where d.coverage_status = 'reported' and d.admin_state = 'LIVE' and d.deal_number is not null and d.export_path is not null), '[]'::jsonb),
    'status', coalesce((select jsonb_object_agg(s.deal_no, s.data) from public.db_offer_status s), '{}'::jsonb),
    'status_as_of', (select max(s.as_of) from public.db_offer_status s)
  );
end $function$;
