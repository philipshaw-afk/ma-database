/* Grapevine strip: links to the Grapevine site and a ticker of its latest news.
   Grapevine's own access rules apply (DIANA team + Grapevine readers): other users see a short note instead of the news. */
(function () {
  "use strict";
  const MAM = window.MAM, { $, esc, sb } = MAM;
  const GV = "https://grapevine.ma-dealboard.co.uk/";
  const bar = $("#gvbar"), track = $("#gv-track"), tick = $("#gv-tick");
  let timer = null;
  const short = t => String(t || "").replace(/\s*\(.*$/, "").trim();
  const STAGE = s => { const k = String(s || "").toLowerCase(); return /agreed|signed|binding/.test(k) ? "ok" : /exclusive|bids|talks|offer/.test(k) ? "hot" : /sale|review|process/.test(k) ? "sale" : "rum"; };
  const day = d => { if (!d) return ""; const t = MAM.isoToTs(d), n = new Date(), today = +new Date(n.getFullYear(), n.getMonth(), n.getDate()); const diff = Math.round((today - t) / 864e5); return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };

  function fill(items) {
    const one = items.map(u => {
      const s = u.gv_situations || {};
      return '<a class="gv-item" href="' + GV + "#sit-" + encodeURIComponent(s.slug || "") + '" target="_blank" rel="noopener" title="' + esc((s.target || "") + " — " + (u.headline || "")) + '">' +
        '<span class="gv-d">' + esc(day(u.update_date)) + "</span>" +
        (u.stage ? '<span class="gv-st gv-' + STAGE(u.stage) + '">' + esc(u.stage) + "</span>" : "") +
        "<b>" + esc(short(s.target) || s.title || "") + "</b>" +
        '<span class="gv-h">' + esc(u.headline || "") + "</span></a>";
    }).join('<span class="gv-sep" aria-hidden="true">•</span>');
    // two copies side by side so the scroll loops seamlessly; the copy is hidden from screen readers
    track.innerHTML = '<div class="gv-run">' + one + '<span class="gv-sep" aria-hidden="true">•</span></div><div class="gv-run" aria-hidden="true">' + one.replace(/<a /g, '<a tabindex="-1" ') + '<span class="gv-sep">•</span></div>';
    requestAnimationFrame(() => {
      const w = track.firstElementChild ? track.firstElementChild.scrollWidth : 0;
      track.style.setProperty("--gv-dur", Math.max(30, Math.round(w / 55)) + "s");   // about 55 px a second
      track.classList.toggle("go", w > tick.clientWidth * 0.6);
    });
  }
  function teaser() {
    track.classList.remove("go");
    track.innerHTML = '<div class="gv-run gv-teaser">European M&amp;A situations before they are announced, updated daily. <a href="' + GV + '" target="_blank" rel="noopener">Find out more</a></div>';
  }
  async function load() {
    const [{ data: can }, res] = await Promise.all([
      sb.rpc("gv_can_read"),
      sb.from("gv_updates").select("update_date,stage,headline,created_at,gv_situations(slug,title,target)").order("update_date", { ascending: false }).order("created_at", { ascending: false }).limit(25)
    ]);
    bar.hidden = false;
    if (can !== true || res.error || !res.data || !res.data.length) { teaser(); return; }
    fill(res.data);
  }
  MAM.hooks.signedIn = () => { load().catch(e => { console.warn("Grapevine ticker:", e); bar.hidden = true; }); clearInterval(timer); timer = setInterval(() => load().catch(() => {}), 5 * 60 * 1000); };
  MAM.hooks.signedOut = () => { clearInterval(timer); bar.hidden = true; track.innerHTML = ""; };
  // pause on hover / keyboard focus
  tick.addEventListener("focusin", () => track.classList.add("paused"));
  tick.addEventListener("focusout", () => track.classList.remove("paused"));
})();
