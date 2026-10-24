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
  const isBulletLine = t => /^[*•▪-]\s+\S/.test(t) && !/\S\s{3,}\S/.test(t.replace(/^[*•▪-]\s+/, ""));
  const isTable = l => !isBulletLine(l.trim()) && (/\S\s{3,}\S/.test(l.trim()) || /^\s{6,}\S/.test(l) || /^\s*[-=_]{4,}\s*$/.test(l));
  const NUMRX = /^\(?-?[£$€]?\s?[\d,]+(\.\d+)?\)?%?x?$|^n\/a$|^-$|^nil$/i;
  // a unit or period line that belongs in a table header ("US$ ('000s)", "£ millions", "Y/E 31/12", "A$'000s")
  const UNIT = /^(y[\/-]e\b|year end|years? ended|period\b|as at\b|half[- ]year|six months|nine months|ttm\b)|^(\(?(£|€|\$|us\$|a\$|c\$|nz\$|hk\$|s\$|[a-z]{3})?\s*'?\(?'?(000s?|'000s?|m|mn|bn|millions?|billions?|thousands?)'?\)?\)?|£|€|\$|us\$)$/i;
  // a short line that can sit inside a table: a units line, a group label or the first half of a two-line label
  const isCaption = t => t.length <= 50 && !/[.;]$/.test(t) && !isHeading(t) && !isSub(t) && !/^[*•▪]\s/.test(t) && !/^(N\.B\.|Note|Source)/i.test(t);
  const isRuleLine = l => /^\s*[-=_]{3,}(\s+[-=_]{3,})*\s*$/.test(l);
  const isNum = v => NUMRX.test(v.replace(/\s/g, ""));
  const isYear = v => /^(19|20)\d\d[a-z]?$/i.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v);
  // cells of a fixed-width text line: runs of text separated by two or more spaces, with their character positions
  const cellsOf = l => { const out = [], re = /\S+(?: \S+)*/g; let m; while ((m = re.exec(l))) out.push({ t: m[0], s: m.index, e: m.index + m[0].length }); return out; };
  // a row that starts a new table rather than continuing one: column headings (years, dates or words, no figures)
  const isHeadLine = l => { const c = cellsOf(l.replace(/\t/g, "    ")); const lead = /^\s{6,}\S/.test(l); const v = lead ? c : c.slice(1); return v.length > 0 && v.every(x => isYear(x.t) || !isNum(x.t)); };

  function tableHtml(lines) {
    const body = lines.filter(l => l.trim());
    // offer terms: "for every X share    250 pence in cash"
    if (body.every(l => /^\s*(for|in exchange for)\s+(every|each)\b/i.test(l) && /\S\s{3,}\S/.test(l))) {
      return '<div class="offterms">' + body.map(l => { const p = l.trim().split(/\s{3,}/); return '<div class="tt"><span class="tt-l">' + esc(p[0].replace(/^./, c => c.toUpperCase())) + '</span><span class="tt-v">' + esc(p.slice(1).join(" ")) + "</span></div>"; }).join("") + "</div>";
    }
    /* 1. rows, with the blank and ruled lines above each */
    const rows = []; let gap = false, rule = false;
    lines.forEach(l0 => {
      const l = l0.replace(/\t/g, "    ").replace(/\s+$/, "");
      if (!l.trim()) { if (rows.length) gap = true; return; }
      if (isRuleLine(l)) { rule = true; return; }
      const cells = cellsOf(l), lead = /^\s{6,}\S/.test(l);
      rows.push({ cells, lead, gap, rule }); gap = false; rule = false;
    });
    /* 2. value columns, found from where the figures end (they are right-aligned in the text) */
    const valsOf = r => r.lead ? r.cells : (r.cells.length > 1 ? r.cells.slice(1) : []);
    let ends = [];
    rows.forEach(r => valsOf(r).forEach(c => { if (isNum(c.t) && !isYear(c.t)) ends.push(c); }));
    if (!ends.length) rows.forEach(r => valsOf(r).forEach(c => ends.push(c)));
    ends.sort((a, b) => a.e - b.e);
    const cols = [];
    ends.forEach(c => { const k = cols[cols.length - 1]; if (k && c.e - k.e <= 2) { k.e = Math.max(k.e, c.e); k.s = Math.min(k.s, c.s); k.n++; } else cols.push({ s: c.s, e: c.e, n: 1 }); });
    // drop stray one-off positions when the table has clear columns
    const strong = cols.filter(k => k.n >= 2);
    const C = strong.length >= 1 && rows.length > 2 ? strong : cols;
    if (!C.length) return '<pre class="ntxt">' + esc(body.join("\n")) + "</pre>";
    const firstColStart = Math.min(...C.map(k => k.s));
    const place = r => {
      // a long label that runs into its first figure with a single space ("... entities 2,470")
      if (!r.lead && r.cells.length) {
        const c0 = r.cells[0], m = /^(.*\S) (\(?-?[\d,]+(\.\d+)?\)?)$/.exec(c0.t);
        if (m && /[A-Za-z]/.test(m[1]) && Math.abs(c0.e - C[0].e) <= 2) r.cells.splice(0, 1, { t: m[1], s: c0.s, e: c0.s + m[1].length }, { t: m[2], s: c0.e - m[2].length, e: c0.e });
      }
      // text that starts before the first column belongs to the label, even if the text used wide spacing
      let vals = valsOf(r), label = r.lead ? "" : r.cells[0].t;
      if (!r.lead) while (vals.length && !isNum(vals[0].t) && vals[0].e < firstColStart - 1) { label += " " + vals[0].t; vals = vals.slice(1); }
      if (!r.lead && r.cells.length === 1) vals = [];
      const out = new Array(C.length).fill(null);
      let ok = true, last = -1;
      vals.forEach(c => {
        let k = C.findIndex(x => Math.abs(x.e - c.e) <= 2);
        if (k < 0) { let best = -1, bo = 0; C.forEach((x, i) => { const o = Math.min(x.e, c.e) - Math.max(x.s, c.s); if (o > bo) { bo = o; best = i; } }); k = best; }
        if (k < 0) { let bd = 1e9; C.forEach((x, i) => { const d = Math.abs((x.s + x.e) / 2 - (c.s + c.e) / 2); if (d < bd) { bd = d; k = i; } }); }
        if (k <= last || out[k] != null) ok = false;
        else { out[k] = c.t; last = k; }
      });
      if (!ok) { out.fill(null); vals.slice(-C.length).forEach((c, i, a) => { out[C.length - a.length + i] = c.t; }); }
      return { label, vals: out, n: vals.length };
    };
    /* 3. header rows (column headings, units and periods) come before the first row of figures */
    const P = rows.map(r => Object.assign(r, place(r)));
    const isData = r => r.vals.some(v => v != null && isNum(v) && !isYear(v));
    let firstData = P.findIndex(isData); if (firstData < 0) firstData = P.length;
    const head = [], data = P.slice(firstData), lead = [];
    P.slice(0, firstData).forEach(r => { if (r.n === 0 && !UNIT.test(r.label)) lead.push(r); else head.push(r); });
    data.unshift(...lead);
    const ncol = C.length + 1;
    const td = v => { if (v == null) return "<td></td>"; const n = isNum(v); return "<td" + (n ? ' class="num' + (/^(-|nil|n\/a)$/i.test(v.trim()) ? " z" : "") + (/\)$/.test(v) ? "" : " ps") + '"' : "") + ">" + esc(v) + "</td>"; };
    let th = "", units = [];
    const headRows = head.filter(r => r.n > 0);
    head.forEach(r => { if (r.n === 0) units.push(r.label); });
    if (headRows.length) {
      headRows.forEach((r, i) => {
        let lab = esc(r.label);
        if (i === 0 && units.length) lab += lab ? ' <span class="u">' + esc(units.join(" · ")) + "</span>" : '<span class="u" style="margin-left:0">' + esc(units.join(" · ")) + "</span>";
        th += "<tr><th>" + lab + "</th>" + r.vals.map(v => '<th class="r">' + (v == null ? "" : esc(v)) + "</th>").join("") + "</tr>";
      });
    } else if (units.length) {
      th = '<tr><th colspan="' + ncol + '"><span class="u" style="margin-left:0">' + esc(units.join(" · ")) + "</span></th></tr>";
    }
    /* 4. figures: group labels, two-line labels joined, subtotals under a ruled line */
    let tb = "", seen = 0, lastGrp = false;
    for (let i = 0; i < data.length; i++) {
      const r = data[i], nx = data[i + 1];
      if (r.n === 0) {
        // the first half of a label that carries on in lower case on the next line
        if (nx && !nx.gap && !nx.rule && nx.n > 0 && /^[a-z(&]/.test(nx.label)) { nx.label = r.label + " " + nx.label; nx.gap = nx.gap || r.gap; nx.rule = nx.rule || r.rule; continue; }
        if (r.gap && seen && !lastGrp) tb += '<tr class="gap"><td colspan="' + ncol + '"></td></tr>';
        tb += '<tr class="grp"><td colspan="' + ncol + '">' + esc(r.label) + "</td></tr>"; lastGrp = true; continue;
      }
      if (r.gap && seen && !r.rule && !lastGrp) tb += '<tr class="gap"><td colspan="' + ncol + '"></td></tr>';
      lastGrp = false;
      const tot = r.rule || (seen > 0 && /^total\b/i.test(r.label) && (!nx || nx.gap || nx.rule || nx.n === 0));
      tb += "<tr" + (tot ? ' class="tot"' : "") + "><td>" + esc(r.label) + "</td>" + r.vals.map(td).join("") + "</tr>";
      seen++;
    }
    return '<div class="ntab"><table>' + (th ? "<thead>" + th + "</thead>" : "") + "<tbody>" + tb + "</tbody></table></div>";
  }
  const isRuleOnly = (lines, k) => isRuleLine(lines[k]) && !(lines.slice(k + 1, k + 3).some(l => isTable(l) && !isRuleLine(l)));
  function narrative(text, prefix, skipFirstHeading) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const wrap = Math.max(80, ...lines.map(l => l.length).filter(n => n < 160));
    const out = [], toc = [];
    let para = [], list = null, first = true, firstHead = true, src = false;
    const joinLines = a => a.reduce((acc, l) => !acc ? l : (/[A-Za-z]-$/.test(acc) && /^[a-z]/.test(l) ? acc + l : acc + " " + l), "");
    const flushP = () => { if (para.length) { out.push((list ? "<li>" : "<p>") + esc(joinLines(para).replace(/\s+/g, " ").trim()) + (list ? "</li>" : "</p>")); para = []; } };
    const closeList = () => { flushP(); if (list) { out.push("</ul>"); list = null; } };
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i], t = raw.trim();
      if (!t) { closeList(); continue; }
      if (isHeading(t)) {
        closeList();
        src = /^SOURCES?(\s+USED)?$/.test(t);
        if (firstHead && skipFirstHeading) { firstHead = false; continue; }
        firstHead = false;
        const id = prefix + "-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + toc.length;
        const tt = titleCase(t);
        out.push('<h4 class="' + (first ? "first" : "") + '" id="' + id + '">' + esc(tt) + "</h4>"); toc.push([id, tt]); first = false; continue;
      }
      // under SOURCES USED every line is one source (a document or a website), so each is its own list item
      if (src && !isTable(raw)) {
        flushP();
        if (!list) { out.push('<ul class="srcs">'); list = true; }
        const s = t.replace(/^[*•▪-]\s+/, ""), web = /^(https?:\/\/|www\.)[^\s<>"]+$/i.test(s);
        out.push("<li>" + (web ? '<a href="' + esc(/^https?:/i.test(s) ? s : "https://" + s) + '" target="_blank" rel="noopener">' + esc(s) + "</a>" : esc(s)) + "</li>");
        first = false; continue;
      }
      // a table, or a units line ("£ millions") just above one
      const unitStart = UNIT.test(t) && (isTable(lines[i + 1] || "") || (!(lines[i + 1] || "").trim() && isTable(lines[i + 2] || "")));
      if (isTable(raw) || unitStart) {
        closeList();
        const blk = [raw];
        let j = i + 1;
        while (j < lines.length) {
          if (isTable(lines[j])) { blk.push(lines[j]); i = j++; continue; }
          // blank lines and short caption lines (units, group labels, the first half of a two-line label) stay
          // in the table when more of it follows; a new set of column headings after a gap starts a new table
          let k = j, caps = 0, blanks = 0;
          while (k < lines.length) {
            const tk = lines[k].trim();
            if (!tk) { if (++blanks > 2) break; k++; continue; }
            if (isTable(lines[k])) break;
            if (isCaption(tk) && ++caps <= 2) { k++; continue; }
            break;
          }
          if (k < lines.length && k > j && isTable(lines[k]) && !(isHeadLine(lines[k]) && (blanks || caps)) && !isRuleOnly(lines, k)) {
            for (; j < k; j++) blk.push(lines[j]);
            continue;
          }
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
  // a pre-bid premium of -100 is how the database records "not available" (e.g. possible offers)
  const PREBID = "Pre-bid speculation premium";
  const pval = (f, k) => { const x = fnum(f, k); return k === PREBID && x != null && x <= -100 ? null : x; };

  /* ---------------- sector comparison ----------------
     This deal's multiples and pre-bid premium against the sector medians from db_sector_comparison():
     the other companies in the deal's first-listed sector on the DataBase, and for UK & Irish public offers
     the premium from Offer Statistics. */
  const CMP_MIN = 5;   // fewest other deals for a sector median to be shown
  const CMP = [["EV / EBITDA", "Enterprise Value/EBITDA"], ["EV / Sales", "Enterprise Value/Sales"], ["EV / EBITA", "Enterprise Value/EBITA"], ["EV / EBIT", "Enterprise Value/EBIT"],
    ["Price / Earnings", "Price/Earnings"], ["Price / Sales", "Price/Sales"], ["Price / Book", "Price/Book"], ["Price / Bank earnings", "Price/Bank Earnings"]];
  const plural = (n, w) => n.toLocaleString("en-GB") + " " + w + (n === 1 ? "" : "s");
  const signed = (v, dp) => { const r = +v.toFixed(dp); return (r > 0 ? "+" : "") + nf(r, dp); };
  const cmpBar = (dv, cap, hl) => { const w = Math.max(1.5, Math.min(1, Math.abs(dv) / cap) * 50); return '<span class="scb' + (hl ? " hl" : "") + '" aria-hidden="true"><i class="' + (dv < 0 ? "neg" : "pos") + '" style="width:' + w.toFixed(1) + '%"></i></span>'; };
  function sectorCmp(f, c) {
    if (!c || !c.sector) return "";
    const sec = c.sector.replace(/\s*\((standard|banking) template\)$/i, "");
    const rows = [];
    CMP.forEach(([lab, key]) => {
      const x = fnum(f, key); if (x == null || x <= 0) return;
      const [med, n] = (c.m || {})[key] || [null, 0], ok = med != null && n >= CMP_MIN, dv = ok ? (x / med - 1) * 100 : null;
      rows.push({ lab, sub: ok ? "median of " + plural(n, "deal") : n ? "only " + plural(n, "other deal") : "no other deals yet",
        x: nf(x, 2) + "x", m: ok ? nf(med, 2) + "x" : "—", bar: ok ? cmpBar(dv, 100) : "", vs: ok ? signed(dv, 0) + "%" : "" });
    });
    const p = pval(f, PREBID), cp = c.prem;
    let premNote = "";
    if (p != null && cp) {
      const ok = cp.med != null && cp.n >= CMP_MIN, dv = ok ? p - cp.med : null;
      const sub = ok ? esc("median of " + plural(cp.n, cp.src === "stats" ? "UK & Irish offer" : "public offer")) + (cp.src === "stats" ? ' · <a href="#arb-stats">Offer Statistics</a>' : "")
        : cp.n ? "only " + plural(cp.n, "other offer") : "no other offers yet";
      rows.push({ hl: true, lab: "Pre-bid premium", sub,
        x: signed(p, 1) + "%", m: ok ? signed(cp.med, 1) + "%" : "—", bar: ok ? cmpBar(dv, 50, true) : "", vs: ok ? signed(dv, 1) + " pts" : "" });
      if (ok) premNote = cp.src === "stats" ? " The premium median is for UK &amp; Irish firm offers in the sector since " + esc(cp.since || 2008) + ", from Offer Statistics." : " The premium median is for the other public offers in the sector on the DataBase.";
    }
    if (!rows.length) return "";
    return '<div class="sh scmp-h">Sector comparison <span>' + esc(sec) + '</span></div><table class="t scmp"><thead><tr><th>Multiple</th><th class="rr">This deal</th><th class="rr">Sector median</th><th class="scbc"><span class="vh">Comparison</span></th><th class="rr">vs sector</th></tr></thead><tbody>' +
      rows.map(r => "<tr" + (r.hl ? ' class="pre"' : "") + '><td><span class="scl">' + esc(r.lab) + "</span><small>" + r.sub + '</small></td><td class="n x">' + r.x + '</td><td class="n">' + r.m + '</td><td class="scbc">' + r.bar + '</td><td class="n scv">' + r.vs + "</td></tr>").join("") +
      '</tbody></table><p class="fine">Sector medians are for the other companies in ' + esc(sec) + " on the DataBase with that multiple recorded (zero and negative multiples are left out), shown where there are at least " + CMP_MIN + "." + premNote + "</p>";
  }

  /* ---------------- report ---------------- */
  /* ---------------- source documents (Documents tab) ---------------- */
  // File names follow the deal-folder convention "<Entity> <document> DD-MM-YY(tag)(tag).ext"
  const DOC_DIRS = [["Press releases", "Date"], ["Circulars", "Date"], ["Accounts", "Period end"], ["Other", "Date"]];
  const DOC_TAGS = { ann: "Announcement", "8k": "Form 8-K", "10k": "Form 10-K", "10q": "Form 10-Q", "20f": "Form 20-F", "6k": "Form 6-K", "ad hoc": "Ad hoc" };
  const docType = n => { const e = (n.split(".").pop() || "").toLowerCase(); return /^docx?$/.test(e) ? ["doc", "DOC"] : /^pptx?$/.test(e) ? ["ppt", "PPT"] : /^xlsx?$/.test(e) ? ["xls", "XLS"] : ["pdf", "PDF"]; };
  const docSize = b => !b ? "" : b >= 1048576 ? nf(b / 1048576, 1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  function docTitle(n) {
    let s = n.replace(/\.[a-z0-9]{2,5}$/i, "");
    const tags = [];
    s = s.replace(/\(([^()]*)\)/g, (m, t) => { t = t.trim(); if (t) tags.push(DOC_TAGS[t.toLowerCase()] || t.charAt(0).toUpperCase() + t.slice(1)); return " "; });
    s = s.replace(/(^|\s)\d{2}-\d{2}-\d{2}(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
    return { title: s || n, tags };
  }
  MAM.docTitle = docTitle; MAM.docType = docType;      // also used by the word search results (database.js)
  function docsCard(docs) {
    const groups = DOC_DIRS.map(([dir, when]) => [dir, when, docs.filter(x => x.dir === dir)]).filter(g => g[2].length);
    const body = groups.map(([dir, when, list]) => '<div class="dgrp"><div class="sh">' + esc(dir) + " <span>" + list.length + "</span></div>" +
      '<div class="dhd" aria-hidden="true"><span></span><span>Document</span><span>' + when + '</span><span class="r">Size</span><span></span></div><ul class="dlist">' +
      list.map(x => {
        const i = docs.indexOf(x), t = docTitle(x.name), ft = docType(x.name), dt = x.date ? MAM.isoToUk(x.date) : "", sz = docSize(x.size);
        return '<li><span class="ft ' + ft[0] + '">' + ft[1] + '</span><div class="dn"><a href="#" data-doc="' + i + '" data-open="1" title="' + (ft[0] === "pdf" ? "Open" : "Download") + " " + esc(x.name) + '">' + esc(t.title) + "</a>" +
          t.tags.map(g => '<span class="tg">' + esc(g) + "</span>").join("") + '<span class="fn">' + esc(x.name) + '</span><span class="mm">' + [dt, sz].filter(Boolean).join(" · ") + "</span></div>" +
          '<span class="dd">' + esc(dt) + '</span><span class="dz">' + esc(sz) + '</span><a class="ib" href="#" data-doc="' + i + '" title="Download ' + esc(x.name) + '">' + DL + "</a></li>";
      }).join("") + "</ul></div>").join("");
    return '<div class="grid3">' + card("Documents", docs.length + " source document" + (docs.length === 1 ? "" : "s") + " for this deal: announcements, circulars, accounts and other filings", '<div class="docs">' + body + "</div>", "span3") + "</div>";
  }
  async function openDoc(i, view) {
    const x = current && current.docs && current.docs[+i]; if (!x) return;
    const inline = view && docType(x.name)[0] === "pdf";
    // open the tab straight away (inside the click) so the browser does not block it, then point it at the file
    const w = inline ? window.open("", "_blank") : null;
    const { data, error } = await MAM.sb.storage.from(MAM_CONFIG.pdfBucket).createSignedUrl(x.path, 300, inline ? undefined : { download: x.name });
    if (error || !data) { if (w) w.close(); MAM.toast("Could not fetch the document: " + (error ? error.message : "unknown error"), true); return; }
    if (w) { try { w.opener = null; } catch (e) {} w.location.href = data.signedUrl; }
    else { const a = document.createElement("a"); a.href = data.signedUrl; a.rel = "noopener"; if (inline) a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); }
    MAM.log(current.deal.deal_number, "doc");
  }

  function build(no, res) {
    const d = res.deal, s = res.status ? res.status.data : null, sAsOf = res.status ? MAM.isoToUk(res.status.as_of) : "";
    const f = d.fields || {}, idx = MAM.byNo[no] || {};
    const ccy = d.currency || (s && s.currency) || "", pub = !!d.is_public;
    const T = MAM.tc(d.target), B = MAM.tc(fv(f, "Ultimate Bidder") || d.bidder), V = fv(f, "pdf_bidding_subsidiary"), D = d.seller || fv(f, "Ultimate Divestor name");
    /* The database records its value and financial fields (Implied Total Equity Value, Enterprise Value, Net debt,
       Turnover, EBITDA ...) in sterling, converted from the deal's currency. The deal value is in the deal's currency. */
    const GBP = "£", sterling = /^(STG|GBP)$/i.test(ccy);
    const eqGbp = fnum(f, "Implied Total Equity Value"), dealV = has(d.value) && isFinite(+d.value) ? +d.value : null;
    const ev = fnum(f, "Enterprise Value"), nd = fnum(f, "Net debt");
    const prem = pval(f, PREBID), evebitda = fnum(f, "Enterprise Value/EBITDA"), ebitda = fnum(f, "EBITDA");
    const status = d.deal_status || "Pending", stc = status.split(" ")[0];
    const pctFor = s && has(s.pct_bid_for) ? num(s.pct_bid_for) : null, pctOwned = s && has(s.pct_owned) ? num(s.pct_owned) : null;
    const xb = idx.cross_border || (d.target_country && d.bidder_country ? (d.target_country === d.bidder_country ? "No" : "Yes") : "");
    /* header */
    let h = '<header class="rh"><div><div class="eyebrow">Transaction report · Deal ' + esc(no) + (d.sector ? " · " + esc(d.sector.replace(/\s+\/\s+/g, " / ")) : "") + "</div><h1>" + esc(T) + "</h1>";
    h += '<div class="dline"><span><b>' + esc(V && MAM.tc(V) !== B ? MAM.tc(V) : B) + "</b>" + (V && MAM.tc(V) !== B ? " <em>(" + esc(B) + ")</em>" : "") + "</span>" + ARROW + "<span><b>" + esc(T) + "</b>" + (pctFor != null ? " <em>" + pctS(pctFor) + "</em>" : "") + "</span>" + (D ? '<span class="dv"><em>from</em> <b>' + esc(MAM.tc(D)) + "</b></span>" : "") + "</div>";
    const nxt = (res.events || []).filter(e => e.ty !== "ann" && dts(e.d) >= today).sort((a, b) => dts(a.d) - dts(b.d))[0];
    h += '<div class="chips">' + (nxt ? '<a class="ch nxt" href="#calendar" data-cal-q="' + esc(T) + '">Next: ' + esc(nxt.l) + " · " + new Date(dts(nxt.d)).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + "</a>" : "") + '<span class="stat stat-' + esc(stc) + '">' + esc(status) + "</span>" + (d.date_announced ? '<span class="ch">Announced ' + esc(MAM.longDate(d.date_announced)) + "</span>" : "") + (d.deal_type ? '<span class="ch">' + esc(d.deal_type.replace(/\s+\/\s+/g, " · ")) + "</span>" : "") + (fv(f, "Deal Attitude") ? '<span class="ch">' + esc(fv(f, "Deal Attitude")) + "</span>" : "") + (fv(f, "Consideration type") ? '<span class="ch">' + esc(fv(f, "Consideration type")) + "</span>" : "") + (xb ? '<span class="ch">' + (xb === "Yes" ? "Cross-border" : esc(d.target_country) + " domestic") + "</span>" : "") + "</div></div>";
    h += '<div class="acts">' + (MAM.followBtn ? MAM.followBtn(no) : "") + (d.pdf ? '<a class="btn" href="#" data-pdf="' + esc(no) + '">' + DL + "PDF</a>" : "") + '<a class="btn ghost" href="#" id="rep-csv">Export data</a>' +
      (MAM.me && MAM.me.role === "admin" && MAM.prices ? '<label class="btn ghost" title="Load a Morningstar share price download (CSV) as this deal\'s target share price">Share prices<input type="file" accept=".csv,text/csv" id="rep-prices" hidden></label>' : "") +
      "</div></header>" + '<div id="pr-load" class="pr-load" hidden></div>';
    /* KPI strip */
    const k = [];
    if (pub && d.offer_price != null) { const op = offerPrice(+d.offer_price, d.offer_currency || ccy); k.push(["Offer price", "<small>" + esc(op.pre) + "</small>" + op.v + (op.u ? "<small>" + op.u + "</small>" : ""), "per share" + (fv(f, "Consideration type") ? " · " + esc(fv(f, "Consideration type").toLowerCase()) : "")]); }
    if (dealV != null || eqGbp != null) {
      const sub = (pctFor != null ? pctS(pctFor) + " bid for" : pub ? "100% equity" : dealV != null ? "consideration" : "implied 100% equity") +
        (dealV != null && !sterling && eqGbp != null ? " · " + GBP + nf(eqGbp, 1) + "m" : "");
      k.push([pub ? "Equity value" : "Deal value", (dealV != null ? esc(ccyLab(ccy)) + nf(dealV, 1) : GBP + nf(eqGbp, 1)) + "<small>m</small>", sub]);
    }
    if (ev != null) k.push(["Enterprise value", GBP + nf(ev, 1) + "<small>m</small>", nd != null ? "incl. " + GBP + nf(Math.abs(nd), 1) + "m net " + (nd < 0 ? "funds" : "debt") : ""]);
    if (evebitda != null) k.push(["EV / EBITDA", nf(evebitda, 2) + "<small>x</small>", ebitda != null ? "EBITDA " + GBP + nf(ebitda, 1) + "m" : ""]);
    else if (fnum(f, "Enterprise Value/Sales") != null) k.push(["EV / Sales", nf(fnum(f, "Enterprise Value/Sales"), 2) + "<small>x</small>", fnum(f, "Turnover (Sales)") != null ? "Sales " + GBP + nf(fnum(f, "Turnover (Sales)"), 1) + "m" : ""]);
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
    // clients see the Share price tab once there are 20 days of prices (the daily download adds one day at a time);
    // admins see it from the first day
    const pDays = res.prices && Array.isArray(res.prices.rows) ? res.prices.rows.length : 0;
    const prices = MAM.prices && pDays && (pDays >= 20 || (MAM.me && MAM.me.role === "admin")) ? res.prices : null;
    if (prices) tabs.push(["prices", "Share price"]);
    tabs.push(["financials", "Financials"]);
    if (d.overview || d.profiles || d.background) tabs.push(["commentary", "Commentary"]);
    if (d.financial_notes) tabs.push(["payment", "Payment details"]);
    if (d.target_details) tabs.push(["target", "Target details"]);
    const docs = Array.isArray(res.docs) ? res.docs : [];
    if (docs.length) tabs.push(["docs", 'Documents <span class="cnt">' + docs.length + "</span>"]);
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
    const prows = PRM.filter(m => pval(f, m[1]) != null);
    if (mrows.length || frows.length || prows.length || brows.length) {
      let v = '<div class="vgrid">';
      v += "<div>";
      if (prows.length) {
        const mx = Math.max(10, ...prows.map(p => Math.abs(pval(f, p[1]))));
        v += '<div class="sh">Bid premia <span>offer price vs share price</span></div><div class="pmx">' + prows.map(p => { const x = pval(f, p[1]); return '<div class="pmr' + (p[0] === "Pre-bid speculation" ? " hl" : "") + '"><span class="pml">' + esc(p[0]) + '</span><span class="pmt"><i class="' + (x < 0 ? "neg" : "") + '" style="width:' + (Math.abs(x) / mx * 100).toFixed(1) + '%"></i></span><span class="pmv">' + (x >= 0 ? "+" : "") + nf(x, 1) + "%</span></div>"; }).join("") + "</div>";
      }
      if (frows.length) v += '<div class="sh" style="margin-top:' + (prows.length ? 18 : 0) + 'px">Target figures <span>£ millions</span></div><table class="t"><tbody>' + frows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n">' + nf(fnum(f, m[1]), 1) + "</td></tr>").join("") + "</tbody></table>";
      v += "</div><div>";
      if (mrows.length) v += '<div class="sh">Valuation multiples and ratios</div><table class="t mult"><thead><tr><th>As recorded on the database</th><th class="r">Value</th></tr></thead><tbody>' + mrows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n x">' + nf(fnum(f, m[1]), 2) + "x</td></tr>").join("") + "</tbody></table>";
      v += sectorCmp(f, res.cmp);
      if (brows.length) v += '<div class="sh" style="margin-top:14px">Banking ratios</div><table class="t"><tbody>' + brows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n">' + nf(fnum(f, m[1]), 2) + "%</td></tr>").join("") + "</tbody></table>";
      v += "</div></div>";
      o += card("Valuation", sterling || !ccy ? "£ millions" : "£ millions, as recorded on the DataBase (deal currency " + esc(ccy) + ")", v, "span3");
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
      const fxNote = !sterling && ccy && dealV != null && rows.length ? '<p class="fine pad" style="padding-top:12px">The DataBase records these figures in sterling. The deal value in ' + esc(ccy) + " is " + esc(ccyLab(ccy)) + nf(dealV, 1) + "m.</p>" : "";
      p += card("Target financials", "£ millions, as recorded", rows.length ? '<table class="t"><tbody>' + rows.map(m => "<tr><td>" + esc(m[0]) + '</td><td class="n">' + nf(fnum(f, m[1]), 1) + "</td></tr>").join("") + "</tbody></table>" + fxNote : '<p class="fine pad" style="padding-top:14px">No target financials were recorded for this deal (for example where only parent-company accounts are available).</p>', "span2");
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
    panels += docPanel("target", "Target details", [[d.target_details, "t"]]);
    /* --- share price --- */
    if (prices) panels += '<div class="panel" role="tabpanel" data-panel="prices" hidden>' + MAM.prices.card(d, f, prices) + "</div>";
    /* --- source documents --- */
    if (docs.length) panels += '<div class="panel" role="tabpanel" data-panel="docs" hidden>' + docsCard(docs) + "</div>";
    /* --- all fields --- */
    {
      const HIDE = /^(pdf_|added_by$|admin_id$|value_note$)/;
      const keys = Object.keys(f).filter(k => !HIDE.test(k) && has(f[k])).sort((a, b) => a.localeCompare(b));
      const base = [["Deal number", no], ["Target", d.target], ["Bidder", d.bidder], ["Divestor", d.seller], ["Target country", d.target_country], ["Bidder country", d.bidder_country], ["Divestor country", d.seller_country], ["Deal type", d.deal_type], ["Deal status", d.deal_status], ["Date announced", MAM.isoToUk(d.date_announced)], ["Currency", d.currency], ["Deal value (m)", d.value], ["Offer price", d.offer_price], ["Shares in issue", d.shares_in_issue != null ? nf(+d.shares_in_issue, 0) : null]];
      panels += '<div class="panel" role="tabpanel" data-panel="data" hidden><div class="grid3">' + card("All fields as recorded", "Report last updated " + esc(MAM.isoToUk(d.updated)) + " · deal value in " + esc(ccy === "STG" ? "GBP" : ccy || "the deal currency") + ", other values and financial figures in £ millions", facts(base.concat(keys.map(k => [k, String(f[k]).trim()])), "c3"), "span3") + "</div></div>";
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
  R.addEventListener("change", e => {
    if (e.target.id !== "rep-prices" || !e.target.files.length || !current) return;
    const no = current.deal.deal_number, file = e.target.files[0]; e.target.value = "";
    MAM.prices.load(file, current.deal, $("#pr-load", R), () => { delete cache[no]; current = null; open(no, "prices"); });
  });
  R.addEventListener("click", e => {
    const t = e.target.closest(".rtab [data-tab]"); if (t) { show(t.dataset.tab); return; }
    const g = e.target.closest("a[data-go]"); if (g) { e.preventDefault(); show(g.dataset.go); return; }
    const a = e.target.closest("a[data-sec]"); if (a) { e.preventDefault(); const el = document.getElementById(a.dataset.sec); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const dc = e.target.closest("a[data-doc]"); if (dc) { e.preventDefault(); openDoc(dc.dataset.doc, !!dc.dataset.open); return; }
    if (e.target.closest("#rep-csv")) { e.preventDefault(); exportCsv(); }
  });
  let current = null;
  function exportCsv() {
    if (!current) return;
    const d = current.deal, f = d.fields || {}, s = current.status ? current.status.data : {};
    const rows = [["Deal number", d.deal_number], ["Target", d.target], ["Bidder", d.bidder], ["Divestor", d.seller], ["Target country", d.target_country], ["Bidder country", d.bidder_country], ["Sector", d.sector], ["Deal type", d.deal_type], ["Deal status", d.deal_status], ["Date announced", MAM.isoToUk(d.date_announced)], ["Currency", d.currency], ["Deal value (m)", d.value], ["Offer price", d.offer_price], ["Currency of the other values and financial figures", "GBP (millions, as recorded on the DataBase)"]]
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
      // the sector comparison and the documents are extra: if either fails the report still opens without it
      const [{ data, error }, cmp, docs, prices] = await Promise.all([MAM.sb.rpc("db_deal", { p_deal_number: no }),
        MAM.sb.rpc("db_sector_comparison", { p_deal: no }).then(r => r.error ? null : r.data, () => null),
        MAM.sb.rpc("db_deal_documents", { p_deal_number: no }).then(r => r.error ? [] : r.data || [], () => []),
        MAM.sb.rpc("db_deal_prices", { p_deal_number: no }).then(r => r.error ? null : r.data, () => null)]);
      if (error) { R.innerHTML = '<div class="rep-loading">Could not load deal ' + esc(no) + ": " + esc(error.message) + "</div>"; return; }
      res = data; if (res) { res.cmp = cmp; res.docs = docs; res.prices = prices; } cache[no] = res;
    }
    if (!res || !res.deal) { R.innerHTML = '<div class="rep-loading">There is no report for deal ' + esc(no) + ' on this site. <a href="#search">Search the DataBase</a>.</div>'; return; }
    if ((location.hash.split("/")[1] || "") !== no) return;     // the user moved on while it loaded
    current = res;
    try { sessionStorage.setItem("mam-db-deal", no); } catch (e) {}
    R.innerHTML = build(no, res);
    show(tab || "overview", false);
    if (res.prices && MAM.prices) MAM.prices.mount(R, res.deal, res.deal.fields || {}, res.prices);
    document.title = MAM.tc(res.deal.target) + " · Deal " + no + " · M&A Monitor";
    const nav = $("#rep-nav"); if (nav) nav.textContent = MAM.tc(res.deal.target) + " (" + no + ")";
    MAM.log(no, "view");
    if (MAM.followOpened) MAM.followOpened(no);
  }
  MAM.hooks["show:deal"] = no => { const parts = location.hash.slice(1).split("/"); open(parts[1] || no || "", parts[2]); };
})();
