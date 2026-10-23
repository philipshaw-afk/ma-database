/* M&A DataBase · deal report: Share price tab (target's daily close from the Morningstar download, by RIC)
   and the admins' "Share prices" loader. Used by report.js. */
(function () {
  "use strict";
  const MAM = window.MAM, { esc, nf } = MAM;
  const SYM = { EUR: "€", GBP: "£", STG: "£", USD: "US$", GBX: "", GBp: "" };
  const DAY = 86400000;
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const t0 = s => Date.parse(String(s).slice(0, 10) + "T00:00:00Z");
  const uk = s => MAM.isoToUk(s);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ccyNorm = c => { c = String(c || "").trim(); return /^(STG|GBP)$/i.test(c) ? "GBP" : /^(GBX|GBp)$/.test(c) ? "GBX" : c.toUpperCase(); };
  const money = (v, c) => { c = ccyNorm(c); if (v == null || !isFinite(v)) return "—"; if (c === "GBX") return nf(v, v < 100 ? 2 : 1) + "p"; const s = SYM[c]; return (s != null ? s : c + " ") + nf(v, 2); };
  const pctS = v => v == null || !isFinite(v) ? "—" : (v >= 0 ? "+" : "") + nf(v, 1) + "%";

  /* ------------------------------------------------------------------ the card */
  // prices = { ric, isin, name, currency, source, rows: [[iso, close], ...] }, deal = DIANA deal row (db_deal)
  function model(deal, f, prices) {
    const rows = (prices.rows || []).map(r => ({ t: t0(r[0]), d: String(r[0]).slice(0, 10), c: +r[1] })).filter(r => isFinite(r.c) && r.c > 0);
    const ann = deal.date_announced ? t0(deal.date_announced) : null;
    const pre = f["Pre-bid speculation date"] || (deal.key_dates || {}).pre_bid_speculation || null;
    const pc = ccyNorm(prices.currency), oc = ccyNorm(deal.offer_currency || deal.currency);
    // the offer price is only compared with prices quoted in the same currency
    const offer = deal.offer_price != null && +deal.offer_price > 0 && (!oc || oc === pc) ? +deal.offer_price : null;
    return { rows, ann, pre: pre ? t0(pre) : null, offer, ccy: prices.currency };
  }
  // last close on or before t
  const at = (rows, t) => { let lo = 0, hi = rows.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].t <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k >= 0 ? rows[k] : null; };
  // the same measures, dates and conventions as the database's recorded bid premia
  function keyRows(m) {
    const out = [], prem = c => m.offer && c ? (m.offer / c - 1) * 100 : null;
    const last = m.rows[m.rows.length - 1];
    if (last) out.push(["Latest close", last, prem(last.c)]);
    if (m.ann) {
      const add = (lab, t) => { const r = at(m.rows, t); if (r) out.push([lab, r, prem(r.c)]); };
      const months = k => { const d = new Date(m.ann); d.setUTCMonth(d.getUTCMonth() - k); return +d; };
      add("1 day before announcement", m.ann - DAY);
      add("1 week before", m.ann - 7 * DAY);
      add("2 weeks before", m.ann - 14 * DAY);
      add("3 weeks before", m.ann - 21 * DAY);
      add("4 weeks before", m.ann - 28 * DAY);
      add("2 months before", months(2));
      add("3 months before", months(3));
      // average close of the 30 trading days before the announcement
      const win = m.rows.filter(r => r.t < m.ann).slice(-30);
      if (win.length === 30) { const avg = win.reduce((s, r) => s + r.c, 0) / 30; out.push(["30-day average before", { d: null, c: avg }, prem(avg)]); }
    }
    // the pre-bid speculation date is the last undisturbed close
    if (m.pre) { const r = at(m.rows, m.pre); if (r) out.push(["Pre-bid speculation", r, prem(r.c)]); }
    if (m.ann) {
      const yr = m.rows.filter(r => r.t < m.ann && r.t >= m.ann - 365 * DAY);
      if (yr.length > 20) {
        const hi = yr.reduce((a, r) => r.c > a.c ? r : a), lo = yr.reduce((a, r) => r.c < a.c ? r : a);
        out.push(["52-week high before", hi, prem(hi.c)], ["52-week low before", lo, prem(lo.c)]);
      }
    }
    return out;
  }
  function card(deal, f, prices) {
    const m = model(deal, f, prices);
    if (!m.rows.length) return "";
    const first = m.rows[0], last = m.rows[m.rows.length - 1];
    const sub = esc(prices.name || deal.target) + " · RIC " + esc(prices.ric) + " · " + esc(ccyNorm(prices.currency) || "") + " · daily close " + uk(first.d) + "–" + uk(last.d);
    const ranges = [["3M", 91], ["6M", 182], ["1Y", 365], ["2Y", 730], ["5Y", 1826], ["All", 0]].filter(r => !r[1] || last.t - first.t > r[1] * DAY * 0.5);
    const def = ranges.some(r => r[0] === "1Y") ? "1Y" : ranges[ranges.length - 1][0];
    const seg = '<div class="seg pr-rng" role="radiogroup" aria-label="Chart period">' + ranges.map(r => '<label><input type="radio" name="pr-rng" value="' + r[1] + '"' + (r[0] === def ? " checked" : "") + "><span>" + r[0] + "</span></label>").join("") + "</div>";
    const key = keyRows(m);
    const tbl = '<table class="t pr-key"><thead><tr><th>Close</th><th>Date</th><th class="r">Price</th>' + (m.offer ? '<th class="r">Offer premium</th>' : "") + "</tr></thead><tbody>" +
      key.map(k => "<tr><td>" + esc(k[0]) + (k[1].d ? '<small class="pr-dm">' + uk(k[1].d) + "</small>" : "") + '</td><td class="dt">' + (k[1].d ? uk(k[1].d) : "") + '</td><td class="n">' + money(k[1].c, m.ccy) + "</td>" + (m.offer ? '<td class="n' + (k[2] != null && k[2] < 0 ? " dn" : "") + '">' + pctS(k[2]) + "</td>" : "") + "</tr>").join("") + "</tbody></table>";
    const note = (m.offer ? "Offer premium = the offer price of " + money(m.offer, m.ccy) + " over each close (for the latest close, the gap still to the offer). " : "") + "Prices: " + esc(prices.source || "Morningstar") + ", RIC " + esc(prices.ric) + ".";
    const facts = [["Security", prices.name || ""], ["RIC", prices.ric], ["ISIN", prices.isin || ""], ["Currency", ccyNorm(prices.currency)],
      ["Prices", uk(first.d) + " – " + uk(last.d)], ["Trading days", nf(m.rows.length)], ["Source", prices.source || "Morningstar"]]
      .filter(x => x[1]).map(x => "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>").join("");
    return '<div class="grid3"><section class="rc span3 pr-card"><header class="rc-h"><div><h3>Share price</h3><p>' + sub + "</p></div>" + seg + '</header><div class="pr-chart" data-def="' + (ranges.find(r => r[0] === def) || [0, 0])[1] + '"></div></section>' +
      '<section class="rc span2 pr-side"><header class="rc-h"><div><h3>Key prices</h3><p>The closes behind the bid premia, from the share price series</p></div></header>' + tbl + '<p class="fine pad">' + note + "</p></section>" +
      '<section class="rc"><header class="rc-h"><div><h3>Price series</h3></div></header><dl class="facts c2">' + facts + "</dl></section>" +
      adjSection(prices) + "</div>";
  }

  /* ------------------------------------------------------------------ dividends and splits (M&A Monitor adjusted price) */
  const isAdmin = () => !!(MAM.me && MAM.me.role === "admin");
  // dividends to 2-4 decimals (0.215 stays 0.215)
  const divAmt = (v, c) => { c = ccyNorm(c); const t = (+v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 4 }); if (c === "GBX") return t + "p"; const sy = SYM[c]; return (sy != null ? sy : c + " ") + t; };
  const adjAmt = (a, ccy) => a.kind === "split" ? (a.ratio >= 1 ? nf(a.ratio, a.ratio % 1 ? 4 : 0) + "-for-1 split" : "1-for-" + nf(1 / a.ratio, (1 / a.ratio) % 1 ? 2 : 0) + " consolidation") : divAmt(a.amount, ccy);
  function adjList(adj, ccy) {
    if (!adj || !adj.length) return '<p class="fine pad">None entered: the M&amp;A Monitor adjusted price is the close.</p>';
    return '<table class="t pr-adj-t"><thead><tr><th>Ex-date</th><th>Type</th><th class="r">Per share</th><th>Note</th></tr></thead><tbody>' +
      adj.map(a => '<tr><td class="dt">' + uk(a.d) + "</td><td>" + (a.kind === "split" ? "Split / consolidation" : "Dividend") + '</td><td class="n">' + adjAmt(a, ccy) + "</td><td>" + esc(a.note || "") + "</td></tr>").join("") + "</tbody></table>";
  }
  function adjSection(prices) {
    return '<section class="rc span3 pr-adj"><header class="rc-h"><div><h3>Dividends and splits</h3><p>For the M&amp;A Monitor adjusted price used by the customised bid premia download: each dividend is deducted from the prices before its ex-dividend date, and splits / consolidations applied to them</p></div>' +
      (isAdmin() ? '<button type="button" class="btn ghost sm" data-adj="edit">Edit</button>' : "") + '</header><div class="pr-adj-list">' + adjList(prices.adj, prices.currency) + '</div><div class="pr-adj-ed" hidden></div></section>';
  }
  // "7 Jul 2026", "07/07/2026", "2026-07-07", "07-07-26" -> ISO
  const MONS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(s) {
    s = String(s || "").trim(); let m;
    const ok = (y, mo, d) => { if (y < 100) y += 2000; const t = Date.UTC(y, mo - 1, d), x = new Date(t); return x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? iso(t) : null; };
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return ok(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s))) return ok(+m[3], +m[2], +m[1]);
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3})[A-Za-z]*\.?[\s,-]+(\d{2,4})$/.exec(s)) && MONS[m[2].toLowerCase()]) return ok(+m[3], MONS[m[2].toLowerCase()], +m[1]);
    return null;
  }
  // a dividend amount as written in a table: "35c", "12.5p", "$0.35", "€0.35", "0.35", "GBX 12.5" -> { v (main unit), ccy (from the symbol, if any) }
  function parseAmount(s) {
    s = String(s || "").replace(/\u00a0/g, " ").trim(); if (!s || /^[–—-]+$/.test(s)) return null;
    const m = /(-?\d[\d,]*(?:\.\d+)?)/.exec(s); if (!m) return null;
    let v = parseFloat(m[1].replace(/,/g, "")); if (!isFinite(v)) return null;
    let ccy = /\$/.test(s) ? "USD" : /€/.test(s) ? "EUR" : /£/.test(s) ? "GBP" : null;
    const after = s.slice(m.index + m[1].length).trim().toLowerCase();
    if (/^(c|ct|cts|cents?)\b/.test(after)) v /= 100;
    else if (/^(p|pence)\b/.test(after)) { v /= 100; ccy = "GBP"; }
    const code = /\b([A-Z]{3})\b/.exec(s); if (code && !ccy) ccy = code[1] === "GBX" ? "GBP" : code[1];
    if (code && code[1] === "GBX") v /= 100;
    return { v, ccy };
  }
  // a pasted dividend table (copied from a web page, with its header row) -> [{ d, v, ccy, note, special }]
  function parseDividendTable(text) {
    const lines = String(text || "").split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim());
    const cells = l => (l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/)).map(c => c.trim());
    const hi = lines.findIndex(l => cells(l).some(c => /\bex\b|ex[-\s.]*(div|dividend|date)/i.test(c)));
    if (hi < 0) throw new Error("No header row with an ex-dividend date column (copy the table with its header row).");
    const H = cells(lines[hi]), find = re => H.findIndex(h => re.test(h));
    const cEx = find(/\bex\b|ex[-\s.]*(div|dividend|date)/i);
    let cAmt = find(/decl[a-z.]*\s*amount/i); if (cAmt < 0) cAmt = H.findIndex(h => /amount|dividend|value|gross/i.test(h) && !/forecast|date|yield|type/i.test(h));
    const cCcy = find(/curr/i), cStatus = find(/status/i), cType = find(/type|kind/i);
    if (cAmt < 0) throw new Error("No amount column found in the header row.");
    const out = [], skipped = [];
    lines.slice(hi + 1).forEach(l => {
      const c = cells(l); if (c.length < 2) return;
      if (cStatus >= 0 && /forecast/i.test(c[cStatus] || "")) { skipped.push("forecast"); return; }
      const d = parseDate(c[cEx]); const a = parseAmount(c[cAmt]);
      if (!d || !a) { skipped.push("unreadable"); return; }
      if (!(a.v > 0)) { skipped.push("zero"); return; }
      const ccy = (cCcy >= 0 && /^[A-Z]{3}$/.test(c[cCcy] || "") ? (c[cCcy] === "GBX" ? "GBP" : c[cCcy]) : null) || a.ccy;
      const type = cType >= 0 ? c[cType] : "";
      out.push({ d, v: a.v, ccy, raw: c[cAmt], type, special: /special|capital|return/i.test(type) });
    });
    return { rows: out, skipped };
  }
  // the editor's lines <-> rows
  const fmtNum = v => String(Math.round(v * 1e6) / 1e6);
  const toLines = adj => (adj || []).map(a => uk(a.d) + ", " + a.kind + ", " + fmtNum(a.kind === "split" ? +a.ratio : +a.amount) + (a.note ? ", " + a.note : "")).join("\n");
  function fromLines(text) {
    const rows = [], bad = [];
    String(text || "").split(/\r?\n/).forEach((l, i) => {
      if (!l.trim()) return;
      const p = l.split(","), d = parseDate(p[0]), k = String(p[1] || "").trim().toLowerCase(), v = parseFloat(String(p[2] || "").replace(/[^\d.\-]/g, ""));
      const kind = /^div/.test(k) ? "dividend" : /^(split|consol)/.test(k) ? "split" : null;
      if (!d || !kind || !(v > 0)) { bad.push(i + 1); return; }
      rows.push({ d, kind, amount: kind === "dividend" ? v : null, ratio: kind === "split" ? v : null, note: p.slice(3).join(",").trim() });
    });
    return { rows: rows.sort((a, b) => a.d < b.d ? -1 : 1), bad };
  }
  function adjEditor(sec, prices) {
    const ed = sec.querySelector(".pr-adj-ed"), pc = ccyNorm(prices.currency), unit = pc === "GBX" ? "pence (GBp)" : pc || "the share price currency";
    ed.hidden = false;
    ed.innerHTML = '<div class="fld"><label class="pr-adj-lab" for="adj-lines">One line per dividend or split: <b>ex-date, dividend, amount per share in ' + esc(unit) + ', note</b> or <b>ex-date, split, ratio, note</b> (ratio = shares after per share before: 2 for a 2-for-1 split, 0.1 for a 1-for-10 consolidation)</label>' +
      '<textarea class="in" id="adj-lines" rows="6" spellcheck="false" placeholder="07/07/2026, dividend, 0.30, Interim 35c USD"></textarea></div>' +
      '<details class="pr-paste"><summary>Read a dividend table pasted from a web page</summary>' +
      '<p class="fine">Copy the dividend history table from the page you use, including its header row, and paste it below. Forecast rows and zero amounts are left out; amounts in another currency are converted at the rate shown, which you can change.</p>' +
      '<textarea class="in" id="adj-paste" rows="5" spellcheck="false" placeholder="Status   Type   Decl. date   Ex-div date   Pay date   Decl. Currency   Forecast amount   Decl. amount"></textarea>' +
      '<div class="pr-prev" id="adj-prev"></div></details>' +
      '<div class="pr-adj-a"><span class="pr-adj-m" id="adj-msg" role="status"></span><button type="button" class="btn ghost sm" data-adj="cancel">Cancel</button><button type="button" class="btn sm" data-adj="save">Save</button></div>';
    const lines = ed.querySelector("#adj-lines"), paste = ed.querySelector("#adj-paste"), prev = ed.querySelector("#adj-prev"), msg = ed.querySelector("#adj-msg");
    lines.value = toLines(prices.adj);
    const fx = MAM_CONFIG.fxPerGbp || {}, rates = {};
    // dividend currency -> share price currency (pence count as GBP with the amount x 100)
    const base = pc === "GBX" ? "GBP" : pc;
    const defRate = c => fx[c] && fx[base] ? fx[base] / fx[c] : null;
    let parsed = null;
    function preview() {
      if (!parsed) { prev.innerHTML = ""; return; }
      const foreign = [...new Set(parsed.rows.map(r => r.ccy).filter(c => c && c !== base))];
      foreign.forEach(c => { if (rates[c] == null) rates[c] = defRate(c); });
      const conv = r => { let v = r.v; if (r.ccy && r.ccy !== base) { const k = rates[r.ccy]; if (!(k > 0)) return null; v *= k; } return pc === "GBX" ? v * 100 : v; };
      const rateRow = foreign.map(c => '<label class="pr-fx">1 ' + esc(c) + ' = <input class="in" type="number" step="any" min="0" data-fx="' + esc(c) + '" value="' + (rates[c] != null ? fmtNum(rates[c]) : "") + '"> ' + esc(base) + "</label>").join("");
      const ok = parsed.rows.map(r => ({ r, v: conv(r) }));
      prev.innerHTML = (rateRow ? '<div class="pr-fxs">' + rateRow + '<span class="fine">Approximate rates to start with: use the rate on each ex-date if you have it.</span></div>' : "") +
        '<table class="t pr-adj-t"><thead><tr><th>Ex-date</th><th>Type</th><th class="r">As written</th><th class="r">Per share (' + esc(pc === "GBX" ? "GBp" : pc) + ')</th></tr></thead><tbody>' +
        ok.map(x => "<tr" + (x.r.special ? ' class="warn"' : "") + '><td class="dt">' + uk(x.r.d) + "</td><td>" + esc(x.r.type || "Dividend") + (x.r.special ? ' <small>check: may come with a share consolidation</small>' : "") + '</td><td class="n">' + esc(x.r.raw) + (x.r.ccy ? " " + esc(x.r.ccy) : "") + '</td><td class="n">' + (x.v == null ? "—" : fmtNum(x.v)) + "</td></tr>").join("") + "</tbody></table>" +
        '<div class="pr-adj-a"><span class="fine">' + parsed.rows.length + " dividend" + (parsed.rows.length === 1 ? "" : "s") + " read" + (parsed.skipped.length ? "; " + parsed.skipped.length + " row" + (parsed.skipped.length === 1 ? "" : "s") + " left out (forecasts, zero or unreadable)" : "") +
        '</span><button type="button" class="btn sm" data-adj="add"' + (ok.some(x => x.v != null) ? "" : " disabled") + ">Add to the list</button></div>";
      prev._rows = ok;
    }
    paste.addEventListener("input", () => {
      if (!paste.value.trim()) { parsed = null; preview(); return; }
      try { parsed = parseDividendTable(paste.value); preview(); } catch (e) { parsed = null; prev.innerHTML = '<p class="fine err">' + esc(e.message) + "</p>"; }
    });
    prev.addEventListener("input", e => { const c = e.target.dataset.fx; if (!c) return; rates[c] = parseFloat(e.target.value); const keep = e.target.selectionStart; preview(); const i = prev.querySelector('[data-fx="' + c + '"]'); if (i) { i.focus(); try { i.setSelectionRange(keep, keep); } catch (_) {} } });
    ed.onclick = async e => {
      const b = e.target.closest("[data-adj]"); if (!b) return;
      const act = b.dataset.adj;
      if (act === "cancel") { ed.hidden = true; ed.innerHTML = ""; return; }
      if (act === "add") {
        const have = fromLines(lines.value).rows, keyOf = r => r.d + "|" + r.kind;
        const add = (prev._rows || []).filter(x => x.v != null).map(x => ({ d: x.r.d, kind: "dividend", amount: x.v, note: [x.r.type, x.r.raw + (x.r.ccy ? " " + x.r.ccy : ""), x.r.ccy && x.r.ccy !== base ? "at " + fmtNum(rates[x.r.ccy]) : ""].filter(Boolean).join(" ") }));
        const seen = new Set(have.map(keyOf)), merged = have.concat(add.filter(r => !seen.has(keyOf(r)))).sort((a, b) => a.d < b.d ? -1 : 1);
        lines.value = toLines(merged); paste.value = ""; parsed = null; preview();
        msg.textContent = add.length + " added to the list: check them, then Save."; return;
      }
      if (act === "save") {
        const r = fromLines(lines.value);
        if (r.bad.length) { msg.textContent = "Line" + (r.bad.length > 1 ? "s " : " ") + r.bad.join(", ") + " can't be read (date, dividend or split, amount)."; return; }
        b.disabled = true; msg.textContent = "Saving…";
        const { error } = await MAM.sb.rpc("db_admin_save_adjustments", { p_ric: prices.ric, p_rows: r.rows.map(x => ({ d: x.d, kind: x.kind, amount: x.amount, ratio: x.ratio, note: x.note })) });
        b.disabled = false;
        if (error) { msg.textContent = "Could not save: " + error.message; return; }
        prices.adj = r.rows.map(x => ({ d: x.d, kind: x.kind, amount: x.amount, ratio: x.ratio, note: x.note }));
        sec.querySelector(".pr-adj-list").innerHTML = adjList(prices.adj, prices.currency);
        ed.hidden = true; ed.innerHTML = "";
        MAM.toast(r.rows.length + " dividend" + (r.rows.length === 1 ? "" : "s") + " / split" + (r.rows.length === 1 ? "" : "s") + " saved for RIC " + prices.ric + ".");
      }
    };
  }

  /* ------------------------------------------------------------------ the chart (SVG, drawn to the card's width) */
  const NS = "http://www.w3.org/2000/svg";
  const el = (n, a, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  function niceTicks(lo, hi, n) {
    const span = hi - lo || Math.abs(hi) || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return { ticks: out, step };
  }
  // month (or year) ticks, as many as fit at ~70px apart
  function dateTicks(a, b, maxN) {
    const months = (b - a) / DAY / 30.44, out = [];
    const step = [1, 2, 3, 6, 12, 24, 36].find(k => months / k <= maxN) || 60;
    const d = new Date(a); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    if (step >= 12) { d.setUTCMonth(0); if (+d < a) d.setUTCFullYear(d.getUTCFullYear() + 1); }
    while (step < 12 && d.getUTCMonth() % step) d.setUTCMonth(d.getUTCMonth() + 1);
    for (; +d <= b; d.setUTCMonth(d.getUTCMonth() + step)) {
      const mo = d.getUTCMonth(), yy = String(d.getUTCFullYear()).slice(2);
      out.push({ t: +d, l: step >= 12 ? String(d.getUTCFullYear()) : MON[mo] + (mo === 0 || !out.length ? " " + yy : "") });
    }
    return out;
  }
  function draw(box, m, days) {
    const W = Math.max(280, box.clientWidth), narrow = W < 560, H = narrow ? 240 : 300;
    const pad = { l: narrow ? 40 : 52, r: m.offer && !narrow ? 92 : 12, t: 30, b: 28 };
    const last = m.rows[m.rows.length - 1].t, from = days ? last - days * DAY : m.rows[0].t;
    let vis = m.rows.filter(r => r.t >= from);
    if (vis.length < 2) vis = m.rows.slice(-2);
    const xs = vis[0].t, xe = vis[vis.length - 1].t;
    let lo = Math.min(...vis.map(r => r.c)), hi = Math.max(...vis.map(r => r.c));
    if (m.offer) { lo = Math.min(lo, m.offer); hi = Math.max(hi, m.offer); }
    const padY = (hi - lo) * 0.08 || hi * 0.05; lo -= padY; hi += padY;
    const yt = niceTicks(lo, hi, W < 520 ? 4 : 5);
    lo = Math.min(lo, yt.ticks[0]); hi = Math.max(hi, yt.ticks[yt.ticks.length - 1]);
    const X = t => pad.l + (t - xs) / Math.max(1, xe - xs) * (W - pad.l - pad.r), Y = v => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
    box.textContent = "";
    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, class: "pr-svg", role: "img", tabindex: "0",
      "aria-label": "Daily closing share price from " + uk(iso(xs)) + " to " + uk(iso(xe)) + ". Use the left and right arrow keys to read values." }, box);
    const g = el("g", { class: "grid" }, svg);
    const dp = yt.step < 0.1 ? 2 : yt.step < 1 ? 1 : 0;
    yt.ticks.forEach(v => { if (v < lo - 1e-9 || v > hi + 1e-9) return; el("line", { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v) }, g); const tx = el("text", { x: pad.l - 8, y: Y(v) + 4, "text-anchor": "end", class: "ax" }, svg); tx.textContent = nf(v, dp); });
    dateTicks(xs, xe, Math.max(2, Math.floor((W - pad.l - pad.r) / 70))).forEach(k => { if (k.t < xs || k.t > xe) return; const x = X(k.t); el("line", { x1: x, x2: x, y1: H - pad.b, y2: H - pad.b + 4, class: "tk" }, svg); const tx = el("text", { x, y: H - 8, "text-anchor": "middle", class: "ax" }, svg); tx.textContent = k.l; });
    el("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: "base" }, svg);
    // events: announcement and pre-bid speculation
    const ev = [];
    if (m.pre && m.pre >= xs && m.pre <= xe) ev.push([m.pre, "Pre-bid speculation"]);
    if (m.ann && m.ann >= xs && m.ann <= xe) ev.push([m.ann, "Announced"]);
    // two labels that would collide go on two lines above the plot
    const stack = ev.length > 1 && Math.abs(X(ev[0][0]) - X(ev[1][0])) < 220;
    const short = s2 => s2.slice(8, 10) + "/" + s2.slice(5, 7) + "/" + s2.slice(2, 4);
    ev.forEach(([t, l], i) => {
      const x = X(t), y = stack ? (i === 0 ? 11 : 24) : 18;
      el("line", { x1: x, x2: x, y1: stack ? 28 : y + 4, y2: H - pad.b, class: "ev" }, svg);
      const right = x > (W - pad.r + pad.l) / 2, tx = el("text", { x: right ? x - 5 : x + 5, y, "text-anchor": right ? "end" : "start", class: "evl" }, svg);
      tx.textContent = narrow ? (l === "Announced" ? "Announced " : "Pre-bid ") + short(iso(t)) : l + " " + uk(iso(t));
    });
    // price: 10% wash + 2px line
    const pts = vis.map(r => X(r.t).toFixed(1) + "," + Y(r.c).toFixed(1));
    el("path", { d: "M" + pts.join("L") + "L" + X(xe).toFixed(1) + "," + (H - pad.b) + "L" + X(xs).toFixed(1) + "," + (H - pad.b) + "Z", class: "area" }, svg);
    el("path", { d: "M" + pts.join("L"), class: "line" }, svg);
    // offer price: reference line labelled at the right edge
    if (m.offer) {
      const y = Y(m.offer); el("line", { x1: pad.l, x2: W - pad.r + 4, y1: y, y2: y, class: "off" }, svg);
      // narrow screens: the label sits just above the line inside the plot
      const tx = narrow ? el("text", { x: W - pad.r - 2, y: y - 6, "text-anchor": "end", class: "offl in" }, svg) : el("text", { x: W - pad.r + 8, y: y + 4, class: "offl" }, svg);
      tx.textContent = "Offer " + money(m.offer, m.ccy);
    }
    // end value
    const e = vis[vis.length - 1]; el("circle", { cx: X(e.t), cy: Y(e.c), r: 4, class: "dot" }, svg);
    // hover / keyboard: crosshair snapping to the nearest day, one tooltip
    const cross = el("line", { y1: pad.t, y2: H - pad.b, class: "cross", visibility: "hidden" }, svg);
    const hd = el("circle", { r: 4.5, class: "dot", visibility: "hidden" }, svg);
    const tip = document.createElement("div"); tip.className = "pr-tip"; tip.hidden = true; box.appendChild(tip);
    let cur = -1;
    const show = i => {
      cur = Math.max(0, Math.min(vis.length - 1, i)); const r = vis[cur], x = X(r.t), y = Y(r.c);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      hd.setAttribute("cx", x); hd.setAttribute("cy", y); hd.setAttribute("visibility", "visible");
      tip.textContent = "";
      const v = document.createElement("b"); v.textContent = money(r.c, m.ccy); tip.appendChild(v);
      const d = document.createElement("span"); d.textContent = uk(r.d); tip.appendChild(d);
      if (m.offer) { const p = document.createElement("span"); p.textContent = "Offer premium " + pctS((m.offer / r.c - 1) * 100); tip.appendChild(p); }
      tip.hidden = false;
      // the tooltip sits right of the crosshair, or left of it near the right edge
      const sx = box.clientWidth / W, tw = tip.offsetWidth, px = x * sx;
      tip.style.left = (px + 12 + tw > box.clientWidth ? Math.max(4, px - tw - 12) : px + 12) + "px";
      tip.style.top = Math.max(4, y * sx - 56) + "px";
    };
    const hide = () => { cross.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); tip.hidden = true; };
    const nearest = t => { let lo2 = 0, hi2 = vis.length - 1; while (hi2 - lo2 > 1) { const k = (lo2 + hi2) >> 1; if (vis[k].t < t) lo2 = k; else hi2 = k; } return Math.abs(vis[lo2].t - t) <= Math.abs(vis[hi2].t - t) ? lo2 : hi2; };
    svg.addEventListener("pointermove", e => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width; if (x < pad.l - 4 || x > W - pad.r + 4) { hide(); return; } show(nearest(xs + (x - pad.l) / (W - pad.l - pad.r) * (xe - xs))); });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); show(cur < 0 ? vis.length - 1 : cur + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 20 : 1)); } else if (e.key === "Escape") hide(); });
  }
  function mount(root, deal, f, prices) {
    const sec = root.querySelector(".pr-adj");
    if (sec) sec.querySelector(".rc-h").addEventListener("click", e => { if (e.target.closest('[data-adj="edit"]') && isAdmin()) adjEditor(sec, prices); });
    const box = root.querySelector(".pr-chart"); if (!box) return;
    const m = model(deal, f, prices); if (!m.rows.length) return;
    let days = +box.dataset.def;
    const redraw = () => { if (box.offsetParent !== null) draw(box, m, days); };
    root.querySelectorAll('input[name="pr-rng"]').forEach(i => i.addEventListener("change", () => { days = +i.value; redraw(); }));
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => redraw()); ro.observe(box); }
    else addEventListener("resize", redraw);
    redraw();
  }

  /* ------------------------------------------------------------------ admins: load a Morningstar download (CSV) */
  function parseCsv(text) {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
    const split = l => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
    const head = split(lines[0] || ""), col = n => head.findIndex(h => h.toLowerCase() === n.toLowerCase());
    const c = { date: col("Trade Date"), close: col("Official Close Price"), last: col("Trade Price1"), open: col("Open Price"), high: col("High Price"), low: col("Low Price"),
      vol: col("Accumulated Volume Unscaled"), vwap: col("Volume Weighted Average Price"), isin: col("ISIN"), name: col("Security Description"), ric: col("RIC"), ccy: col("Currency Code") };
    if (c.date < 0 || (c.close < 0 && c.last < 0)) throw new Error("This doesn't look like a Morningstar price download (no Trade Date / close price columns).");
    const toIso = s => { let m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s); if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? m[0] : null; };
    const num = s => { const v = parseFloat(String(s || "").replace(/,/g, "")); return isFinite(v) ? v : null; };
    const rows = [], rics = new Set(); let meta = null;
    for (const l of lines.slice(1)) {
      const v = split(l), d = toIso(v[c.date] || ""), close = num(c.close >= 0 ? v[c.close] : null) ?? num(c.last >= 0 ? v[c.last] : null);
      if (!d || close == null) continue;
      if (c.ric >= 0 && v[c.ric]) rics.add(v[c.ric]);
      if (!meta) { const cc = c.ccy >= 0 ? String(v[c.ccy] || "").trim() : ""; meta = { ric: c.ric >= 0 ? v[c.ric] : "", isin: c.isin >= 0 ? v[c.isin] : "", name: c.name >= 0 ? v[c.name] : "", ccy: /^(GBp|GBX|GBx)$/.test(cc) ? "GBX" : cc }; }
      rows.push([d, close, num(v[c.open]), num(v[c.high]), num(v[c.low]), num(v[c.vol]), num(v[c.vwap])]);
    }
    if (!rows.length) throw new Error("No prices found in the file.");
    if (rics.size > 1) throw new Error("The file has more than one RIC (" + [...rics].slice(0, 4).join(", ") + "). Load one security at a time.");
    if (!meta.ric) throw new Error("The file has no RIC column.");
    rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
    return { meta, rows };
  }
  // shows a confirmation bar under the report header, then loads
  async function load(file, deal, bar, done) {
    let p;
    try { p = parseCsv(await file.text()); } catch (e) { MAM.toast(e.message, true); return; }
    const words = s => new Set(String(s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !/^(PLC|LTD|INC|LLC|HOLDINGS?|GROUP|THE|AND|CORP|COMPANY)$/.test(w)));
    const a = words(p.meta.name), b = words(deal.target), same = [...a].some(w => b.has(w));
    bar.hidden = false; bar.className = "pr-load" + (same ? "" : " warn");
    bar.innerHTML = '<div><b></b><span></span></div><div class="acts"><button type="button" class="btn ghost sm" data-x="no">Cancel</button><button type="button" class="btn sm" data-x="yes">Load prices</button></div>';
    bar.querySelector("b").textContent = "Load " + nf(p.rows.length) + " daily prices for " + (p.meta.name || p.meta.ric) + " (RIC " + p.meta.ric + (p.meta.ccy ? ", " + p.meta.ccy : "") + ", " + uk(p.rows[0][0]) + "–" + uk(p.rows[p.rows.length - 1][0]) + ")?";
    bar.querySelector("span").textContent = same ? "They will show as this deal's target share price." : "Check: the security name doesn't look like this deal's target (" + MAM.tc(deal.target) + ").";
    bar.onclick = async e => {
      const x = e.target.closest("[data-x]"); if (!x) return;
      if (x.dataset.x === "no") { bar.hidden = true; return; }
      x.disabled = true; x.textContent = "Loading…";
      const { data, error } = await MAM.sb.rpc("db_admin_load_prices", { p_deal_number: deal.deal_number, p_ric: p.meta.ric, p_isin: p.meta.isin, p_name: p.meta.name, p_currency: p.meta.ccy, p_rows: p.rows });
      if (error) { x.disabled = false; x.textContent = "Load prices"; MAM.toast("Could not load the prices: " + error.message, true); return; }
      bar.hidden = true;
      MAM.toast(nf(data.rows) + " prices loaded for RIC " + data.ric + " (" + uk(data.first) + "–" + uk(data.last) + ").");
      done();
    };
  }

  MAM.prices = { card, mount, load, parseCsv, parseDividendTable, parseAmount, parseDate, fromLines };
})();
