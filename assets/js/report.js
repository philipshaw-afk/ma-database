/* M&A DataBase · deal report (new format), built from the DIANA deal record in Supabase */
(function () {
  "use strict";
  const MAM = window.MAM, { $, $$, esc, num, nf } = MAM;
  const R = $("#rep-new");
  const has = v => v !== null && v !== undefined && v !== "";
  const cache = {};
  const today = (() => { const n = new Date(); return +new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  const SYM = { STG: "£", GBP: "£", EUR: "€", USD: "US$" };
  const ccyLab = c => SYM[(c || "").toUpperCase()] || (c ? c + " " : "");
  const money = (v, c, d = 1) => v == null ? "—" : ccyLab(c) + nf(v, d) + "m";
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
  const DL = '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>';

  /* ---------------- narrative text -> HTML ---------------- */
  const SMALL = new Set(["of", "and", "to", "for", "the", "in", "on", "a", "an", "by", "with", "or", "at", "as", "per"]);
  const titleCase = s => s.toLowerCase().split(/(\s+|\/|-)/).map((w, i) => (i > 0 && SMALL.has(w)) ? w : w.replace(/^([a-z])/, c => c.toUpperCase())).join("").replace(/'S\b/g, "'s");
  const isHeading = t => t.length <= 90 && /[A-Z]{2}/.test(t) && t === t.toUpperCase() && !/\s{3,}/.test(t) && !/^\(?\d/.test(t) && !/^N\.B\./.test(t) && (t.match(/[A-Z]/g) || []).length >= Math.max(3, t.replace(/[^A-Za-z]/g, "").length * 0.9);
  const isSub = t => /^(\d{1,2}|[a-z]|[ivx]{1,4})\)\s+\S/.test(t) && t.length < 100 && !/[.;,]$/.test(t);
  const isTable = l => /\S\s{3,}\S/.test(l.trim()) || /^\s{6,}\S/.test(l) || /^\s*[-=_]{4,}\s*$/.test(l);
  const NUMRX = /^\(?-?[£$€]?\s?[\d,]+(\.\d+)?\)?%?x?$|^n\/a$|^-$|^nil$/i;
  function tableHtml(lines) {
    // offer terms: "for every X share    250 pence in cash"
    if (lines.every(l => /^\s*(for|in exchange for)\s+(every|each)\b/i.test(l) && /\S\s{3,}\S/.test(l))) {
      return '<div class="offterms">' + lines.map(l => { const p = l.trim().split(/\s{3,}/); return '<div class="tt"><span class="tt-l">' + esc(p[0].replace(/^./, c => c.toUpperCase())) + '</span><span class="tt-v">' + esc(p.slice(1).join(" ")) + "</span></div>"; }).join("") + "</div>";
    }
    let rows = [], rule = false, ncol = 0;
    lines.forEach(l => {
      if (/^\s*[-=_]{4,}\s*$/.test(l)) { rule = true; return; }
      const cells = l.trim().split(/\s{2,}/);
      ncol = Math.max(ncol, cells.length);
      rows.push({ cells, rule, lead: /^\s{6,}/.test(l) }); rule = false;
    });
    if (ncol < 2) return '<pre class="ntxt">' + esc(lines.join("\n")) + "</pre>";
    let h = '<div class="ntab"><table><tbody>';
    rows.forEach((r, i) => {
      const c = r.cells;
      if (c.length === 1) { h += '<tr class="grp"><td colspan="' + ncol + '">' + esc(c[0]) + "</td></tr>"; return; }
      const vals = c.slice(1), allNum = vals.every(v => NUMRX.test(v.replace(/\s/g, "")));
      const label = c[0], pad = ncol - c.length;
      const isHead = i === 0 && (!allNum || /^(as at|y\/e|year|period|half|six months|ttm|\d{1,2}\/\d{1,2})/i.test(label) || vals.every(v => /^(19|20)\d\d[a-z]?$/i.test(v)));
      if (isHead) { h += "<tr><th>" + esc(label) + "</th>" + "<th></th>".repeat(pad) + vals.map(v => '<th class="r">' + esc(v) + "</th>").join("") + "</tr>"; return; }
      const tot = /^total\b/i.test(label), cls = [tot ? "tot" : "", r.rule && !tot ? "rule" : ""].filter(Boolean).join(" ");
      h += "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + esc(label) + "</td>" + "<td></td>".repeat(pad) + vals.map(v => { const n = NUMRX.test(v.replace(/\s/g, "")); return "<td class=\"" + (n ? "num" + (/\)$/.test(v) ? "" : " ps") : "") + '">' + esc(v) + "</td>"; }).join("") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function narrative(text, prefix, skipFirstHeading) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const wrap = Math.max(80, ...lines.map(l => l.length).filter(n => n < 160));
    const out = [], toc = [];
    let para = [], list = null, first = true, firstHead = true;
    const joinLines = a => a.reduce((acc, l) => !acc ? l : (/[A-Za-z]-$/.test(acc) && /^[a-z]/.test(l) ? acc + l : acc + " " + l), "");
    const flushP = () => { if (para.length) { out.push((list ? "<li>" : "<p>") + esc(joinLines(para).replace(/\s+/g, " ").trim()) + (list ? "</li>" : "</p>")); para = []; } };
    const closeList = () => { flushP(); if (list) { out.push("</ul>"); list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i], t = raw.trim();
      if (!t) { closeList(); continue; }
      if (isHeading(t)) {
        closeList();
        if (firstHead && skipFirstHeading) { firstHead = false; continue; }
        firstHead = false;
        const id = prefix + "-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + toc.length;
        const tt = titleCase(t);
        out.push('<h4 class="' + (first ? "first" : "") + '" id="' + id + '">' + esc(tt) + "</h4>"); toc.push([id, tt]); first = false; continue;
      }
      if (isTable(raw)) {
        closeList();
        const blk = [raw];
        while (i + 1 < lines.length) {
          const n = lines[i + 1], nt = n.trim();
          if (!nt) break;
          if (isTable(n)) { blk.push(n); i++; continue; }
          // a short caption line (e.g. "£ million") sandwiched between table lines
          if (nt.length < 45 && !/[.:]$/.test(nt) && i + 2 < lines.length && isTable(lines[i + 2]) && !isHeading(nt)) { blk.push(n); i++; continue; }
          break;
        }
        out.push(tableHtml(blk)); first = false; continue;
      }
      if (isSub(t)) { closeList(); out.push("<h5>" + esc(t) + "</h5>"); first = false; continue; }
      const bullet = /^[*•▪-]\s+/.test(t);
      if (bullet) {
        const bt = t.replace(/^[*•▪-]\s+/, ""), nx = (lines[i + 1] || "").trim();
        if (bt.length < 70 && !/[.;:,)]$/.test(bt) && /^[A-Z]/.test(nx) && !/^[*•▪-]\s/.test(nx) && !isHeading(nx)) { closeList(); out.push('<h5 class="bh">' + esc(bt) + "</h5>"); first = false; continue; }
      }
      if (bullet) { flushP(); if (!list) { out.push("<ul>"); list = true; } para.push(t.replace(/^[*•▪-]\s+/, "")); }
      else {
        if (!para.length && list && !/^[a-z(]/.test(t)) closeList();
        if (!para.length && /^(N\.B\.|Note:)/.test(t)) flushP();
        para.push(t);
      }
      first = false;
      if (/[.:;!?)"'”’]$/.test(t) && raw.trimEnd().length < wrap - 14) flushP();
    }
    closeList();
    return { html: out.join("\n"), toc };
  }
  MAM.narrative = narrative;
  const firstPara = text => { const n = narrative(text, "x", true); const m = /<p>([\s\S]*?)<\/p>/.exec(n.html); return m ? m[1] : ""; };

  /* ---------------- helpers ---------------- */
  const fv = (f, k) => f && f[k] != null && String(f[k]).trim() !== "" ? String(f[k]).trim() : null;
  const fnum = (f, k) => num(fv(f, k));
  const uk = s => MAM.isoToUk(s);
  const dts = s => MAM.isoToTs(s) ?? MAM.ukToTs(s);
  const offerPrice = (p, c) => { if (p == null) return null; c = (c || "").toUpperCase(); if (c === "STG" || c === "GBP") return p < 20 ? { v: nf(p * 100, p * 100 % 1 ? 2 : 0), u: "p", pre: "" } : { v: nf(p, 2), u: "", pre: "£" }; const dp = Math.min(4, Math.max(2, (String(p).split(".")[1] || "").length)); return { v: nf(p, dp), u: "", pre: ccyLab(c) }; };
  const pctS = v => v == null || v === "" ? "—" : (+v).toLocaleString("en-GB", { maximumFractionDigits: 2 }) + "%";
  const facts = (pairs, cls) => { const ok = pairs.filter(p => has(p[1])); return ok.length ? '<dl class="facts ' + (cls || "c3") + '">' + ok.map(p => "<div><dt>" + esc(p[0]) + "</dt><dd>" + (p[2] ? p[1] : esc(p[1])) + "</dd></div>").join("") + "</dl>" : ""; };
  const card = (title, sub, body, cls, id) => '<section class="rc ' + (cls || "") + '"' + (id ? ' id="' + id + '"' : "") + '><header class="rc-h"><div><h3>' + esc(title) + "</h3>" + (sub ? "<p>" + sub + "</p>" : "") + "</div></header>" + body + "</section>";
  const regCls = s => /^No regulatory/.test(s) ? "no" : /^All regulatory|cleared/i.test(s) ? "ok" : /Phase 2|failed/i.test(s) ? "p2" : /Awaiting|Conditions/i.test(s) ? "aw" : "";

  /* ---------------- report ---------------- */
  function build(no, res) {
    const d = res.deal, s = res.status ? res.status.data : null, sAsOf = res.status ? MAM.isoToUk(res.status.as_of) : "";
    const f = d.fields || {}, idx = MAM.byNo[no] || {};
    const ccy = d.currency || (s && s.currency) || "", pub = !!d.is_public;
    const T = MAM.tc(d.target), B = MAM.tc(fv(f, "Ultimate Bidder") || d.bidder), V = fv(f, "pdf_bidding_subsidiary"), D = d.seller || fv(f, "Ultimate Divestor name");
    const eq = fnum(f, "Implied Total Equity Value") ?? (d.value != null ? +d.value : null), ev = fnum(f, "Enterprise Value"), nd = fnum(f, "Net debt");
    const prem = fnum(f, "Pre-bid speculation premium"), evebitda = fnum(f, "Enterprise Value/EBITDA"), ebitda = fnum(f, "EBITDA");
    const status = d.deal_status || "Pending", stc = status.split(" ")[0];
    const pctFor = s && has(s.pct_bid_for) ? num(s.pct_bid_for) : null, pctOwned = s && has(s.pct_owned) ? num(s.pct_owned) : null;
    const xb = idx.cross_border || (d.target_country && d.bidder_country ? (d.target_country === d.bidder_country ? "No" : "Yes") : "");
    /* header */
    let h = '<header class="rh"><div><div class="eyebrow">Transaction report · Deal ' + esc(no) + (d.sector ? " · " + esc(d.sector.replace(/\s+\/\s+/g, " / ")) : "") + "</div><h1>" + esc(T) + "</h1>";
    h += '<div class="dline"><span><b>' + esc(V && MAM.tc(V) !== B ? MAM.tc(V) : B) + "</b>" + (V && MAM.tc(V) !== B ? " <em>(" + esc(B) + ")</em>" : "") + "</span>" + ARROW + "<span><b>" + esc(T) + "</b>" + (pctFor != null ? " <em>" + pctS(pctFor) + "</em>" : "") + "</span>" + (D ? '<span class="dv"><em>from</em> <b>' + esc(MAM.tc(D)) + "</b></span>" : "") + "</div>";
    const nxt = (res.events || []).filter(e => e.ty !== "ann" && dts(e.d) >= today).sort((a, b) => dts(a.d) - dts(b.d))[0];
    h += '<div class="chips">' + (nxt ? '<a class="ch nxt" href="#calendar" data-cal-q="' + esc(T) + '">Next: ' + esc(nxt.l) + " · " + new Date(dts(nxt.d)).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + "</a>" : "") + '<span class="stat stat-' + esc(stc) + '">' + esc(status) + "</span>" + (d.date_announced ? '<span class="ch">Announced ' + esc(MAM.longDate(d.date_announced)) + "</span>" : "") + (d.deal_type ? '<span class="ch">' + esc(d.deal_type.replace(/\s+\/\s+/g, " · ")) + "</span>" : "") + (fv(f, "Deal Attitude") ? '<span class="ch">' + esc(fv(f, "Deal Attitude")) + "</span>" : "") + (fv(f, "Consideration type") ? '<span class="ch">' + esc(fv(f, "Consideration type")) + "</span>" : "") + (xb ? '<span class="ch">' + (xb === "Yes" ? "Cross-border" : esc(d.target_country) + " domestic") + "</span>" : "") + "</div></div>";
    h += '<div class="acts">' + (d.pdf ? '<a class="btn" href="#" data-pdf="' + esc(no) + '">' + DL + "PDF</a>" : "") + '<a class="btn ghost" href="#" id="rep-csv">Export data</a>' + "</div></header>";
    /* KPI strip */
    const k = [];
    if (pub && d.offer_price != null) { const op = offerPrice(+d.offer_price, d.offer_currency || ccy); k.push(["Offer price", "<small>" + esc(op.pre) + "</small>" + op.v + (op.u ? "<small>" + op.u + "</small>" : ""), "per share" + (fv(f, "Consideration type") ? " · " + esc(fv(f, "Consideration type").toLowerCase()) : "")]); }
    if (eq != null) k.push([pub ? "Equity value" : "Deal value", esc(ccyLab(ccy)) + nf(eq, 1) + "<small>m</small>", pctFor != null ? pctS(pctFor) + " bid for" : (pub ? "100% equity" : "consideration")]);
    if (ev != null) k.push(["Enterprise value", esc(ccyLab(ccy)) + nf(ev, 1) + "<small>m</small>", nd != null ? "incl. " + esc(ccyLab(ccy)) + nf(nd, 1) + "m net " + (nd < 0 ? "funds" : "debt") : ""]);
    if (evebitda != null) k.push(["EV / EBITDA", nf(evebitda, 2) + "<small>x</small>", ebitda != null ? "EBITDA " + esc(ccyLab(ccy)) + nf(ebitda, 1) + "m" : ""]);
    else if (fnum(f, "Enterprise Value/Sales") != null) k.push(["EV / Sales", nf(fnum(f, "Enterprise Value/Sales"), 2) + "<small>x</small>", fnum(f, "Turnover (Sales)") != null ? "Sales " + esc(ccyLab(ccy)) + nf(fnum(f, "Turnover (Sales)"), 1) + "m" : ""]);
    if (prem != null) k.push(["Premium", (prem >= 0 ? "+" : "") + nf(prem, 1) + "<small>%</small>", "to the undisturbed price" + (fv(f, "Pre-bid speculation date") ? " (" + esc(uk(fv(f, "Pre-bid speculation date"))) + ")" : ""), "hl"]);
    if (k.length) h += '<div class="kpis" style="grid-template-columns:repeat(' + k.length + ',minmax(0,1fr))">' + k.map(x => '<div class="' + (x[3] || "") + '"><span class="kl">' + x[0] + '</span><span class="kv">' + x[1] + '</span><span class="ks">' + (x[2] || "&nbsp;") + "</span></div>").join("") + "</div>";
    /* offer status band */
    if (s) {
      const thr = has(s.acceptance_threshold_pct) ? pctS(s.acceptance_threshold_pct) : (/no minimum/i.test(s.acceptance_threshold_text || "") ? "None" : "—");
      const kd = has(s.acceptance_period_end_current) ? ["Offer period ends", s.acceptance_period_end_current] : has(s.shareholder_meeting_date) ? [dts(s.shareholder_meeting_date) < today ? "Shareholder meeting held" : "Shareholder meeting", s.shareholder_meeting_date] : ["Key date", "—"];
      h += '<div class="osband"><div class="osh"><span class="new">NEW</span><b>Offer status</b><span>as at ' + esc(sAsOf) + '</span><span class="stat stat-' + esc((idx.current_status || s.current_status || "Pending").split(" ")[0]) + '">' + esc(idx.current_status || s.current_status || "Pending") + '</span><a href="#" data-go="status">Full offer status →</a></div><div class="osg">' +
        '<div><span class="kl">% agreed</span><span class="kv">' + pctS(s.pct_agreed_total) + '</span><span class="ks">stake + SPAs + irrevocables</span></div>' +
        '<div><span class="kl">Threshold</span><span class="kv">' + thr + '</span><span class="ks">' + esc(/scheme/i.test(s.offer_structure || "") ? "scheme vote" : /merger/i.test(s.offer_structure || "") ? "merger vote" : "acceptance condition") + "</span></div>" +
        '<div><span class="kl">' + esc(kd[0]) + '</span><span class="kv">' + esc(kd[1]) + "</span></div>" +
        '<div><span class="kl">Regulatory</span><span class="kv"><span class="rg ' + regCls(s.regulatory_status || "") + '">' + esc(s.regulatory_status || "Not recorded") + "</span></span></div>" +
        '<div><span class="kl">Acceptances</span><span class="kv">' + (has(s.acceptances_pct) ? pctS(s.acceptances_pct) : "—") + '</span><span class="ks">' + (has(s.acceptances_date) ? "at " + esc(s.acceptances_date) : "not published") + "</span></div></div></div>";
    }
    /* tabs */
    const tabs = [["overview", "Overview"]];
    if (s) tabs.push(["status", 'Offer status <span class="new">NEW</span>']);
    tabs.push(["financials", "Financials"]);
    if (d.overview || d.profiles || d.background) tabs.push(["commentary", "Commentary"]);
    if (d.financial_notes) tabs.push(["payment", "Payment details"]);
    tabs.push(["data", "All fields"]);
    h += '<nav class="rtab" role="tablist" aria-label="Report sections">' + tabs.map((t, i) => '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (i === 0) + '">' + t[1] + "</button>").join("") + "</nav>";

    /* --- overview panel --- */
    let o = '<div class="grid3 st">';
    const nodeMeta = (...a) => a.filter(Boolean).map(esc).join(" · ");
    let struct = '<div class="struct' + (V && MAM.tc(V) !== B ? "" : " s3") + '" aria-label="Transaction structure">';
    struct += '<div class="node bd"><span class="role">' + (fv(f, "Ultimate Bidder") && fv(f, "Ultimate Bidder") !== d.bidder ? "Ultimate bidder" : "Bidder") + "</span><b>" + esc(B) + '</b><span class="nmeta">' + nodeMeta(d.bidder_country) + "</span></div>";
    if (V && MAM.tc(V) !== B) struct += '<div class="link"><span>forms &amp; controls</span></div><div class="node bd"><span class="role">Bidding vehicle</span><b>' + esc(MAM.tc(V)) + '</b><span class="nmeta">Acquisition vehicle</span></div>';
    struct += '<div class="link main"><span>' + esc(/scheme/i.test(d.deal_type || "") ? "scheme of arrangement" : pub ? "offer" : "acquires") + (pctFor != null ? " · <b>" + pctS(pctFor) + "</b>" : "") + '</span></div><div class="node ntg"><span class="role">Target</span><b>' + esc(T) + '</b><span class="nmeta">' + nodeMeta(fv(f, "Target Activities") && MAM.tc(fv(f, "Target Activities")).replace(/\b(And|Of|For|The|In|To)\b/g, w => w.toLowerCase()), d.target_country, fv(f, "pdf_stock_index")) + "</span></div></div>";
    if (D) struct += '<div class="struct s3 dvs"><div class="node dv"><span class="role">Divestor</span><b>' + esc(MAM.tc(D)) + '</b><span class="nmeta">' + nodeMeta(d.seller_country) + '</span></div><div class="link"><span>sells</span></div><div class="node ghost"><span class="role">Target</span><b>' + esc(T) + "</b></div></div>";
    const syn = firstPara(d.overview);
    o += card("Transaction", "Parties and classification", struct + (syn ? '<p class="synopsis">' + syn + "</p>" : "") + facts([
      ["Deal type", (d.deal_type || "").replace(/\s+\/\s+/g, " / ")], ["Consideration", fv(f, "Consideration type")], ["Attitude", fv(f, "Deal Attitude")],
      ["Competitive status", s && s.competitive_status], ["Cross border", xb], ["Regulatory referral", s && s.regulatory_referral],
      ["Capital owned → bid for", pctOwned != null && pctFor != null ? pctS(pctOwned) + " → " + pctS(pctFor) : null], ["Sector", (d.sector || "").replace(/\s+\/\s+/g, " / ")], ["Stock exchange index", fv(f, "pdf_stock_index")]
    ]), "span2");
    /* key dates */
    const kd = [];
    const add = (date, label, x, isNew) => { const t = dts(date); if (t == null) return; if (kd.some(e => e.t === t && e.l === label)) return; kd.push({ t, d: MAM.isoToUk(date) || date, l: label, x, n: isNew }); };
    const kdj = d.key_dates || {};
    add(kdj.disclosure_added || fv(f, "Disclosure Date Added"), "Offer period begins", "Added to the disclosure table");
    add(kdj.pre_bid_speculation || fv(f, "Pre-bid speculation date"), "Pre-bid speculation", "Undisturbed price date");
    add(fv(f, "Offeror Named"), "Offeror named", "Identified as a potential offeror");
    add(d.date_announced, "Offer announced", fv(f, "Consideration type") || "");
    (res.events || []).forEach(e => { if (e.ty !== "ann") add(e.d, e.l, e.x || "", true); });
    if (s) {
      add(s.acceptance_period_start, "Offer period opens", "", true); add(s.acceptance_period_end_current, "Offer period ends", s.acceptance_period_end_original && s.acceptance_period_end_original !== s.acceptance_period_end_current ? "Originally " + s.acceptance_period_end_original : "", true);
      add(s.shareholder_meeting_date, "Shareholder meeting", s.shareholder_meeting_type || "", true);
    }
    kd.sort((a, b) => a.t - b.t);
    const done = /^Completed|^Failed/i.test(status);
    o += card("Key dates", "From the report" + (s ? ', the disclosure table and offer status (<i class="newi">new</i>)' : ""), '<ol class="kd">' + kd.map(e => '<li class="' + (e.t <= today ? "done" : "todo") + (e.n ? " new" : "") + '"><span class="d">' + esc(e.d) + "</span><b>" + esc(e.l) + (e.n ? " <i>new</i>" : "") + '</b><span class="x">' + esc(e.x || "") + "</span></li>").join("") + (done ? "" : '<li class="todo"><span class="d">&nbsp;</span><b>' + (pub ? "Completion" : "Completion") + '</b><span class="x">Not yet completed</span></li>') + "</ol>", "");
    /* valuation */
    const MULT = [["Price / Sales", "Price/Sales"], ["Enterprise Value / Sales", "Enterprise Value/Sales"], ["Price / Earnings", "Price/Earnings"], ["Enterprise Value / EBITDA", "Enterprise Value/EBITDA"], ["Enterprise Value / EBITA", "Enterprise Value/EBITA"], ["Enterprise Value / EBIT", "Enterprise Value/EBIT"], ["Price / Book", "Price/Book"], ["Price / Bank Earnings", "Price/Bank Earnings"]];
    const mrows = MULT.filter(m => fnum(f, m[1]) != null && fnum(f, m[1]) !== 0);
    const FIG = [["Sales", "Turnover (Sales)"], ["EBITDA", "EBITDA"], ["EBITA", "EBITA"], ["Operating profit", "Operating profit"], ["Net profit before tax", "Net profit before tax"], ["Net income (earnings)", "Net Income (Earnings)"], ["Shareholders' funds", "Shareholders funds"], ["Net debt", "Net debt"]];
    const frows = FIG.filter(m => fnum(f, m[1]) != null);
    const BANK = [["Net interest margin", "Net Interest Margin"], ["Return on avg. equity", "Return on Avg. Equity"], ["Return on avg. assets", "Return on Avg. Assets"], ["Return on equity", "Return on Equity"], ["Return on assets", "Return on Assets"], ["Cost / income ratio", "Cost/Income Ratio"], ["Bad debt ratio", "Bad Debt Ratio"], ["Tier 1 ratio", "Tier 1 Ratio"], ["Total capital ratio", "Total Capital Ratio"]];
    const brows = BANK.filter(m => fnum(f, m[1]) != null);
    const PRM = [["3 months before", "3 months before announcement premium"], ["2 months before", "2 months before announcement premium"], ["4 weeks before", "4 weeks before announcement premium"], ["3 weeks before", "3 weeks before announcement premium"], ["2 weeks before", "2 weeks before announcement premium"], ["1 week before", "1 week before announcement premium"], ["1 day before", "1 day before announcement premium"], ["30-day average", "30 day average before announcement premium"], ["Pre-bid speculation", "Pre-bid speculation premium"]];
    const prows = PRM.filter(m => fnum(f, m[1]) != null);
    if (mrows.length || frows.length || prows.length || brows.length) {
      let v = '<div class="vgrid">';
      v += "<div>";
      if (prows.length) {
        const mx = Math.max(10, ...prows.map(p => Math.abs(fnum(f, p[1]))));
        v += '<div class="sh">Bid premia <span>offer price vs share price</span></div><div class="pmx">' + prows.map(p => { const x = fnum(f, p[1]); return '<div class="pmr' + (p[0] === "Pre-bid speculation" ? " hl" : "") + '"><span class="pml">' + esc(p[0]) + '</span><span class="pmt"><i class="' + (x < 0 ? "neg" : "") + '" style="width:' + (Math.abs(x) / mx * 100).toFixed(1) + '%"></i></span><span class="pmv">' + (x >= 0 ? "+" : "") + nf(x, 1) + "%</span></div>"; }).join("") + "</div>";
      }
      if (frows.length) v += '<div class="sh" style="margin-top:' + (prows.length ? 18 : 0) + 'px">Target figures <span>' + esc(ccyLab(ccy).trim() || ccy) + " millions</span></div><table class=\"t\"><tbody>" + frows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n">' + nf(fnum(f, m[1]), 1) + "</td></tr>").join("") + "</tbody></table>";
      v += "</div><div>";
      if (mrows.length) v += '<div class="sh">Valuation multiples and ratios</div><table class="t mult"><thead><tr><th>As recorded on the database</th><th class="r">Value</th></tr></thead><tbody>' + mrows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n x">' + nf(fnum(f, m[1]), 2) + "x</td></tr>").join("") + "</tbody></table>";
      if (brows.length) v += '<div class="sh" style="margin-top:14px">Banking ratios</div><table class="t"><tbody>' + brows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n">' + nf(fnum(f, m[1]), 2) + "%</td></tr>").join("") + "</tbody></table>";
      v += "</div></div>";
      o += card("Valuation", esc(ccy ? (ccyLab(ccy).trim() === "£" ? "£" : ccy) + " millions" : "as recorded"), v, "span3");
    }
    /* advisers */
    const ADV = [["Adviser to bidder", [["Financial", "Bidder's Financial Advisor"], ["Legal", "Bidder's Legal Advisor"]]], ["Adviser to target / divestor", [["Financial", "Target/Divestor's Financial Advisor"], ["Legal", "Target/Divestor's Legal Advisor"]]]];
    if (ADV.some(a => a[1].some(x => fv(f, x[1])))) o += card("Advisers", "Financial and legal advisers to each side", '<div class="adv">' + ADV.map(a => '<div><span class="lab">' + a[0] + "</span><ul>" + (a[1].filter(x => fv(f, x[1])).map(x => "<li><b>" + esc(fv(f, x[1]).replace(/\s+/g, " ")) + "</b><i>" + x[0] + "</i></li>").join("") || '<li class="none">Not recorded</li>') + "</ul></div>").join("") + "</div>", "span3 advw");
    o += "</div>";
    let panels = '<div class="panel" role="tabpanel" data-panel="overview">' + o + "</div>";

    /* --- offer status panel --- */
    if (s) {
      let p = '<div class="grid3 os">';
      p += card("Offer status", "As at " + esc(sAsOf), (s.current_status_note ? '<p class="osnote">' + esc(s.current_status_note) + "</p>" : "") + facts([["Offer regulator", s.offer_regulator], ["Offer structure", s.offer_structure], ["Current status", idx.current_status || s.current_status], ["Offer regime", s.regime], ["Stock exchange", s.exchange], ["French public type", s.french_public_type]]), "span3", "os-top");
      const k1 = num(s.pct_existing_stake) || 0, k2 = num(s.pct_spa) || 0, k3 = num(s.pct_irrevocables) || 0, thr = num(s.acceptance_threshold_pct);
      p += card("1) % the bidder has agreed to acquire", "Stake held + share purchase agreements + irrevocable undertakings / letters of intent",
        '<div class="osstk"><div class="osstkbar">' + [[k1, "k1", "Existing stake"], [k2, "k2", "SPA / block agreed"], [k3, "k3", "Irrevocables / LOIs / support"]].filter(x => x[0] > 0).map(x => '<i class="' + x[1] + '" style="width:' + Math.min(100, x[0]).toFixed(3) + '%" title="' + x[2] + ": " + pctS(x[0]) + '"></i>').join("") + (thr != null ? '<b class="thr" style="left:' + Math.min(100, thr).toFixed(2) + '%" title="Acceptance threshold / vote required: ' + pctS(thr) + '"></b>' : "") + '</div><div class="osstkax"><span>0%</span><span>50%</span><span>100%</span></div></div>' +
        '<ul class="osstkleg"><li><i class="k1"></i><span>Existing stake</span><b>' + pctS(s.pct_existing_stake) + '</b></li><li><i class="k2"></i><span>SPA / block agreed</span><b>' + pctS(s.pct_spa) + '</b></li><li><i class="k3"></i><span>Irrevocables / LOIs / support</span><b>' + pctS(s.pct_irrevocables) + '</b></li><li class="tot"><i></i><span>Total agreed</span><b>' + pctS(s.pct_agreed_total) + "</b></li></ul>" + (s.pct_agreed_note ? '<p class="fine pad">' + esc(s.pct_agreed_note) + "</p>" : ""), "span2");
      p += card("2) Acceptance threshold", "", '<div class="bigterm"><span class="lab">' + esc(/scheme/i.test(s.offer_structure || "") ? "Scheme vote required" : /merger/i.test(s.offer_structure || "") ? "Vote required" : "Acceptance condition") + "</span><b" + (thr == null ? ' class="long"' : "") + ">" + (thr != null ? pctS(thr) : esc(s.acceptance_threshold_text ? "See detail" : "—")) + "</b></div>" + (s.acceptance_threshold_text ? '<p class="fine pad" style="padding-top:12px">' + esc(s.acceptance_threshold_text) + "</p>" : "") + facts([["Threshold lowered", s.acceptance_threshold_lowered]], "c2"), "");
      p += card("3) Offer period", "Takeover / tender offers", facts([["Offer period start", s.acceptance_period_start], ["End (original)", s.acceptance_period_end_original], ["End (current)", s.acceptance_period_end_current], ["Offer period extended", s.offer_period_extended]], "c2") || '<p class="fine pad" style="padding-top:12px">No offer period — see the shareholder meeting.</p>', "");
      p += card("4) Shareholder meeting", "Schemes, US and statutory mergers", facts([["Meeting date", s.shareholder_meeting_date], ["Meeting type", s.shareholder_meeting_type], ["Result", s.shareholder_meeting_result]], "c2"), "");
      p += card("5) Regulatory", "", '<div class="regst"><span class="rg ' + regCls(s.regulatory_status || "") + '">' + esc(s.regulatory_status || "Not recorded") + "</span></div>" + (s.regulatory_detail ? '<p class="fine pad" style="padding-top:10px">' + esc(s.regulatory_detail) + "</p>" : "") + facts([["Phase 2 referral", s.regulatory_referral], ["Other regulatory approval", s.other_regulator_approval]], "c2"), "");
      p += card("6) Acceptances", "", '<div class="bigterm"><span class="lab">Acceptances' + (s.acceptances_date ? " at " + esc(s.acceptances_date) : "") + "</span><b>" + (has(s.acceptances_pct) ? pctS(s.acceptances_pct) : "—") + "</b></div>" + (s.acceptances_note ? '<p class="fine pad" style="padding-top:12px">' + esc(s.acceptances_note) + "</p>" : "") + facts([["Squeeze-out", s.squeeze_out]], "c2"), "");
      const CS = [["AMF approved", "fr_amf_clearance_date"], ["% acquired upfront", "fr_pct_acquired_upfront", pctS], ["Upfront purchase completed", "fr_upfront_purchase_completed_date"], ["Independent expert", "fr_independent_expert"], ["Expert's conclusion", "fr_independent_expert_conclusion"], ["Golden power", "it_golden_power"], ["Consob approved", "it_consob_approval_date"], ["CNMV approved", "es_cnmv_approval_date"], ["BaFin approved", "de_bafin_approval_date"], ["Offer period closed", "de_offer_period_closed_date"], ["Additional period ends", "de_additional_period_end"], ["AFM approved", "nl_afm_approval_date"], ["FSMA approved", "be_fsma_approval_date"], ["US public type", "us_public_type"], ["Break fee (US$m)", "us_break_fee_usd_m"], ["Reverse break fee (US$m)", "us_reverse_break_fee_usd_m"]];
      const cs = CS.filter(c => has(s[c[1]])).map(c => [c[0], c[2] ? c[2](s[c[1]]) : String(s[c[1]])]);
      if (cs.length) p += card("Country specific", esc(s.regime || ""), facts(cs, "c3"), "span3");
      p += "</div>";
      panels += '<div class="panel" role="tabpanel" data-panel="status" hidden>' + p + "</div>";
    }

    /* --- financials --- */
    {
      let p = '<div class="grid3">';
      const FIN = [["Turnover (sales)", "Turnover (Sales)"], ["EBITDA", "EBITDA"], ["EBITA", "EBITA"], ["Operating profit", "Operating profit"], ["Net profit before tax", "Net profit before tax"], ["Net income (earnings)", "Net Income (Earnings)"], ["Shareholders' funds", "Shareholders funds"], ["Net debt", "Net debt"], ["Enterprise value", "Enterprise Value"], ["Implied total equity value", "Implied Total Equity Value"]];
      const rows = FIN.filter(m => fnum(f, m[1]) != null);
      p += card("Target financials", esc(ccy ? ccy + " millions, as recorded" : "as recorded"), rows.length ? '<table class="t"><tbody>' + rows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n">' + nf(fnum(f, m[1]), 1) + "</td></tr>").join("") + "</tbody></table>" : '<p class="fine pad" style="padding-top:14px">No target financials were recorded for this deal (for example where only parent-company accounts are available).</p>', "span2");
      p += card("Multiples", "", mrows.length ? '<table class="t mult"><tbody>' + mrows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n x">' + nf(fnum(f, m[1]), 2) + "x</td></tr>").join("") + "</tbody></table>" : '<p class="fine pad" style="padding-top:14px">None recorded.</p>', "");
      p += "</div>";
      panels += '<div class="panel" role="tabpanel" data-panel="financials" hidden>' + p + "</div>";
    }
    /* --- commentary --- */
    const docPanel = (key, title, parts) => {
      const toc = [], html = [];
      parts.forEach(([txt, pre]) => { if (!txt) return; const n = narrative(txt, pre); toc.push(...n.toc); html.push(html.length ? n.html.replace('<h4 class="first"', '<h4 class=""') : n.html); });
      if (!html.length) return "";
      return '<div class="panel" role="tabpanel" data-panel="' + key + '" hidden><div class="doc"><nav class="outline" aria-label="' + esc(title) + ' contents"><div class="lab">' + esc(title) + "</div>" + toc.map(t => '<a href="#" data-sec="' + t[0] + '">' + esc(t[1]) + "</a>").join("") + '</nav><article class="prose">' + html.join("\n") + "</article></div></div>";
    };
    panels += docPanel("commentary", "Commentary", [[d.overview, "c-o"], [d.profiles, "c-p"], [d.background, "c-b"]]);
    panels += docPanel("payment", "Payment details", [[d.financial_notes, "p"]]);
    /* --- all fields --- */
    {
      const HIDE = /^(pdf_|added_by$|admin_id$|value_note$)/;
      const keys = Object.keys(f).filter(k => !HIDE.test(k) && has(f[k])).sort((a, b) => a.localeCompare(b));
      const base = [["Deal number", no], ["Target", d.target], ["Bidder", d.bidder], ["Divestor", d.seller], ["Target country", d.target_country], ["Bidder country", d.bidder_country], ["Divestor country", d.seller_country], ["Deal type", d.deal_type], ["Deal status", d.deal_status], ["Date announced", MAM.isoToUk(d.date_announced)], ["Currency", d.currency], ["Deal value (m)", d.value], ["Offer price", d.offer_price], ["Shares in issue", d.shares_in_issue != null ? nf(+d.shares_in_issue, 0) : null]];
      panels += '<div class="panel" role="tabpanel" data-panel="data" hidden><div class="grid3">' + card("All fields as recorded", "Report last updated " + esc(MAM.isoToUk(d.updated)), facts(base.concat(keys.map(k => [k, String(f[k]).trim()])), "c3"), "span3") + "</div></div>";
    }
    h += panels;
    h += '<p class="rfoot">M&amp;A Monitor Ltd · Deal ' + esc(no) + " · This report is provided for the use of the licensed subscriber only.</p>";
    return h;
  }

  /* ---------------- behaviour ---------------- */
  const tabtop = () => parseFloat(getComputedStyle(R).getPropertyValue("--tabtop")) || 103;
  function show(k, scroll) {
    const tabs = $$(".rtab [data-tab]", R); if (!tabs.some(t => t.dataset.tab === k)) k = "overview";
    tabs.forEach(t => t.setAttribute("aria-selected", t.dataset.tab === k));
    $$("[data-panel]", R).forEach(p => p.hidden = p.dataset.panel !== k);
    if (scroll !== false) { const bar = $(".rtab", R); if (bar) { const y = bar.getBoundingClientRect().top + window.scrollY - tabtop(); if (window.scrollY > y) window.scrollTo(0, y); } }
    spy();
  }
  function spy() {
    const p = $$("[data-panel]", R).find(p => !p.hidden); if (!p) return;
    const links = $$(".outline a[data-sec]", p); if (!links.length) return;
    const lim = tabtop() + 90; let cur = links[0];
    links.forEach(a => { const h = document.getElementById(a.dataset.sec); if (h && h.getBoundingClientRect().top <= lim) cur = a; });
    links.forEach(a => a.classList.toggle("on", a === cur));
  }
  addEventListener("scroll", () => requestAnimationFrame(spy), { passive: true });
  R.addEventListener("click", e => {
    const t = e.target.closest(".rtab [data-tab]"); if (t) { show(t.dataset.tab); return; }
    const g = e.target.closest("a[data-go]"); if (g) { e.preventDefault(); show(g.dataset.go); return; }
    const a = e.target.closest("a[data-sec]"); if (a) { e.preventDefault(); const el = document.getElementById(a.dataset.sec); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (e.target.closest("#rep-csv")) { e.preventDefault(); exportCsv(); }
  });
  let current = null;
  function exportCsv() {
    if (!current) return;
    const d = current.deal, f = d.fields || {}, s = current.status ? current.status.data : {};
    const rows = [["Deal number", d.deal_number], ["Target", d.target], ["Bidder", d.bidder], ["Divestor", d.seller], ["Target country", d.target_country], ["Bidder country", d.bidder_country], ["Sector", d.sector], ["Deal type", d.deal_type], ["Deal status", d.deal_status], ["Date announced", MAM.isoToUk(d.date_announced)], ["Currency", d.currency], ["Deal value (m)", d.value], ["Offer price", d.offer_price]]
      .concat(Object.keys(f).filter(k => !/^(pdf_|added_by|admin_id|value_note)/.test(k)).map(k => [k, f[k]]))
      .concat(Object.keys(s || {}).filter(k => !/^(notes|web_fields|file)$/.test(k)).map(k => ["Offer status: " + k.replace(/_/g, " "), s[k]]));
    MAM.csv([["Field", 0], ["Value", 1]], rows, "deal_" + d.deal_number + ".csv");
    MAM.log(d.deal_number, "csv");
  }

  async function open(no, tab) {
    if (!no) {
      const last = (() => { try { return sessionStorage.getItem("mam-db-deal"); } catch (e) { return null; } })();
      if (last) { location.replace("#deal/" + last); return; }
      R.innerHTML = '<div class="rep-loading">Choose a deal from the <a href="#search">search</a> or the <a href="#lookup">home page</a>.</div>'; return;
    }
    const idx = MAM.byNo[no];
    if (idx && !idx.has_report) { R.innerHTML = '<div class="rep-loading">Deal ' + esc(no) + " (" + esc(MAM.tc(idx.target)) + ") is in the pending-offers database but its report is not on this site yet.</div>"; return; }
    if (current && current.deal && current.deal.deal_number === no && R.querySelector(".rh")) { if (tab) show(tab, false); return; }
    R.innerHTML = '<div class="rep-loading"><span class="spin" aria-hidden="true"></span> Loading deal ' + esc(no) + "…</div>";
    window.scrollTo(0, 0);
    let res = cache[no];
    if (!res) {
      const { data, error } = await MAM.sb.rpc("db_deal", { p_deal_number: no });
      if (error) { R.innerHTML = '<div class="rep-loading">Could not load deal ' + esc(no) + ": " + esc(error.message) + "</div>"; return; }
      res = data; cache[no] = res;
    }
    if (!res || !res.deal) { R.innerHTML = '<div class="rep-loading">There is no report for deal ' + esc(no) + ' on this site. <a href="#search">Search the DataBase</a>.</div>'; return; }
    if ((location.hash.split("/")[1] || "") !== no) return;     // the user moved on while it loaded
    current = res;
    try { sessionStorage.setItem("mam-db-deal", no); } catch (e) {}
    R.innerHTML = build(no, res);
    show(tab || "overview", false);
    document.title = MAM.tc(res.deal.target) + " · Deal " + no + " · M&A Monitor";
    const nav = $("#rep-nav"); if (nav) nav.textContent = MAM.tc(res.deal.target) + " (" + no + ")";
    MAM.log(no, "view");
  }
  MAM.hooks["show:deal"] = no => { const parts = location.hash.slice(1).split("/"); open(parts[1] || no || "", parts[2]); };
})();
