# M&A Monitor DataBase website

Live at **https://database.ma-dealboard.co.uk** (GitHub Pages, custom domain via `CNAME`).

A login-only client site built from the integrated-site mockup (`mamonitorintegratedsite_8_2_24.html`):

| Area | What it shows | Where the data comes from |
|---|---|---|
| **M&A DataBase › Home** | Pending deals dashboard with a **Public offers / Private deals** switch (see below), deal lookup, your recently viewed / downloaded reports, recently added deals | `db_deal_index()`, `db_offer_events`, `db_activity` |
| **Search Form / Search Results** | Parties, deal parameters, values, financials, word search of the report text (and, with the *Also search inside the deal documents* tick box, of the deal documents, shown under each deal with the document, page and a highlighted extract), offer-status and country-specific fields; CSV downloads | `db_deal_index()` (filtered in the browser), `db_word_search()` (full-text search on the server), `db_doc_search()` / `db_doc_snippets()` / `db_doc_text_stats()` |
| **Deal report** | New-format report: KPIs, offer status, transaction, key dates, valuation, advisers, financials, commentary, payment details, all fields; PDF download | `db_deal()`; PDFs from the private `deal-files` bucket (`exports/…`) via short-lived signed links |
| **Documents** (tab on each deal report) | The deal's source documents grouped as Press releases / Circulars / Accounts / Other, with date (period end for accounts), size, open (PDFs in a new tab) and download; tab only shows when a deal has documents | `db_deal_documents()`; files in the private `deal-files` bucket under `docs/<deal number>/…` via short-lived signed links; put there by the `deal-docs` edge function (PC uploader / Claude) |
| **Share price** (tab on each deal report) | The target's daily close (1Y default; 3M–All), with the offer price, announcement and pre-bid speculation dates; hover/arrow-key readout with the offer premium; Key prices table (latest, 1 day … 3 months before, 30-day average, pre-bid speculation, 52-week high/low) using the same conventions as the recorded bid premia; tab only shows when the deal has prices. Admins load a Morningstar download (CSV, one RIC) with the **Share prices** button in the report header. **Dividends and splits** card: the dividends / splits behind the M&A Monitor adjusted price; admins edit them (one line each) or paste a dividend table copied from a web page, which is read with forecasts and zero rows left out and other currencies converted at an editable rate | `db_deal_prices()`, `db_admin_load_prices()`, `db_admin_save_adjustments()`; tables `share_prices` (by RIC and date, optional imported `adj_close`), `price_securities`, `deal_tickers` (deal → RIC), `price_adjustments` |
| **Customised bid premia** (Search Results › Customised bid premia · Excel) | The offer's premium over the target's share price at any periods before / after a chosen reference date (first day of rumours / approach = the trading day after the pre-bid speculation date, announcement, completion, first–fourth increased offer from the Offer Revisions data); M&A Monitor adjusted close (default) or unadjusted close / open / high / low / VWAP; final, initial or in-force offer; calendar or trading days; date, price and premium per period, or every trading day in the window; premia range (red), no-volume prices (blue), mean / median rows | `db_premia_data()` (target's prices, dividends / splits, offer path), `db_export_rows()`; worked out in the browser (`premia.js`) |
| **Calendar** | Shareholder meetings, acceptance periods, regulatory dates, PUSU deadlines | `db_offer_events` |
| **ARB-Insight › Offer Statistics / Offer Revisions** | UK & Irish public offers since 2008 with live filters; tick boxes on the deal list (unticked deals leave every figure), Exclude outliers (Tukey 1.5×IQR per measure), word search of the write-ups (with an *Also search the deal documents* tick box; offers found in documents get a marker in the deal list), listed share element slider and domestic/overseas paper (shown once consideration terms are loaded), Excel workbook of every box and the offers behind it | `db_uk_offer_stats()`, `db_word_search()`, `db_doc_search()` |
| **Follow deals** | Follow button on each deal report; bell in the header with a pop-up of report updates on the deals you follow (pops up by itself when something is new); "Deals you follow" card on Home | `db_follow()`, `db_my_follows()`, `db_follows_seen()`; updates come from `db_deal_updates`, which trigger `cards_db_deal_update` fills when a DIANA update card is verified with the updated report PDF attached (the card title, without the company prefix, is the headline clients see) |
| **Users** (admins only) | Add client logins, reset passwords, enable/disable, usage; data import | `db_admin_members()`, edge function `db-admin`, `db_admin_import()` |

Deal reports are DIANA's own `deals` rows (reported, LIVE, with an exported PDF), so new reports appear on the site as soon as DIANA has them. The offer-status fields, calendar and UK offer statistics are loaded by an admin on the Users page from the mockup file.

**Currencies:** the deal value (`deals.value`) is in the deal's currency, but the database's value and financial fields (Implied Total Equity Value, Enterprise Value, Net debt, Turnover, EBITDA and so on in `deals.fields`) are in **sterling**, converted from the deal's currency. The site shows the headline equity / deal value in the deal's currency and labels every other figure £m; search filters and CSVs convert from sterling for those fields.

## Home: pending deals dashboard

The card counts DIANA's pending deal reports and switches between two summaries (the choice is remembered in the browser):

* **Public offers**: offer status (`db_offer_status`) and offer events (`db_offer_events`) as before: equity value, closings and meetings this month, offer regimes, offer / regulatory status, largest offers, next 14 days. The first tile counts the pending public deal reports, plus proposed offers.
* **Private deals**: the pending private deal reports in `db_deal_index()`: count (European targets / outside Europe), total and median deal value, announced in the last 30 days, cross-border share, region of target (the Search Form's regions), top target countries, deal type, time since announcement, latest announced, largest deals and sectors.
  * Deal value: the report's deal value (`deals.value`, deal currency) at the approximate rates in `config.js`; where that is nil, the database's sterling Enterprise Value or Implied Total Equity Value, whichever is larger.
  * Deal type groups: a combined type goes to the first group it matches of reverse takeover, MBO / MBI, minority stake, divestiture, private acquisition, merger / other.
  * Time since announcement: under 3 months, 3–6 months, 6–12 months, over a year (calendar months back from today).
  * Sectors: a deal counts in each of its sectors, as the Search Form's sector filter does, so the bars can add up to more than the number of deals.
  * Cross-border: the report's own Cross Border field (`pdf_cross_border`, which also counts a foreign seller) once `supabase/sql/2026-10-24_deal_index_cross_border.sql` has been applied; until then the target's and bidder's countries are compared. The Search Form's Cross Border filter uses the same value.
  * Clicking a region, country or sector bar opens Search Results for the pending private deals there (the `pending-private` preset with `data-region` / `data-country` / `data-sector`).

## Logins and security

* Supabase Auth on DIANA's project. Users sign in with email + password (or an emailed sign-in link).
* Who may read: the DIANA team (`team_members`, lead/deputy are admins) plus anyone active in `db_members` (clients, or extra admins). Everything is enforced in the database: the tables have row-level security and the `db_*` functions check `db_can_read()` / `db_is_admin()`. Clients never read DIANA's internal tables directly.
* Clients can only fetch report PDFs under `deal-files/exports/` and deal documents under `deal-files/docs/`, never card attachments.
* Documents are written only by the `deal-docs` edge function, which needs the upload token (header `x-docs-token`; only its SHA-256 is stored, in `app_secrets` as `deal-docs`). The token sits in `database_docs_config.json` in the Claude docs folder on Phil's PC.
* "Remember me" keeps the session in the browser; otherwise it ends with the browser session.
* Usage (report views, PDF downloads, document downloads, CSV exports) is logged in `db_activity`.

## Files

```
index.html                 page shell and all screens
assets/css/base.css        styles from the integrated-site mockup
assets/css/site.css        additions for the live site
assets/js/config.js        Supabase URL + publishable key, approximate FX rates for searching
assets/js/core.js          sign-in, router, helpers
assets/js/database.js      deal index, Home, Search Form, Search Results
assets/js/report.js        deal report
assets/js/calendar.js      calendar + Home dashboard (ported from the mockup)
assets/js/stats.js         UK offer statistics (ported from the mockup)
assets/js/revisions.js     offer revisions (ported from the mockup)
assets/js/admin.js         users and data import
assets/js/follow.js        follow deals: Follow button, header bell and pop-up, Home card
assets/js/premia.js        customised bid premia download (form, premia, Excel)
assets/js/main.js          data loading
assets/js/vendor/          supabase-js 2.45.4 (self-hosted)
supabase/functions/db-admin/index.ts   user-management edge function (deployed)
supabase/functions/deal-docs/index.ts  document upload edge function (deployed; resolve / list / sign + register / upload / delete)
supabase/functions/doc-text/          reads the documents' text for the word search (deployed; run / status / redo)
supabase/sql/2026-10-23_document_text_search.sql   tables, queue and search functions for the document word search
supabase/sql/2026-10-23_customised_bid_premia.sql  dividends / splits, adjusted close and db_premia_data for the customised bid premia
supabase/sql/2026-10-24_deal_index_cross_border.sql  db_deal_index carries the report's Cross Border field (not yet applied)
```

## Deal documents (how they get there)

`sync_database_documents.py` and `database_docs_config.json` (url + upload token) sit in the Claude docs folder on Phil's PC, next to `watch_and_upload.py`, which calls them:

* after every successful admin-site upload, for that deal folder;
* every 5 minutes for folders still waiting for their deal to reach the DataBase with a deal number (retried every 30 minutes for up to 45 days), and for folders where a document was added or changed;
* straight away for any folder with a new `_docs_ready.json` (forces a resend).

The deal is found from Claude.txt (Target Company + Date Announced + Bidder must all agree, so an older deal for the same target is never picked); a `_database_deal.txt` holding the 7-digit deal number overrides it. Each folder gets `_docs_synced.json` recording what was sent or why it is waiting. Files go straight to storage on a signed upload link, then are recorded in `deal_documents`. Only folders uploaded to the admin site from 23-10-2026 are picked up automatically; `python sync_database_documents.py --since YYYY-MM-DD` backfills older ones.

## Word search inside the documents

Nothing needs doing by hand: every document that reaches `deal_documents` (by the PC uploader or Claude) is read automatically.

* `deal_documents` inserts / replacements kick the `doc-text` edge function through `pg_net` (`doc_text_kick()`), and the pg_cron job `doc-text-sweep` kicks it every 2 minutes while anything is waiting. A replaced file is read again (its old text is deleted first).
* `doc-text` reads one chunk per call: PDFs page by page with pdf.js (as many pages as fit in about a second, so a 400-page annual report takes several calls inside the 2s CPU limit), Word files in parts of about 2,500 words, PowerPoint files slide by slide. Old .doc / .xls / .ppt and Excel files are skipped. Up to 3 documents are read at once, smallest first.
* The text goes into `deal_document_pages` (one row per page / part / slide, `english` full-text index, same as the report search). `deal_documents.text_status` shows `pending`, `done`, `no_text` (a scan with no text layer), `skipped` or `failed` (`text_error` says why).
* Searching: in a document each of *all these words* must appear somewhere in it and the *exact phrase* on one page; a document with an unwanted word is left out, and unwanted words in the deal's own report rule the deal out (as in the report search). Results list the deal's announcements and circulars before its accounts, with up to 7 matching pages each; PDFs open in a new tab at the page (`#page=N`).
* Checking / redoing (needs the `x-docs-token` header, the deal-docs upload token works): `GET …/functions/v1/doc-text?action=status`; `POST …/functions/v1/doc-text?action=redo&deal=0044819` (or `&id=<document id>`).

## Customised bid premia: conventions

* **Calendar days:** before the reference date the price is the last trading day on or before the date (as the recorded bid premia; QIAGEN's 1 day … 3 months and 30-day average premia on the announcement date reproduce the report figures exactly); after it, the first trading day on or after. Months are calendar months. **Trading days:** the nth trading day before / after (1 week = 5, 1 month = 21, 1 year = 252).
* **First day of rumours / approach:** the first trading day after the pre-bid speculation date (the last undisturbed close).
* **M&A Monitor adjusted close:** `share_prices.adj_close` where one has been imported (e.g. the old database's adjusted series); otherwise the close with every dividend in `price_adjustments` deducted from the prices before its ex-date and every split / consolidation applied to them (price ÷ ratio), as the admin site's Price Adjustment Tool did by hand. Dividends are stored per share in the share price's currency (pence for pence-quoted shares).
* **Offer price:** final = the last firm offer in the Offer Revisions path (UK & Irish offers), else the report's offer price; initial = the first firm offer / the report's initial offer; in force = the last firm offer on or before the reference date. Offers in £ against pence-quoted shares are converted; other currency mismatches give n/a with a note.
* **Competing bids:** with the announcement date as the reference, the prices before it are taken from the announcement of the first offer and the prices after it from the deal's own announcement (M&A Monitor convention, so the rival offers' premia compare; Elmera: Audax 25/06/2026, Fortum 29/06/2026). See `deal_premium_ref()` below.
* Each deal row has a Notes column saying why a figure is n/a (no prices yet, no pre-bid speculation date, no dividends entered, currency mismatch).

## Share prices (how they get there)

Morningstar downloads (.csv, as PyCharm saves them) dropped in `Claude docs\Share prices` on Phil's PC are sent by the same watcher module (the share price part of `sync_database_documents.py`) on every poll when new or changed, through the `deal-docs` function's `prices` action into `docs_load_prices()`: prices are stored by RIC (a file may hold several RICs), and each RIC is linked to every reported public deal whose target matches the file's Security Description (`price_name_core()`) and is pending / proposed, or was announced within the prices' dates, never replacing a link a deal already has. A file whose name starts with a deal number (`0044819 Qiagen.csv`) is linked to that deal instead. Price files kept elsewhere are listed under `price_files` in `database_docs_config.json` and sent from where they are: PyCharm's daily `C:\Users\phili\Downloads\WEEKLY SHARE PRICES.csv` (one day, ~250 RICs, also used for the old site) goes up whenever it changes, 100 RICs a call, and links to any pending deal whose target matches. Clients see the Share price tab once a deal has 20 days of prices (admins from the first day). `Share prices\_prices_synced.json` records what was sent and the deals each RIC is linked to; failures are retried after 30 minutes. Admins can still load a file by hand with the **Share prices** button on a deal.

## Deals, RICs and ISINs

DIANA's deals carry no RICs or ISINs. `deal_isins` holds each deal's target / bidder ISIN (loaded from Phil's pending-deals export, 24/10/2026); `price_link_deals()` links `deal_tickers` by any ISIN seen for a security (`price_security_isins`) when the names agree too (`name_similar()`, which catches the wrong ISINs in the source lists), then by the target's name. A security is a RIC in one currency for one company: a RIC already held for another currency or company is stored as `RIC~CCY` / `RIC~ISIN`, and a new RIC for a held ISIN / currency / company is added to that security. Morningstar per-deal downloads in `C:\Users\phili\Documents\PYTHON FILES` are sent by the watcher (`price_folders` in the config).

Company-stated premia: where a pending deal's report has no bid premia because the share prices cannot be used (licence: smaller Italian and Austrian stocks) or are not held, the pre-bid speculation date and premium are filled in `deals.fields` from the premium the parties state in the report's Bid premia commentary (premium to the last close / official price before the announcement), with the statement kept in the hidden `pdf_prebid_stated` field. A re-imported PDF keeps them (fields merge) unless it carries premia of its own. First done 24/10/2026 for PLC 0044294, TradeLab 0044529, Haiki+ 0044575, Pininfarina 0044701, Accent 0044352 and RAS Technology 0044822.

`deal_premium_ref(deal)`: the competing-bid reference dates. For a deal whose competitive status is "… Bidder Won", the rival offers are the reported deals for the same target (`price_name_core()`) with the same kind of status announced within 400 days; `pre_ref` (prices before the announcement) is the first offer's announcement date, `post_ref` the deal's own. Returned by `db_deal_prices` (`ref`, used by the Share price tab's Key prices, marked ‡, with the rival offers on the chart) and `db_premia_data` (`cref`). `deal_premium_refs` holds admin overrides (pre_ref / post_ref / note) for other cases.

`deal_price_addbacks`: dividends that form part of a deal's offer value (Iveco 0043276: €5.8216 ex 20/04/2026, TML's offer price falls by it) are added back to the target's closes from the ex-date on the Share price tab, marked * in Key prices, with the quoted close in the tooltip.

## One-time Supabase setting

Authentication › URL Configuration › Redirect URLs must include `https://database.ma-dealboard.co.uk` for the emailed sign-in and password-reset links to come back to this site.
