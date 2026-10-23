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
      '<section class="rc"><header class="rc-h"><div><h3>Price series</h3></div></header><dl class="facts c2">' + facts + "</dl></section></div>";
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
      if (!meta) meta = { ric: c.ric >= 0 ? v[c.ric] : "", isin: c.isin >= 0 ? v[c.isin] : "", name: c.name >= 0 ? v[c.name] : "", ccy: c.ccy >= 0 ? v[c.ccy] : "" };
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

  MAM.prices = { card, mount, load, parseCsv };
})();
