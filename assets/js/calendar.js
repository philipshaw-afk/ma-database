/* M&A DataBase · offer calendar and the Home dashboard of pending deals (Public offers / Private deals switch).
   Ported from the integrated-site mockup; events and offer status come from Supabase (db_offer_events, db_offer_status),
   the private deals summary from DIANA's pending private deal reports (db_deal_index). */
window.MAM_initCalendar=function(){
/* ===== Offer calendar (DataBase > Calendar), DataBase home dashboard and next-event chip on deal reports ===== */
(function(){
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let EV=(window.MAM&&window.MAM.events)||[];
let DEALS=(window.MAM&&window.MAM.statusDeals)||[];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],MONL=['January','February','March','April','May','June','July','August','September','October','November','December'],DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TY={meet:'Shareholder meeting',close:'Acceptance period closes',open:'Acceptance period opens',pusu:'PUSU deadline',comp:'Expected completion',reg:'Regulatory approval',acc:'Acceptance level',ann:'Offer announced'};
const ORDER=['meet','close','open','pusu','comp','reg','acc','ann'];
const today=(()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate());})();
const pd=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const isoOf=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const days=s=>Math.round((pd(s)-today)/864e5);
const cd=s=>{const n=days(s);return n===0?'<span class="cd-n soon">today</span>':n===1?'<span class="cd-n soon">tomorrow</span>':n>1?'<span class="cd-n'+(n<=7?' soon':n<=14?' wk':'')+'">in '+n+' days</span>':'<span class="cd-n">'+(-n)+' day'+(n===-1?'':'s')+' ago</span>';};
const fdate=s=>{const d=pd(s);return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();};
const pill=t=>'<span class="evp ev-'+t+'"><i></i>'+esc(TY[t]||t)+'</span>';
const who=e=>e.dno?'<a class="evt" href="#deal" data-open-deal="'+e.dno+'"'+(e.ty==='meet'||e.ty==='close'||e.ty==='open'||e.ty==='acc'?' data-open-tab="status"':'')+'>'+esc(e.n)+'</a>':'<a class="evt" target="_blank" rel="noopener" href="'+esc(({'#uk':'https://arbinsight.co.uk/','#eu':'https://europe.arbinsight.co.uk/'})[e.lk||(e.r==='UK & Ireland'?'#uk':'#eu')]||'https://arbinsight.co.uk/')+'" title="Not on the database yet - opens the tracker page">'+esc(e.n)+'</a>';
const sget=k=>{try{return sessionStorage.getItem(k);}catch(e){return null;}},sset=(k,v)=>{try{sessionStorage.setItem(k,v);}catch(e){}};

