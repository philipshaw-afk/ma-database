/* Data loading and screen wiring */
(function () {
  "use strict";
  const MAM = window.MAM, { $, sb } = MAM;

  MAM.hooks.load = async function () {
    $("#boot-msg").textContent = "Loading the DataBase…";
    const [ix, ev, meta] = await Promise.all([
      sb.rpc("db_deal_index"),
      sb.from("db_offer_events").select("event_date,kind,label,detail,deal_no,target,bidder,region,link").order("event_date").limit(5000),
      sb.from("db_meta").select("key,value")
    ]);
    if (ix.error) throw ix.error;
    const M = {}; (meta.data || []).forEach(r => { M[r.key] = r.value; });
    MAM.statusCols = M.offer_status_cols || [];
    MAM.buildDeals(ix.data);
    if (!MAM.statusAsOfText && M.offer_status_as_of) MAM.statusAsOfText = M.offer_status_as_of;
    MAM.events = (ev.data || []).slice().sort((a, b) => a.event_date < b.event_date ? -1 : a.event_date > b.event_date ? 1 : 0).map(e => ({ d: e.event_date, ty: e.kind, l: e.label || "", x: e.detail || "", dno: e.deal_no || "", n: e.target || "", b: e.bidder || "", r: e.region || "", lk: e.link || "" }));
    window.MAM_initCalendar();
  };

  MAM.hooks["show:calendar"] = () => { if (window.__calRender) window.__calRender(); };

  /* ARB-Insight statistics load on first visit */
  let statsP = null;
  const sec = $('[data-screen="arb-stats"]');
  function ensureStats() {
    if (!statsP) statsP = (async () => {
      const { data, error } = await sb.rpc("db_uk_offer_stats");
      if (error) throw error;
      MAM.ukStats = data;
      if (!data || !data.R || !data.R.length) return false;
      window.MAM_initStats(); window.MAM_initRevisions();
      return true;
    })().catch(e => { statsP = null; throw e; });
    return statsP;
  }
  async function showStats() {
    const msg = $("#os-load"), grid = sec.querySelector(".os-grid");
    if (!MAM.ukStats) { msg.hidden = false; msg.innerHTML = '<span class="spin" aria-hidden="true"></span> Loading the offer statistics…'; grid.hidden = true; }
    let ok;
    try { ok = await ensureStats(); }
    catch (e) { msg.hidden = false; msg.textContent = "Could not load the offer statistics: " + (e.message || e); return; }
    if (!ok) { msg.hidden = false; grid.hidden = true; msg.innerHTML = "The UK offer statistics have not been loaded yet." + (MAM.me.role === "admin" ? ' Load them from <a href="#users">Users › Data import</a>.' : " Please check back soon."); return; }
    msg.hidden = true; grid.hidden = false;
    requestAnimationFrame(() => window.__renderStats && window.__renderStats());
  }
  MAM.hooks["show:arb-stats"] = showStats;
  MAM.hooks["show:arb-rev"] = showStats;
})();
