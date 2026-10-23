/* M&A DataBase · Search Results: customised bid premia download (Excel).
   The offer price's premium over the target's share price at chosen periods before / after a chosen reference date,
   worked out in the browser from the share price history on the DataBase (db_premia_data) and the deal reports
   (db_export_rows). Replaces the old site's "Customised Bid Premia Table".

   Conventions
   - Calendar days: before the reference date the price is the last trading day on or before the date (as the
     recorded bid premia); after it, the first trading day on or after. Months are calendar months.
   - Trading days: the nth trading day before / after the reference date (1 week = 5, 1 month = 21, 1 year = 252).
   - The reference date's own price is the close on that day (or the last trading day before it).
   - M&A Monitor adjusted close: an imported adjusted close where there is one; otherwise the close with every
     dividend deducted from the prices before its ex-dividend date and every split / consolidation applied to them
     (price / ratio), as the admin site's Price Adjustment Tool.
   - Premium = offer price / share price - 1, in %. Offer prices in £ against pence-quoted shares are converted. */
(function () {
  "use strict";
  const MAM = window.MAM, { $, $$, esc } = MAM;
  const DAY = 864e5;
  const t0 = s => Date.parse(String(s).slice(0, 10) + "T00:00:00Z");
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const numv = v => { if (v == null || v === "") return null; const n = +String(v).replace(/,/g, ""); return isFinite(n) ? n : null; };
  const ccyNorm = c => { c = String(c || "").trim(); return /^(STG|GBP)$/i.test(c) ? "GBP" : /^(GBX|GBp)$/.test(c) ? "GBX" : c.toUpperCase(); };
  const ccyShow = c => { const n = ccyNorm(c); return n === "GBX" ? "GBp" : n; };
  // a date from a report field: ISO or dd/mm/yyyy
  const dateOf = v => { if (!v) return null; const s = String(v).trim(); let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0]; m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); return m ? m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0") : null; };
  const nfi = n => n.toLocaleString("en-GB");

  // period: [calendar amount, unit (d / m), label, trading days]
  const PER = { "1d": [1, "d", "1 day", 1], "1w": [7, "d", "1 week", 5], "2w": [14, "d", "2 weeks", 10], "3w": [21, "d", "3 weeks", 15], "4w": [28, "d", "4 weeks", 20],
    "2m": [2, "m", "2 months", 42], "3m": [3, "m", "3 months", 63], "6m": [6, "m", "6 months", 126], "1y": [12, "m", "1 year", 252], "2y": [24, "m", "2 years", 504] };
  const REF = { rumour: "First day of rumours / approach", ann: "Announcement date", comp: "Completion date", inc1: "First increased offer date",
    inc2: "Second increased offer date", inc3: "Third increased offer date", inc4: "Fourth increased offer date" };
  const REF_H = {
    rumour: "The first trading day after the pre-bid speculation date (the last undisturbed close), i.e. the first day of rumours or the approach. Deals without a pre-bid speculation date show n/a.",
    ann: "The day the offer (or possible offer) was announced.",
    comp: "The day the deal completed. Deals that have not completed show n/a.",
    inc: "From the Offer Revisions data, which covers UK and Irish offers; other deals and offers that were not increased that often show n/a."
  };
  const PX = { adj: "M&A Monitor adjusted close", close: "Close", open: "Open", high: "High", low: "Low", vwap: "VWAP" };
  const OFFER = { final: "Final offer", initial: "Initial offer", atref: "Offer in force at the reference date" };

  /* ------------------------------------------------------------------ the form */
  const dlg = $("#dlg-cp");
  if (!dlg) return;
  let rows = [], pass1 = null, pass1For = "";
  const radio = n => (dlg.querySelector('input[name="' + n + '"]:checked') || {}).value;
  const msg = (t, ok) => { const m = $("#cp-msg"); m.textContent = t || ""; m.hidden = !t; m.classList.toggle("err", !ok); m.classList.toggle("ok", !!ok); };
  function syncForm() {
    const daily = radio("cp-lay") === "daily", r = $("#cp-ref").value;
    $("#cp-show-f").hidden = daily; $("#cp-daily-f").hidden = !daily;
    $("#cp-zero").closest("label").hidden = daily; $("#cp-avg").closest("label").hidden = daily;
    $("#cp-ref-h").textContent = (REF_H[r] || REF_H.inc) + ($("#cp-px").value === "adj" ? " M&A Monitor adjusted close: dividends are deducted from the prices before each ex-dividend date and splits applied, as in the admin Price Adjustment Tool." : "") +
      (daily ? " The daily layout counts trading days." : "");
    const on = $$("#cp-cols input").filter(i => i.checked).length, all = $$("#cp-cols input").length;
    $("#cp-cols-n").textContent = "(" + on + " of " + all + ")";
  }
  dlg.addEventListener("change", e => {
    if (e.target.matches(".cp-cust .in")) return;
    syncForm(); msg("");
  });
  // typing a custom number ticks its box
  $$(".cp-cust .in", dlg).forEach(i => i.addEventListener("input", () => { const c = i.closest("label").querySelector('input[type="checkbox"]'); c.checked = +i.value > 0; msg(""); }));
  $$(".cp-cust .in", dlg).forEach(i => i.addEventListener("click", e => e.preventDefault()));   // clicking the number does not untick the box
  $("#cp-close").addEventListener("click", () => dlg.close());

  function readForm() {
    const td = radio("cp-days") === "td";
    const side = id => $$("#cp-" + id + ' input[type="checkbox"]').filter(i => i.checked).map(i => {
      if (i.value !== "custom") { const p = PER[i.value]; return { key: i.value, n: p[0], unit: p[1], label: p[2], tdN: p[3] }; }
      const n = parseInt($("#cp-" + id + "-n").value, 10);
      return n > 0 ? { key: "c" + n, n, unit: "d", label: n + " day" + (n === 1 ? "" : "s"), tdN: n } : null;
    }).filter(Boolean);
    const lo = numv($("#cp-lo").value), hi = numv($("#cp-hi").value);
    return { ref: $("#cp-ref").value, px: $("#cp-px").value, offer: $("#cp-offer").value, td, before: side("before"), after: side("after"),
      zero: $("#cp-zero").checked, avg: $("#cp-avg").checked, avgN: Math.max(2, Math.min(260, parseInt($("#cp-avg-n").value, 10) || 30)),
      layout: radio("cp-lay"), show: radio("cp-show"), dv: radio("cp-dv"), lo, hi, range: lo != null || hi != null,
      cols: MAM.premiaDealCols.filter(c => { const i = $('#cp-cols input[data-k="' + c.key + '"]'); return !i || i.checked; }) };
  }

  MAM.premia = {
    open(sel) {
      rows = sel.filter(d => d.has_report);
      if (!$("#cp-cols").children.length) $("#cp-cols").innerHTML = MAM.premiaDealCols.map(c => '<label><input type="checkbox" data-k="' + c.key + '" checked> ' + esc(c.key === "no" ? "Deal No." : c.label) + "</label>").join("");
      $("#cp-n").textContent = nfi(rows.length) + " selected deal" + (rows.length === 1 ? "" : "s") + (rows.length < sel.length ? " with a deal report" : "") + ". Checking which have share prices on the DataBase…";
      $("#cp-go").disabled = !rows.length; msg(""); syncForm();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      // how many of them have share prices yet
      const key = rows.map(d => d.deal_no).join(",");
      (pass1For === key && pass1 ? Promise.resolve(pass1) : fetchPass1(rows.map(d => d.deal_no)).then(p => { pass1 = p; pass1For = key; return p; }))
        .then(p => {
          const n = rows.filter(d => p[d.deal_no] && p[d.deal_no].ric).length;
          $("#cp-n").textContent = nfi(rows.length) + " selected deal" + (rows.length === 1 ? "" : "s") + (rows.length < sel.length ? " with a deal report" : "") + ". " +
            (n === rows.length ? "All of them have share prices on the DataBase." : n ? "Share prices are on the DataBase for " + nfi(n) + " of them so far; the others will show n/a." : "None of them has share prices on the DataBase yet, so the premia will show n/a.");
        }, e => { $("#cp-n").textContent = nfi(rows.length) + " selected deals. (Could not check the share prices: " + (e.message || e) + ")"; });
    }
  };

  /* ------------------------------------------------------------------ data */
  const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
  async function fetchPass1(nos) {
    const out = {};
    for (const c of chunks(nos, 400)) {
      const { data, error } = await MAM.sb.rpc("db_premia_data", { p_req: c.map(n => ({ n })) });
      if (error) throw new Error(/db_premia_data/.test(error.message) ? "the download needs a database update that has not been run yet" : error.message);
      Object.assign(out, data || {});
    }
    return out;
  }
  const addMonths = (t, m) => { const d = new Date(t), y = d.getUTCFullYear(), mo = d.getUTCMonth() + m, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return Date.UTC(y, mo, Math.min(day, last)); };
  const span = (p, td) => td ? Math.ceil(p.tdN * 1.5) + 10 : p.unit === "m" ? p.n * 31 + 3 : p.n;

  // the reference date for one deal (iso), given its share prices S when known
  function refDate(o, x, pd, S) {
    const f = x.f || {}, kd = x.kd || {};
    if (o.ref === "ann") return dateOf(x.da || f["Date announced"]);
    if (o.ref === "comp") return dateOf(kd.completed || f["Date completed"]);
    if (o.ref === "rumour") {
      const pre = dateOf(f["Pre-bid speculation date"] || kd.pre_bid_speculation); if (!pre) return null;
      const p = t0(pre);
      if (S && S.length) { const i = firstAfter(S, p); if (i >= 0) return S[i].d; }
      let t = p + DAY; while ([0, 6].includes(new Date(t).getUTCDay())) t += DAY;
      return iso(t);
    }
    const k = +o.ref.slice(3), fo = firmOffers(pd);
    return fo[k] ? fo[k][0] : null;
  }
  const firmOffers = pd => ((pd && pd.path && pd.path.f) || []).filter(e => e && e[0] && numv(e[1]) != null).slice().sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

  // the offer price per share (in the deal's offer currency)
  function offerFor(o, x, d, pd, R) {
    const fo = firmOffers(pd), rep = numv(d.offer_price), ini = numv((x.f || {}).pdf_offer_initial);
    if (o.offer === "initial") return fo.length ? +fo[0][1] : ini != null ? ini : rep;
    if (o.offer === "atref" && fo.length && R != null) { let cur = fo[0]; fo.forEach(e => { if (t0(e[0]) <= R) cur = e; }); return +cur[1]; }
    if (fo.length && numv(pd.path.fin) != null) return +pd.path.fin;
    return rep != null ? rep : ini;
  }

  // the chosen price series: [{d, t, v, zero}] (zero = quoted but no volume traded)
  function series(pd, px) {
    const ev = (pd.adj || []).map(a => ({ t: t0(a[0]), kind: a[1], amount: numv(a[2]), ratio: numv(a[3]) }))
      .filter(e => e.kind === "dividend" ? e.amount > 0 : e.ratio > 0).sort((a, b) => a.t - b.t);
    const out = [];
    for (const r of pd.rows || []) {
      const t = t0(r[0]), close = numv(r[1]), vol = numv(r[5]);
      let v;
      if (px === "adj") {
        v = numv(r[7]);
        if (v == null && close != null) { v = close; for (const e of ev) if (e.t > t) { if (e.kind === "dividend") v -= e.amount; else v /= e.ratio; } }
      } else v = numv(r[{ close: 1, open: 2, high: 3, low: 4, vwap: 6 }[px]]);
      if (v != null && isFinite(v) && v > 0) out.push({ d: String(r[0]).slice(0, 10), t, v, zero: vol === 0 });
    }
    return out;
  }
  // index helpers on a series sorted by date
  const lastOnOrBefore = (S, t) => { let lo = 0, hi = S.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S[m].t <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; };
  const lastBefore = (S, t) => lastOnOrBefore(S, t - 1);
  const firstOnOrAfter = (S, t) => { let lo = 0, hi = S.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S[m].t >= t) { k = m; hi = m - 1; } else lo = m + 1; } return k; };
  const firstAfter = (S, t) => firstOnOrAfter(S, t + 1);

  // offer currency vs share price currency: the factor that puts share prices into the offer's units
  function unitFactor(oc, pc, offer, sample) {
    oc = ccyNorm(oc); pc = ccyNorm(pc);
    if (oc === "GBP" && pc === "GBX") return { k: 0.01 };
    if (oc === "GBX" && pc === "GBP") return { k: 100 };
    if (!oc || !pc || oc === pc) {
      // a pence-quoted share labelled GBP against an offer in £ (prices about 100 times the offer)
      if ((oc === "GBP" || !oc) && offer && sample && sample / offer > 25 && sample / offer < 400) return { k: 0.01, note: "share prices taken as pence" };
      return { k: 1 };
    }
    return { k: null, note: "offer in " + oc + ", share price in " + pc + ": no premia" };
  }

  /* ------------------------------------------------------------------ the premia for one deal */
  function points(o) {
    const pre = (p, after) => o.td ? p.tdN + " trading day" + (p.tdN === 1 ? "" : "s") + (p.key[0] === "c" || p.tdN === 1 ? "" : " (" + p.label + ")") + (after ? " after" : " before") : p.label + (after ? " after" : " before");
    const pts = [];
    if (o.zero) pts.push({ kind: "zero", label: "Reference date" });
    o.before.slice().sort((a, b) => span(a, o.td) - span(b, o.td)).forEach(p => pts.push({ kind: "before", p, label: pre(p, false) }));
    if (o.avg) pts.push({ kind: "avg", label: o.avgN + "-trading-day average before" });
    o.after.slice().sort((a, b) => span(a, o.td) - span(b, o.td)).forEach(p => pts.push({ kind: "after", p, label: pre(p, true) }));
    return pts;
  }
  function pick(S, R, pt, o) {
    if (pt.kind === "zero") { const i = lastOnOrBefore(S, R); return i >= 0 ? S[i] : null; }
    if (pt.kind === "avg") { const j = lastBefore(S, R); if (j + 1 < o.avgN) return null; const w = S.slice(j + 1 - o.avgN, j + 1); return { d: w[0].d + "|" + w[w.length - 1].d, v: w.reduce((s, r) => s + r.v, 0) / w.length, avg: true }; }
    const p = pt.p;
    if (pt.kind === "before") {
      if (o.td) { const j = lastBefore(S, R) - (p.tdN - 1); return j >= 0 ? S[j] : null; }
      const i = lastOnOrBefore(S, p.unit === "m" ? addMonths(R, -p.n) : R - p.n * DAY); return i >= 0 ? S[i] : null;
    }
    if (o.td) { const j0 = firstAfter(S, R); const j = j0 < 0 ? -1 : j0 + p.tdN - 1; return j >= 0 && j < S.length ? S[j] : null; }
    const i = firstOnOrAfter(S, p.unit === "m" ? addMonths(R, p.n) : R + p.n * DAY); return i >= 0 ? S[i] : null;
  }

  /* ------------------------------------------------------------------ build the download */
  $("#cp-go").addEventListener("click", async () => {
    const o = readForm();
    if (o.layout === "points" && !o.zero && !o.avg && !o.before.length && !o.after.length) { msg("Tick at least one period."); return; }
    if (o.layout === "daily" && !o.before.length && !o.after.length) { msg("Tick a period before and / or after the reference date to set the window."); return; }
    const B = o.layout === "daily" ? Math.max(0, ...o.before.map(p => p.tdN)) : 0, A = o.layout === "daily" ? Math.max(0, ...o.after.map(p => p.tdN)) : 0;
    if (B + A > 1100) { msg("The daily window is too long (" + nfi(B + A) + " trading days): choose shorter periods."); return; }
    const btn = $("#cp-go"), lab = btn.innerHTML; btn.disabled = true; msg("");
    const step = t => { btn.textContent = t; };
    try {
      const nos = rows.map(d => d.deal_no);
      step("Reading the deals…");
      const ex = await MAM.sb.rpc("db_export_rows", { p_numbers: nos });
      if (ex.error) throw new Error(ex.error.message);
      const X = {}; (ex.data || []).forEach(x => { x.f = x.f || {}; x.kd = x.kd || {}; X[x.n] = x; });
      const P = pass1 && pass1For === nos.join(",") ? pass1 : await fetchPass1(nos);
      // the window each deal needs
      const need = [];
      nos.forEach(n => {
        const x = X[n], pd = P[n]; if (!x || !pd || !pd.ric) return;
        const ref = refDate(o, x, pd, null); if (!ref) return;
        const R = t0(ref);
        let back = Math.max(0, ...o.before.map(p => span(p, o.td || o.layout === "daily")), o.avg ? Math.ceil(o.avgN * 1.5) + 10 : 0);
        let fwd = Math.max(0, ...o.after.map(p => span(p, o.td || o.layout === "daily")));
        need.push({ n, from: iso(R - (back + 14) * DAY), to: iso(R + (fwd + 14) * DAY) });
      });
      const per = Math.max(...need.map(q => (t0(q.to) - t0(q.from)) / DAY), 1) > 400 ? 60 : 200;
      const parts = chunks(need, per);
      for (let i = 0; i < parts.length; i++) {
        step("Fetching share prices… " + Math.round(i / parts.length * 100) + "%");
        const { data, error } = await MAM.sb.rpc("db_premia_data", { p_req: parts[i] });
        if (error) throw new Error(error.message);
        Object.keys(data || {}).forEach(n => { P[n] = data[n]; });
      }
      step("Working out the premia…");
      const out = build(o, nos.map(n => ({ n, x: X[n], d: MAM.byNo[n] || {}, pd: P[n] || {} })).filter(r => r.x), B, A);
      step("Writing the spreadsheet…");
      await writeXlsx(out, o, "customised_bid_premia_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".xlsx");
      dlg.close();
    } catch (e) { msg("Could not make the spreadsheet: " + (e.message || e) + "."); }
    finally { btn.disabled = false; btn.innerHTML = lab; }
  });

  // -> { head: [{h, fmt, w, prem}], rows: [[{v, fmt, color}]] }
  function build(o, list, B, A) {
    const pts = points(o), cols = o.cols;
    const head = cols.map(c => ({ h: c.key === "no" ? "Deal No." : c.label, fmt: c.fmt, w: 20 }));
    head.push({ h: "Reference date (" + REF[o.ref] + ")", fmt: "d", w: 14 }, { h: "Offer price used (" + OFFER[o.offer].toLowerCase() + ")", fmt: "px", w: 13 },
      { h: "Offer currency", fmt: "t", w: 9 }, { h: "Share price: RIC", fmt: "t", w: 11 }, { h: "Share price currency", fmt: "t", w: 9 });
    if (o.layout === "points") {
      pts.forEach(pt => {
        if (o.show === "all") head.push({ h: pt.label + ": date", fmt: pt.kind === "avg" ? "t" : "d", w: pt.kind === "avg" ? 22 : 12 }, { h: pt.label + ": share price", fmt: "px", w: 12 });
        head.push({ h: pt.label + ": premium %", fmt: "p", w: 12, prem: true });
      });
    } else {
      for (let k = -B; k <= A; k++) head.push({ h: (k > 0 ? "+" : k < 0 ? "−" : "") + Math.abs(k) + " td" + (o.dv === "prem" ? " premium %" : " share price"), fmt: o.dv === "prem" ? "p" : "px", w: 10, prem: o.dv === "prem" });
    }
    if (o.range) head.push({ h: "All premia within the range", fmt: "t", w: 12 });
    head.push({ h: "Notes", fmt: "t", w: 40 });

    const out = list.map(({ n, x, d, pd }) => {
      const cells = cols.map(c => ({ v: c.get(x), fmt: c.fmt }));
      const notes = [];
      const S = pd.ric ? series(pd, o.px) : [];
      const ref = refDate(o, x, pd, S), R = ref ? t0(ref) : null;
      const offer = offerFor(o, x, d, pd, R);
      const oc = d.offer_currency || d.currency || "";
      if (!pd.ric) notes.push("no share prices on the DataBase yet");
      else if (!S.length) notes.push("no " + PX[o.px].toLowerCase() + " prices in the window");
      if (!ref) notes.push("no " + REF[o.ref].toLowerCase());
      if (offer == null) notes.push("no offer price per share");
      if (pd.ric && o.px === "adj" && !(pd.adj || []).length && !(pd.rows || []).some(r => r[7] != null)) notes.push("no dividends or splits entered (adjusted = close)");
      const sample = R != null && S.length ? (S[Math.max(0, lastOnOrBefore(S, R))] || {}).v : null;
      const u = unitFactor(oc, pd.ccy, offer, sample);
      if (u.note) notes.push(u.note);
      const ok = R != null && offer != null && u.k != null && S.length;
      const prem = r => ok && r ? (offer / (r.v * u.k) - 1) * 100 : null;
      const inR = v => v == null || ((o.lo == null || v >= o.lo) && (o.hi == null || v <= o.hi));
      let all = null;
      const mark = (v, zero) => { const outR = o.range && v != null && !inR(v); if (v != null && o.range) all = all === false ? false : !outR; return outR ? "red" : zero ? "blue" : null; };
      cells.push({ v: ref, fmt: "d" }, { v: offer, fmt: "px" }, { v: ccyShow(oc) || "", fmt: "t" }, { v: pd.ric || "", fmt: "t" },
        { v: pd.ric ? (u.k === 0.01 && ccyNorm(pd.ccy) !== "GBX" ? "GBp" : ccyShow(pd.ccy)) : "", fmt: "t" });
      if (o.layout === "points") {
        pts.forEach(pt => {
          const r = ok ? pick(S, R, pt, o) : null, v = prem(r), col = mark(v, r && r.zero);
          if (o.show === "all") {
            cells.push(r && r.avg ? { v: MAM.isoToUk(r.d.split("|")[0]) + " – " + MAM.isoToUk(r.d.split("|")[1]), fmt: "t" } : { v: r ? r.d : null, fmt: "d", na: ok });
            cells.push({ v: r ? r.v : null, fmt: "px", color: r && r.zero ? "blue" : null, na: ok });
          }
          cells.push({ v, fmt: "p", color: col, na: true, prem: true });
        });
      } else {
        const jb = ok ? lastBefore(S, R) : -1, j0 = ok ? lastOnOrBefore(S, R) : -1, ja = ok ? firstAfter(S, R) : -1;
        for (let k = -B; k <= A; k++) {
          const j = k < 0 ? (jb >= 0 ? jb + k + 1 : -1) : k === 0 ? j0 : (ja >= 0 ? ja + k - 1 : -1);
          const r = ok && j >= 0 && j < S.length ? S[j] : null;
          if (o.dv === "prem") { const v = prem(r); cells.push({ v, fmt: "p", color: mark(v, r && r.zero), na: true, prem: true }); }
          else cells.push({ v: r ? r.v : null, fmt: "px", color: r && r.zero ? "blue" : null, na: true });
        }
      }
      if (o.range) cells.push({ v: all == null ? "" : all ? "Yes" : "No", fmt: "t" });
      cells.push({ v: notes.length ? notes.join("; ").replace(/^./, c => c.toUpperCase()) : "", fmt: "t" });
      return cells;
    });
    return { head, rows: out, pts };
  }

  /* ------------------------------------------------------------------ the spreadsheet (old site's layout: grey band, blue header, Arial 8) */
  const isoD = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || "")); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3])) : null; };
  const quant = (a, p) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  async function writeXlsx(T, o, name) {
    const XL = await MAM.loadExcel();
    const wb = new XL.Workbook(); wb.creator = "M&A Monitor"; wb.created = new Date();
    const H = 10, n = T.head.length;
    const ws = wb.addWorksheet("Sheet 1", { views: [{ state: "frozen", ySplit: H, xSplit: 1 }] });
    const F = (sz, b, color) => ({ name: "Arial", family: 2, size: sz, bold: !!b, color: { argb: color || "FF000000" } });
    const grey = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };
    ws.columns = T.head.map(c => ({ width: c.w }));
    const now = new Date(), p2 = v => String(v).padStart(2, "0");
    const lo = o.lo != null ? o.lo + "%" : "…", hi = o.hi != null ? o.hi + "%" : "…";
    const band = ["M&A Monitor", "", "Description : Customised Bid Premia Table",
      "Date : " + p2(now.getDate()) + "/" + p2(now.getMonth() + 1) + "/" + now.getFullYear() + " " + p2(now.getHours()) + ":" + p2(now.getMinutes()),
      "Reference date: " + REF[o.ref] + " · Share price: " + PX[o.px] + " · Offer price: " + OFFER[o.offer] + " · Periods counted in " + (o.td || o.layout === "daily" ? "trading days" : "calendar days"),
      "Premium = offer price ÷ share price − 1, in %. " + (o.td || o.layout === "daily" ? "The nth trading day before / after the reference date." : "Before the reference date: the last trading day on or before the date; after it: the first trading day on or after."),
      "Figures presented in blue are for quoted share price but no volume traded." + (o.range ? " Figures presented in red indicate premia outside the range requested (" + lo + " to " + hi + ")." : ""),
      "Total Equity Value and Enterprise Value in £ million; offer and share prices per share in the currencies shown (GBp = pence; pence prices are converted to £ for the premia against offers in £)."];
    for (let i = 0; i < H - 1; i++) {
      const r = ws.getRow(i + 1); r.height = 18;
      for (let c = 1; c <= Math.max(n, 6); c++) { const cell = r.getCell(c); cell.fill = grey; cell.font = F(8); }
      if (band[i] != null) { ws.mergeCells(i + 1, 1, i + 1, Math.min(Math.max(n, 6), 12)); const a = r.getCell(1); a.value = band[i] || null;
        a.font = i === 0 ? F(12, true, "FF0066CC") : i < 4 ? F(10, true) : F(8); }
    }
    const hd = ws.getRow(H); hd.height = 60;
    T.head.forEach((c, i) => { const cell = hd.getCell(i + 1); cell.value = c.h; cell.font = F(8, true, "FFFFFFF7");
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0066CC" } }; cell.alignment = { vertical: "bottom", wrapText: true };
      cell.border = { bottom: { style: "double", color: { argb: "FF000000" } } }; });
    const COL = { red: "FFFF0000", blue: "FF0000FF" }, FMT = { m: "0.000", x: "0.00", p: "0.00", px: "#,##0.00##" };
    const put = (cell, c) => {
      cell.font = F(8, false, c.color ? COL[c.color] : null); cell.alignment = { wrapText: true, vertical: "top" };
      const raw = c.v;
      if (raw == null || raw === "") { if (c.na) { cell.value = "n/a"; cell.alignment = { horizontal: "right", vertical: "top" }; } return; }
      if (c.fmt === "d") { const d = isoD(dateOf(raw)); cell.value = d || String(raw); if (d) cell.numFmt = "dd/mm/yyyy"; return; }
      if (FMT[c.fmt]) { const v = typeof raw === "number" ? raw : numv(raw); if (v == null) cell.value = String(raw).trim(); else { cell.value = v; cell.numFmt = FMT[c.fmt]; } return; }
      cell.value = String(raw).trim();
    };
    T.rows.forEach((vals, ri) => { const r = ws.getRow(H + 1 + ri); vals.forEach((c, i) => put(r.getCell(i + 1), c)); });
    // mean / median / number of deals for each premium column
    const prem = T.head.map((c, i) => c.prem ? i : -1).filter(i => i >= 0);
    if (T.rows.length && prem.length) {
      const base = H + 2 + T.rows.length;
      [["Mean", a => a.reduce((s, v) => s + v, 0) / a.length, "0.00"], ["Median", a => quant(a, 0.5), "0.00"], ["Number of deals", a => a.length, "0"]].forEach(([lab, fn, fmt], k) => {
        const r = ws.getRow(base + k); const a = r.getCell(1); a.value = lab; a.font = F(8, true);
        prem.forEach(i => { const v = T.rows.map(row => row[i].v).filter(x => typeof x === "number" && isFinite(x)); const cell = r.getCell(i + 1);
          cell.font = F(8, true); if (v.length) { cell.value = fn(v); cell.numFmt = fmt; } });
        if (k === 0) for (let c = 1; c <= n; c++) r.getCell(c).border = { top: { style: "thin", color: { argb: "FF000000" } } };
      });
    }
    ws.autoFilter = { from: { row: H, column: 1 }, to: { row: H, column: n } };
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // for checking the sums (browser console / tests)
  MAM.premia._test = { series, pick, points, refDate, offerFor, unitFactor, build, readForm };
})();