/* ---------------- calendar ---------------- */
const S={view:'agenda',reg:'',q:'',types:new Set(['meet','close','open','pusu','comp','reg']),past:false,month:new Date(today.getFullYear(),today.getMonth(),1),sel:null};
function filtered(){
  const q=S.q.trim().toLowerCase();
  return EV.filter(e=>S.types.has(e.ty)&&(!S.reg||e.r===S.reg)&&(!q||(e.n+' '+e.b+' '+(e.dno||'')).toLowerCase().includes(q)));
}
function bar(){
  const cnt={};EV.forEach(e=>{if(e.d>=isoOf(today))cnt[e.ty]=(cnt[e.ty]||0)+1;});
  return '<div class="calbar">'+
    '<div class="cseg" role="group" aria-label="View"><button type="button" data-v="agenda"'+(S.view==='agenda'?' class="on"':'')+'>Agenda</button><button type="button" data-v="month"'+(S.view==='month'?' class="on"':'')+'>Month</button></div>'+
    '<select class="sel" id="cal-reg" aria-label="Region" style="width:150px"><option value="">All regions</option>'+['UK & Ireland','Europe','US'].map(r=>'<option'+(S.reg===r?' selected':'')+'>'+r+'</option>').join('')+'</select>'+
    '<input class="in" id="cal-q" type="search" placeholder="Target, bidder or deal no." value="'+esc(S.q)+'" style="width:220px">'+
    '<label class="pst"><input type="checkbox" id="cal-past"'+(S.past?' checked':'')+'> Show past dates</label>'+
    '<span class="csp"></span><a class="btn sm ghost" href="#calendar" id="cal-ics" title="Download the filtered events as a calendar file (Outlook, Google, Apple)">Add to calendar (.ics)</a>'+
    '<div class="cchips" style="flex-basis:100%">'+ORDER.map(t=>'<label class="ev-'+t+(S.types.has(t)?' on':'')+'"><input type="checkbox" value="'+t+'"'+(S.types.has(t)?' checked':'')+'><i></i>'+esc(TY[t])+(cnt[t]?' <em>'+cnt[t]+'</em>':'')+'</label>').join('')+'</div></div>';
}
function summary(list){
  const t0=isoOf(today),in7=isoOf(new Date(today.getTime()+7*864e5)),mEnd=isoOf(new Date(today.getFullYear(),today.getMonth()+1,0));
  const up=list.filter(e=>e.d>=t0);
  const wk=up.filter(e=>e.d<=in7).length, mo=up.filter(e=>e.d<=mEnd);
  const meet=mo.filter(e=>e.ty==='meet').length,close=mo.filter(e=>e.ty==='close'||e.ty==='comp').length;
  const nx=up[0];
  return '<div class="calsum"><div><span>Next 7 days</span><b>'+wk+'</b><em>events</em></div><div><span>Rest of '+MONL[today.getMonth()]+'</span><b>'+mo.length+'</b><em>'+meet+' meetings · '+close+' closings</em></div>'+
    '<div><span>Next up</span><b style="font-size:15px">'+(nx?esc(nx.n):'—')+'</b><em>'+(nx?esc(TY[nx.ty])+' · '+fdate(nx.d):'')+'</em></div><div><span>Targets with dates ahead</span><b>'+new Set(up.map(e=>e.dno||e.n)).size+'</b><em>database deals and tracker possible offers</em></div></div>';
}
function agenda(list){
  const t0=isoOf(today);
  const L=list.filter(e=>S.past||e.d>=t0);
  if(!L.length)return '<div class="calempty">No events match these filters.</div>';
  const monday=d=>{const x=new Date(d);const k=(x.getDay()+6)%7;x.setDate(x.getDate()-k);return x;};
  const w0=monday(today).getTime();
  const wkName=d=>{const w=monday(pd(d)).getTime();const k=Math.round((w-w0)/(7*864e5));return k===0?'This week':k===1?'Next week':k===-1?'Last week':'Week of '+monday(pd(d)).getDate()+' '+MON[monday(pd(d)).getMonth()]+' '+monday(pd(d)).getFullYear();};
  let h='',cw='',cday='';
  const byDay={};L.forEach(e=>{(byDay[e.d]=byDay[e.d]||[]).push(e);});
  Object.keys(byDay).sort().forEach(d=>{
    const w=wkName(d);if(w!==cw){h+='<h3>'+w+'</h3>';cw=w;}
    const dt=pd(d);
    h+='<div class="agd'+(d===t0?' today':d<t0?' past':'')+'"><div class="agdd"><span>'+DOW[dt.getDay()]+'</span><b>'+dt.getDate()+'</b><span>'+MON[dt.getMonth()]+'</span></div><div>'+
      byDay[d].sort((a,b)=>ORDER.indexOf(a.ty)-ORDER.indexOf(b.ty)).map(e=>'<div class="age">'+pill(e.ty)+'<div class="agwho">'+who(e)+'<small>'+esc([e.b,e.r].filter(Boolean).join(' · '))+'</small></div>'+cd(e.d)+(e.x?'<div class="agx">'+esc(e.l!==TY[e.ty]?e.l+' · '+e.x:e.x)+'</div>':(e.l!==TY[e.ty]?'<div class="agx">'+esc(e.l)+'</div>':''))+'</div>').join('')+'</div></div>';
  });
  return '<div class="agw">'+h+'</div>';
}
function month(list){
  const m=S.month,first=new Date(m.getFullYear(),m.getMonth(),1),start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
  const byDay={};list.forEach(e=>{(byDay[e.d]=byDay[e.d]||[]).push(e);});
  let h='<div class="mon"><div class="monhd"><button type="button" data-m="-1" aria-label="Previous month">‹</button><b>'+MONL[m.getMonth()]+' '+m.getFullYear()+'</b><button type="button" data-m="1" aria-label="Next month">›</button><button type="button" data-m="0">Today</button></div><div class="mg">'+
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'<div class="wd">'+d+'</div>').join('');
  const t0=isoOf(today);
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const k=isoOf(d);const ev=(byDay[k]||[]).sort((a,b)=>ORDER.indexOf(a.ty)-ORDER.indexOf(b.ty));
    if(i>=35&&d.getMonth()!==m.getMonth())break;
    h+='<div class="mc'+(d.getMonth()!==m.getMonth()?' mout':'')+(k===t0?' mtd':'')+(S.sel===k?' pick':'')+'" data-d="'+k+'"><span class="mn">'+d.getDate()+'</span>'+
      ev.slice(0,3).map(e=>'<span class="mch ev-'+e.ty+'" title="'+esc(e.n+' · '+(TY[e.ty]||''))+'"><i></i>'+esc(e.n)+'</span>').join('')+(ev.length>3?'<span class="mmore">+'+(ev.length-3)+' more</span>':'')+
      '<span class="mdots">'+ev.map(e=>'<i class="ev-'+e.ty+'"></i>').join('')+'</span></div>';
  }
  h+='</div>';
  const sel=S.sel&&byDay[S.sel];
  h+='<div class="dayl">'+(S.sel?'<h4>'+fdate(S.sel)+'</h4>'+(sel?sel.map(e=>'<div class="age">'+pill(e.ty)+'<div class="agwho">'+who(e)+'<small>'+esc([e.b,e.r].filter(Boolean).join(' · '))+'</small></div>'+cd(e.d)+(e.x?'<div class="agx">'+esc(e.x)+'</div>':'')+'</div>').join(''):'<p class="calempty" style="padding:8px 0;text-align:left">No events on this day.</p>'):'<p class="calempty" style="padding:8px 0;text-align:left">Click a day to list its events.</p>')+'</div></div>';
  return h;
}
function ics(list){
  const p=s=>s.replace(/-/g,''),nx=s=>{const d=pd(s);d.setDate(d.getDate()+1);return isoOf(d).replace(/-/g,'');};
  const q=s=>String(s||'').replace(/\\/g,'\\\\').replace(/[,;]/g,m=>'\\'+m).replace(/\n/g,'\\n');
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//M&A Monitor//Offer calendar//EN','CALSCALE:GREGORIAN'];
  list.forEach((e,i)=>L.push('BEGIN:VEVENT','UID:'+p(e.d)+'-'+(e.dno||i)+'-'+e.ty+'@ma-monitor.co.uk','DTSTAMP:'+p(isoOf(today))+'T000000Z','DTSTART;VALUE=DATE:'+p(e.d),'DTEND;VALUE=DATE:'+nx(e.d),
    'SUMMARY:'+q(e.n+': '+e.l),'DESCRIPTION:'+q([e.x,e.b?'Bidder: '+e.b:'',e.dno?'M&A Monitor deal '+e.dno:''].filter(Boolean).join(' | ')),'END:VEVENT'));
  L.push('END:VCALENDAR');return L.join('\r\n');
}
function render(){
  const box=$('#cal-box');if(!box)return;
  const q0=sget('mam-cal-q');if(q0!==null){S.q=q0;try{sessionStorage.removeItem('mam-cal-q');}catch(e){}}
  const list=filtered();
  box.innerHTML=bar()+summary(list)+(S.view==='agenda'?agenda(list):month(list));
  box.querySelectorAll('.cseg button').forEach(b=>b.onclick=()=>{S.view=b.dataset.v;render();});
  $('#cal-reg').onchange=e=>{S.reg=e.target.value;render();};
  const qi=$('#cal-q');qi.oninput=e=>{S.q=e.target.value;const p=qi.selectionStart;render();const n=$('#cal-q');n.focus();n.setSelectionRange(p,p);};
  $('#cal-past').onchange=e=>{S.past=e.target.checked;render();};
  box.querySelectorAll('.cchips input').forEach(i=>i.onchange=()=>{i.checked?S.types.add(i.value):S.types.delete(i.value);render();});
  box.querySelectorAll('.monhd button').forEach(b=>b.onclick=()=>{const k=+b.dataset.m;S.month=k?new Date(S.month.getFullYear(),S.month.getMonth()+k,1):new Date(today.getFullYear(),today.getMonth(),1);S.sel=null;render();});
  box.querySelectorAll('.mg .mc').forEach(c=>c.onclick=e=>{if(e.target.closest('a'))return;S.sel=c.dataset.d;render();});
  $('#cal-ics').onclick=e=>{e.preventDefault();const L=filtered().filter(x=>S.past||x.d>=isoOf(today));
    const url=URL.createObjectURL(new Blob([ics(L)],{type:'text/calendar'}));const a=document.createElement('a');a.href=url;a.download='ma-monitor-offer-calendar.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},500);};
}
window.__calRender=render;

/* ---------------- DataBase home dashboard: pending public offers / pending private deals ---------------- */
const regCls=s=>/^No regulatory/.test(s)?'rg-no':/^All regulatory/.test(s)?'rg-ok':/^Awaiting/.test(s)?'rg-aw':/Phase 2/.test(s)?'rg-p2':'rg-na';
const regLab={'rg-no':'No clearance required','rg-aw':'Awaiting clearance','rg-ok':'All clearances obtained','rg-p2':'Phase 2 referral','rg-na':'Not recorded'};
const stCls=s=>/^Unconditional/.test(s)?'st-unc':/^Completed/.test(s)?'st-comp':/^Superseded|Lapsed|Withdrawn/.test(s)?'st-sup':'st-pend';
const stLab={'st-pend':'Pending','st-unc':'Unconditional, awaiting settlement','st-comp':'Completed','st-sup':'Superseded'};
const tc=x=>String(x).toLowerCase().replace(/(^|[\s(\/-])([a-z])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(Spa|Sa|Plc|Ag|Se|Nv|Inc|Llc|Llp|Lp|Asa|Ab|Kgaa|Bv|Uk|Us)\b/g,w=>({Spa:'SpA',Plc:'plc',Inc:'Inc',Kgaa:'KGaA'}[w]||w.toUpperCase()));
const money=v=>v==null||!isFinite(v)?'—':v>=1000?'£'+(v/1000).toFixed(1)+'bn':v>=10?'£'+Math.round(v)+'m':'£'+(+v).toFixed(1)+'m';
const stack=(counts,labels,order)=>{const tot=order.reduce((s,k)=>s+(counts[k]||0),0)||1;
  return '<div class="sbar" role="img" aria-label="'+esc(order.filter(k=>counts[k]).map(k=>labels[k]+' '+counts[k]).join(', '))+'">'+order.filter(k=>counts[k]).map(k=>'<i class="'+k+'" style="width:'+(counts[k]/tot*100).toFixed(2)+'%" data-tip="'+esc(labels[k]+': '+counts[k])+'" title="'+esc(labels[k]+': '+counts[k])+'"></i>').join('')+'</div>'+
    '<ul class="sleg">'+order.filter(k=>counts[k]).map(k=>'<li><i class="'+k+'"></i><span>'+esc(labels[k])+'</span><b>'+counts[k]+'</b></li>').join('')+'</ul>';};
const pl=(n,w)=>n+' '+w+(n===1?'':'s');
/* which tab the card shows: remembered in this browser (localStorage can be blocked, so never rely on it) */
let TAB=(()=>{try{return localStorage.getItem('mam-dash-tab')==='prv'?'prv':'pub';}catch(e){return 'pub';}})();

/* -- public offers: offer status (db_offer_status) and offer events (db_offer_events) -- */
function pubBody(n,prop){
  const t1='<div><span>Pending public offers</span><b>'+n+'</b><em>'+(prop?'plus '+pl(prop,'proposed offer'):'firm offers with a deal report')+'</em></div>';
  if(!DEALS.length)return{sub:'',html:'<div class="dk">'+t1+'</div>'};
  const live=DEALS.filter(d=>!/^Completed|^Superseded|Lapsed|Withdrawn/.test(d.current_status||''));
  const tv=live.reduce((s,d)=>s+(+d.equity_value_gbp||0),0);
  const t0=isoOf(today),mEnd=isoOf(new Date(today.getFullYear(),today.getMonth()+1,0)),in14=isoOf(new Date(today.getTime()+14*864e5));
  const closing=EV.filter(e=>e.d>=t0&&e.d<=mEnd&&(e.ty==='close'||e.ty==='comp'||e.ty==='pusu'));
  const meets=EV.filter(e=>e.d>=t0&&e.d<=mEnd&&e.ty==='meet');
  const next=EV.filter(e=>e.d>=t0&&e.d<=in14&&e.ty!=='ann'&&e.ty!=='acc');
  // by country (offer regime)
  const bc={};live.forEach(d=>{const k=d.regime||d.target_country||'Other';(bc[k]=bc[k]||{n:0,v:0});bc[k].n++;bc[k].v+=(+d.equity_value_gbp||0);});
  const cs=Object.entries(bc).sort((a,b)=>b[1].n-a[1].n||b[1].v-a[1].v);const top=cs.slice(0,9),rest=cs.slice(9);
  if(rest.length)top.push(['Other ('+rest.length+')',{n:rest.reduce((s,x)=>s+x[1].n,0),v:rest.reduce((s,x)=>s+x[1].v,0)}]);
  const mx=Math.max(...top.map(x=>x[1].n));
  const bars='<ul class="hb">'+top.map(([k,o])=>'<li data-tip="'+esc(k+': '+o.n+' pending offer'+(o.n===1?'':'s')+' · '+money(o.v)+' equity value')+'" title="'+esc(k+': '+o.n+' · '+money(o.v))+'"><span class="bnm">'+esc(k)+'</span><span class="btr"><i style="width:'+(o.n/mx*100).toFixed(1)+'%"></i></span><b>'+o.n+'</b></li>').join('')+'</ul>';
  const st={},rg={};DEALS.forEach(d=>{const s=stCls(d.current_status||'');st[s]=(st[s]||0)+1;});live.forEach(d=>{const r=regCls(d.regulatory_status||'');rg[r]=(rg[r]||0)+1;});
  const big=[...live].sort((a,b)=>(+b.equity_value_gbp||0)-(+a.equity_value_gbp||0)).slice(0,6);const bmx=big.length?(+big[0].equity_value_gbp||1):1;
  const title=s=>{const e=EV.find(x=>x.dno===s.deal_no);return e?e.n:s.target;};
  const li=e=>'<li><span class="dsd">'+pd(e.d).getDate()+' '+MON[pd(e.d).getMonth()]+'</span><span class="dsw">'+who(e)+'<span class="evp ev-'+e.ty+'"><i></i>'+esc(e.l)+'</span></span>'+cd(e.d)+'</li>';
  return{sub:' · offer status for '+live.length+' public offers as at '+esc(window.MAM.statusAsOfText||''),html:
    '<div class="dk">'+t1+
    '<div><span>Public offer equity value</span><b>'+(tv/1000).toFixed(1)+'<small>£bn</small></b><em>'+live.length+' public offers with offer status · '+Object.keys(bc).length+' regimes</em></div>'+
    '<div><span>Closing in '+MONL[today.getMonth()]+'</span><b>'+closing.length+'</b><em>acceptance periods, PUSU and completions</em></div>'+
    '<div><span>Shareholder meetings</span><b>'+meets.length+'</b><em>still to come in '+MONL[today.getMonth()]+'</em></div></div>'+
    '<div class="dg"><section><div class="dh"><b>By offer regime</b><span>pending public offers</span></div>'+bars+'</section>'+
    '<section><div class="dh"><b>Offer status</b><span>all '+DEALS.length+' public offers tracked</span></div>'+stack(st,stLab,['st-pend','st-unc','st-comp','st-sup'])+
    '<div class="dh"><b>Regulatory status</b><span>pending public offers</span></div>'+stack(rg,regLab,['rg-aw','rg-p2','rg-ok','rg-no','rg-na'])+'</section>'+
    '<section><div class="dh"><b>Closing this month</b><a href="#calendar">Calendar →</a></div><ul class="dsl">'+(closing.length?closing.slice(0,8).map(e=>li(e)).join(''):'<li class="empty">Nothing else closes in '+MONL[today.getMonth()]+'.</li>')+(closing.length>8?'<li class="empty"><a href="#calendar">+ '+(closing.length-8)+' more in '+MONL[today.getMonth()]+' &#8594;</a></li>':'')+'</ul></section></div>'+
    '<div class="dg dg2"><section><div class="dh"><b>Largest pending public offers</b><span>equity value</span></div><ul class="lv">'+big.map(d=>'<li><span class="w"><a class="evt" href="#deal" data-open-deal="'+d.deal_no+'">'+esc(title(d))+'</a><small>'+esc(tc(d.bidder||'')+' · '+(d.regime||''))+'</small></span><span class="btr"><i style="width:'+((+d.equity_value_gbp||0)/bmx*100).toFixed(1)+'%"></i></span><b>'+money(+d.equity_value_gbp||0)+'</b></li>').join('')+'</ul></section>'+
    '<section><div class="dh"><b>Coming up in the next 14 days</b><a href="#calendar">Full calendar →</a></div><ul class="dsl">'+(next.length?next.slice(0,8).map(e=>li(e)).join(''):'<li class="empty">No events in the next 14 days.</li>')+(next.length>8?'<li class="empty"><a href="#calendar">+ '+(next.length-8)+' more in the calendar &#8594;</a></li>':'')+'</ul></section></div>'};
}

/* -- private deals: DIANA's pending private deal reports (db_deal_index) -- */
const PTK=['pdt-div','pdt-acq','pdt-mbo','pdt-min','pdt-rto','pdt-oth'];
const PTL={'pdt-div':'Divestiture','pdt-acq':'Private acquisition','pdt-mbo':'MBO / MBI','pdt-min':'Minority stake','pdt-rto':'Reverse takeover','pdt-oth':'Merger / other'};
const ptype=t=>/reverse takeover/i.test(t)?'pdt-rto':/\bMB[OI]\b/i.test(t)?'pdt-mbo':/minority/i.test(t)?'pdt-min':/divest/i.test(t)?'pdt-div':/private/i.test(t)?'pdt-acq':'pdt-oth';
const PAK=['pda-3','pda-6','pda-12','pda-y','pda-na'];
const PAL={'pda-3':'Under 3 months','pda-6':'3–6 months','pda-12':'6–12 months','pda-y':'Over a year','pda-na':'Date not recorded'};
const RGN={uk_ie:'UK & Ireland',fr_it:'France & Italy',western:'Other Western Europe',other_europe:'Central & Eastern Europe',non_europe:'Outside Europe'};
const secLab=s=>s.replace(/\s*\(standard template\)/i,'');
/* deal value in £m: the report's deal value (deal currency) at the site's approximate rates; failing that the
   database's own sterling enterprise value / implied equity value */
const pval=r=>{let v=r.equity_value!=null&&+r.equity_value>0?window.MAM.fx(+r.equity_value,r.currency,'GBP'):null;if(!(v>0))v=Math.max(+r.enterprise_value||0,+r.equity_value_gbp||0)||null;return v;};
function prvBody(P){
  if(!P.length)return{sub:'',html:'<div class="dempty">There are no pending private deals on the DataBase.</div>'};
  const ago=m=>{const d=new Date(today);d.setMonth(d.getMonth()-m);return +d;},t3=ago(3),t6=ago(6),t12=ago(12);
  const age=r=>r._ann==null?'pda-na':r._ann>t3?'pda-3':r._ann>t6?'pda-6':r._ann>t12?'pda-12':'pda-y';
  const V=new Map(P.map(r=>[r,pval(r)])),val=r=>V.get(r)||0;
  const vals=P.map(val).filter(v=>v>0).sort((a,b)=>a-b),tv=vals.reduce((s,v)=>s+v,0),h=vals.length>>1;
  const med=vals.length?(vals.length%2?vals[h]:(vals[h-1]+vals[h])/2):null,big1=vals.filter(v=>v>=1000).length;
  const ne=P.filter(r=>r.region==='non_europe').length,eu=P.filter(r=>r.region&&r.region!=='non_europe').length;
  const rec=P.filter(r=>r._ann!=null&&r._ann>=+today-30*864e5),recV=rec.reduce((s,r)=>s+val(r),0);
  const xy=P.filter(r=>r.cross_border==='Yes').length,xn=P.filter(r=>r.cross_border==='No').length;
  const tile=(l,b,e)=>'<div><span>'+l+'</span><b>'+b+'</b><em>'+e+'</em></div>';
  const kpis='<div class="dk">'+
    tile('Pending private deals',P.length,eu+' European target'+(eu===1?'':'s')+' · '+ne+' outside Europe')+
    tile('Private deal value',tv>=1000?(tv/1000).toFixed(1)+'<small>£bn</small>':Math.round(tv)+'<small>£m</small>',(med!=null?'median '+money(med):'no values disclosed')+(big1?' · '+big1+' of £1bn or more':''))+
    tile('Announced in the last 30 days',rec.length,rec.length?money(recV)+' of deal value':'no new pending private deals')+
    tile('Cross-border',xy+xn?Math.round(xy/(xy+xn)*100)+'<small>%</small>':'—',xy+' cross-border · '+xn+' domestic')+'</div>';
  /* bars that open the search: pending private deals in that region / country / sector */
  const tally=keys=>{const o={};P.forEach(r=>keys(r).forEach(k=>{(o[k]=o[k]||{n:0,v:0,c:{}});o[k].n++;o[k].v+=val(r);const c=r.target_country||'';if(c)o[k].c[c]=(o[k].c[c]||0)+1;}));return Object.entries(o).sort((a,b)=>b[1].n-a[1].n||b[1].v-a[1].v);};
  const bar=(lab,o,mx,attr,tip)=>{const inner='<span class="bnm">'+esc(lab)+'</span><span class="btr"><i style="width:'+(o.n/mx*100).toFixed(1)+'%"></i></span><b>'+o.n+'</b>';
    const t=esc(lab+': '+pl(o.n,'pending deal')+' · '+money(o.v)+' deal value'+(tip?' · '+tip:''));
    return attr?'<li class="ln"><a href="#results" data-preset="pending-private" '+attr+' title="'+t+' (click to list them)">'+inner+'</a></li>':'<li title="'+t+'">'+inner+'</li>';};
  const hbl=(rows,attr,tip)=>{const mx=Math.max(1,...rows.map(x=>x[1].n));return '<ul class="hb hbw">'+rows.map(([k,o])=>bar(k===''?'Not recorded':attr==='data-sector'?secLab(k):k,o,mx,k===''?'':attr+'="'+esc(k)+'"',tip?tip(o):'')).join('')+'</ul>';};
  const topC=o=>Object.entries(o.c).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([c,n])=>c+' '+n).join(', ');
  const regs=tally(r=>[RGN[r.region]||'']),ctry=tally(r=>r.target_country?[r.target_country]:[]);
  const secs=tally(r=>[...new Set(String(r.sector||'').split(' / ').map(s=>s.trim()).filter(Boolean))]);
  const ty={},ag={};P.forEach(r=>{const t=ptype(r.deal_type||''),a=age(r);ty[t]=(ty[t]||0)+1;ag[a]=(ag[a]||0)+1;});
  const fd=ts=>{const d=new Date(ts);return d.getDate()+' '+MON[d.getMonth()]+(d.getFullYear()!==today.getFullYear()?' '+String(d.getFullYear()).slice(2):'');};
  const nm=r=>window.MAM.tc(r.target);
  const lat=P.filter(r=>r._ann!=null).sort((a,b)=>b._ann-a._ann||(b.deal_no>a.deal_no?1:-1)).slice(0,8);
  const big=P.filter(r=>val(r)>0).sort((a,b)=>val(b)-val(a)).slice(0,6),bmx=big.length?val(big[0]):1;
  const lnk='<a href="#results" data-preset="pending-private">';
  return{sub:' · deal values in £ at approximate exchange rates',html:kpis+
    '<div class="dg"><section><div class="dh"><b>By target region</b><span>click a bar to list the deals</span></div>'+hbl(regs,'data-region',o=>topC(o))+
    '<div class="dh dh2"><b>Top target countries</b><span>'+Math.min(6,ctry.length)+' of '+ctry.length+' countries</span></div>'+hbl(ctry.slice(0,6),'data-country')+'</section>'+
    '<section><div class="dh"><b>Deal type</b><span>pending private deals</span></div>'+stack(ty,PTL,PTK)+
    '<div class="dh"><b>Time since announcement</b><span>pending private deals</span></div>'+stack(ag,PAL,PAK)+'</section>'+
    '<section><div class="dh"><b>Latest announced</b>'+lnk+'All '+P.length+' →</a></div><ul class="dsl">'+lat.map(r=>'<li><span class="dsd">'+fd(r._ann)+'</span><span class="dsw"><a class="evt" href="#deal" data-open-deal="'+r.deal_no+'" title="'+esc(nm(r))+'">'+esc(nm(r))+'</a><span class="evp '+ptype(r.deal_type||'')+'"><i></i><span>'+esc(PTL[ptype(r.deal_type||'')]+(r.target_country?' · '+r.target_country:''))+'</span></span></span><b class="dsv">'+money(V.get(r))+'</b></li>').join('')+'</ul></section></div>'+
    '<div class="dg dg2"><section><div class="dh"><b>Largest pending private deals</b><span>deal value</span></div><ul class="lv">'+big.map(r=>'<li><span class="w"><a class="evt" href="#deal" data-open-deal="'+r.deal_no+'" title="'+esc(nm(r))+'">'+esc(nm(r))+'</a><small>'+esc(window.MAM.tc(r.bidder||'')+(r.target_country?' · '+r.target_country:''))+'</small></span><span class="btr"><i style="width:'+(val(r)/bmx*100).toFixed(1)+'%"></i></span><b>'+money(val(r))+'</b></li>').join('')+'</ul></section>'+
    '<section><div class="dh"><b>By sector</b><span>top '+Math.min(8,secs.length)+' of '+secs.length+' sectors · click a bar to list the deals</span></div>'+hbl(secs.slice(0,8),'data-sector')+'</section></div>'};
}

function dash(refocus){
  const box=$('#dash-box');if(!box)return;
  // DIANA's own deal reports on the site: status Pending (proposed offers counted separately), split public / private
  const ALL=((window.MAM&&window.MAM.deals)||[]).filter(r=>r.has_report);
  const pend=ALL.filter(r=>/^Pending$/i.test(r.deal_status||'')),pub=pend.filter(r=>r.pub),prv=pend.filter(r=>!r.pub);
  const prop=ALL.filter(r=>/^Proposed$/i.test(r.deal_status||'')).length;
  if(!pend.length&&!prop&&!DEALS.length){box.innerHTML='';return;}
  const tab=TAB==='prv'?'prv':'pub',b=tab==='prv'?prvBody(prv):pubBody(pub.length,prop);
  const tb=(k,lab,n,extra)=>'<button type="button" data-dtab="'+k+'" aria-pressed="'+(tab===k)+'">'+lab+'<em>'+n+'</em>'+(extra||'')+'</button>';
  box.innerHTML='<div class="card dash"><div class="card-hd"><div class="dhd"><span class="card-t">Pending deals on the DataBase</span>'+
    '<div class="segb dtabs" role="group" aria-label="Show pending">'+tb('pub','Public offers',pub.length)+tb('prv','Private deals',prv.length,'<span class="pdb-new">NEW</span>')+'</div></div>'+
    '<span class="card-s">'+pend.length+' pending deal reports · <a href="#results" data-preset="'+(tab==='prv'?'pending-private':'pending-public')+'">search the '+(tab==='prv'?'private deals':'public offers')+'</a>'+b.sub+'</span></div>'+b.html+'</div>';
  box.querySelectorAll('[data-dtab]').forEach(x=>x.onclick=()=>{if(TAB===x.dataset.dtab)return;TAB=x.dataset.dtab;try{localStorage.setItem('mam-dash-tab',TAB);}catch(e){}dash(true);});
  if(refocus){const f=box.querySelector('[data-dtab="'+tab+'"]');if(f)f.focus();}
}
window.__dashRender=()=>dash();


})();


};
