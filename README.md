# M&A Monitor DataBase website

Live at **https://database.ma-dealboard.co.uk** (GitHub Pages, custom domain via `CNAME`).

A login-only client site built from the integrated-site mockup (`mamonitorintegratedsite_8_2_24.html`):

| Area | What it shows | Where the data comes from |
|---|---|---|
| **M&A DataBase › Home** | Pending public offers dashboard, deal lookup, your recently viewed / downloaded reports, recently added deals | `db_deal_index()`, `db_offer_events`, `db_activity` |
| **Search Form / Search Results** | Parties, deal parameters, values, financials, word search of the report text, offer-status and country-specific fields; CSV downloads | `db_deal_index()` (filtered in the browser), `db_word_search()` (full-text search on the server) |
| **Deal report** | New-format report: KPIs, offer status, transaction, key dates, valuation, advisers, financials, commentary, payment details, all fields; PDF download | `db_deal()`; PDFs from the private `deal-files` bucket (`exports/…`) via short-lived signed links |
| **Documents** (tab on each deal report) | The deal's source documents grouped as Press releases / Circulars / Accounts / Other, with date (period end for accounts), size, open (PDFs in a new tab) and download; tab only shows when a deal has documents | `db_deal_documents()`; files in the private `deal-files` bucket under `docs/<deal number>/…` via short-lived signed links; put there by the `deal-docs` edge function (PC uploader / Claude) |
| **Share price** (tab on each deal report) | The target's daily close (1Y default; 3M–All), with the offer price, announcement and pre-bid speculation dates; hover/arrow-key readout with the offer premium; Key prices table (latest, 1 day … 3 months before, 30-day average, pre-bid speculation, 52-week high/low) using the same conventions as the recorded bid premia; tab only shows when the deal has prices. Admins load a Morningstar download (CSV, one RIC) with the **Share prices** button in the report header | `db_deal_prices()`, `db_admin_load_prices()`; tables `share_prices` (by RIC and date), `price_securities`, `deal_tickers` (deal → RIC) |
| **Calendar** | Shareholder meetings, acceptance periods, regulatory dates, PUSU deadlines | `db_offer_events` |
| **ARB-Insight › Offer Statistics / Offer Revisions** | UK & Irish public offers since 2008 with live filters; tick boxes on the deal list (unticked deals leave every figure), Exclude outliers (Tukey 1.5×IQR per measure), word search of the write-ups, listed share element slider and domestic/overseas paper (shown once consideration terms are loaded), Excel workbook of every box and the offers behind it | `db_uk_offer_stats()`, `db_word_search()` |
| **Follow deals** | Follow button on each deal report; bell in the header with a pop-up of report updates on the deals you follow (pops up by itself when something is new); "Deals you follow" card on Home | `db_follow()`, `db_my_follows()`, `db_follows_seen()`; updates come from `db_deal_updates`, which trigger `cards_db_deal_update` fills when a DIANA update card is verified with the updated report PDF attached (the card title, without the company prefix, is the headline clients see) |
| **Users** (admins only) | Add client logins, reset passwords, enable/disable, usage; data import | `db_admin_members()`, edge function `db-admin`, `db_admin_import()` |

Deal reports are DIANA's own `deals` rows (reported, LIVE, with an exported PDF), so new reports appear on the site as soon as DIANA has them. The offer-status fields, calendar and UK offer statistics are loaded by an admin on the Users page from the mockup file.

**Currencies:** the deal value (`deals.value`) is in the deal's currency, but the database's value and financial fields (Implied Total Equity Value, Enterprise Value, Net debt, Turnover, EBITDA and so on in `deals.fields`) are in **sterling**, converted from the deal's currency. The site shows the headline equity / deal value in the deal's currency and labels every other figure £m; search filters and CSVs convert from sterling for those fields.

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
assets/js/main.js          data loading
assets/js/vendor/          supabase-js 2.45.4 (self-hosted)
supabase/functions/db-admin/index.ts   user-management edge function (deployed)
supabase/functions/deal-docs/index.ts  document upload edge function (deployed; resolve / list / sign + register / upload / delete)
```

## Deal documents (how they get there)

`sync_database_documents.py` and `database_docs_config.json` (url + upload token) sit in the Claude docs folder on Phil's PC, next to `watch_and_upload.py`, which calls them:

* after every successful admin-site upload, for that deal folder;
* every 5 minutes for folders still waiting for their deal to reach the DataBase with a deal number (retried every 30 minutes for up to 45 days), and for folders where a document was added or changed;
* straight away for any folder with a new `_docs_ready.json` (forces a resend).

The deal is found from Claude.txt (Target Company + Date Announced + Bidder must all agree, so an older deal for the same target is never picked); a `_database_deal.txt` holding the 7-digit deal number overrides it. Each folder gets `_docs_synced.json` recording what was sent or why it is waiting. Files go straight to storage on a signed upload link, then are recorded in `deal_documents`. Only folders uploaded to the admin site from 23-10-2026 are picked up automatically; `python sync_database_documents.py --since YYYY-MM-DD` backfills older ones.

## One-time Supabase setting

Authentication › URL Configuration › Redirect URLs must include `https://database.ma-dealboard.co.uk` for the emailed sign-in and password-reset links to come back to this site.
