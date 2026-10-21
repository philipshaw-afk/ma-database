# M&A Monitor DataBase website

Live at **https://database.ma-dealboard.co.uk** (GitHub Pages, custom domain via `CNAME`).

A login-only client site built from the integrated-site mockup (`mamonitorintegratedsite_8_2_24.html`):

| Area | What it shows | Where the data comes from |
|---|---|---|
| **M&A DataBase › Home** | Pending public offers dashboard, deal lookup, your recently viewed / downloaded reports, recently added deals | `db_deal_index()`, `db_offer_events`, `db_activity` |
| **Search Form / Search Results** | Parties, deal parameters, values, financials, word search of the report text, offer-status and country-specific fields; CSV downloads | `db_deal_index()` (filtered in the browser), `db_word_search()` (full-text search on the server) |
| **Deal report** | New-format report: KPIs, offer status, transaction, key dates, valuation, advisers, financials, commentary, payment details, all fields; PDF download | `db_deal()`; PDFs from the private `deal-files` bucket (`exports/…`) via short-lived signed links |
| **Calendar** | Shareholder meetings, acceptance periods, regulatory dates, PUSU deadlines | `db_offer_events` |
| **ARB-Insight › Offer Statistics / Offer Revisions** | UK & Irish public offers since 2008 with live filters | `db_uk_offer_stats()` |
| **Users** (admins only) | Add client logins, reset passwords, enable/disable, usage; data import | `db_admin_members()`, edge function `db-admin`, `db_admin_import()` |

Deal reports are DIANA's own `deals` rows (reported, LIVE, with an exported PDF), so new reports appear on the site as soon as DIANA has them. The offer-status fields, calendar and UK offer statistics are loaded by an admin on the Users page from the mockup file.

## Logins and security

* Supabase Auth on DIANA's project. Users sign in with email + password (or an emailed sign-in link).
* Who may read: the DIANA team (`team_members`, lead/deputy are admins) plus anyone active in `db_members` (clients, or extra admins). Everything is enforced in the database: the tables have row-level security and the `db_*` functions check `db_can_read()` / `db_is_admin()`. Clients never read DIANA's internal tables directly.
* Clients can only fetch PDFs under `deal-files/exports/`, never card attachments.
* "Remember me" keeps the session in the browser; otherwise it ends with the browser session.
* Usage (report views, PDF downloads, CSV exports) is logged in `db_activity`.

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
assets/js/main.js          data loading
assets/js/vendor/          supabase-js 2.45.4 (self-hosted)
supabase/functions/db-admin/index.ts   user-management edge function (deployed)
```

## One-time Supabase setting

Authentication › URL Configuration › Redirect URLs must include `https://database.ma-dealboard.co.uk` for the emailed sign-in and password-reset links to come back to this site.
