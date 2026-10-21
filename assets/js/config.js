/* Supabase project (DIANA's project). The publishable key is safe to ship in a web page:
   every table and function behind it is protected by row-level security and login checks. */
window.MAM_CONFIG = {
  supabaseUrl: "https://awpbhcyhfgsznmrqiddv.supabase.co",
  supabaseKey: "sb_publishable_wci9xM67qfl-jdIy7e9T2Q_fKALWRdF",
  pdfBucket: "deal-files",
  /* approximate exchange rates per £1, used only to compare values in different currencies in the search */
  fxPerGbp: { GBP: 1, STG: 1, EUR: 1.15, USD: 1.34, SEK: 14.6, NOK: 14.9, CHF: 1.07, PLN: 4.9, DKK: 8.6, AUD: 2.05,
    BRL: 7.3, INR: 115, CAD: 1.85, RUB: 108, SGD: 1.73, TRY: 52, NZD: 2.3, MYR: 5.8, PKR: 375, KRW: 1850, NGN: 2050,
    KES: 173, SAR: 5.0, ZAR: 24, NIS: 4.5, ILS: 4.5, JPY: 198, OMR: 0.52, HKD: 10.4, CNY: 9.6 }
};
