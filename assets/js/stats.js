/* ARB-Insight · UK public offer statistics.
   Ported from the integrated-site mockup (mamonitorintegratedsite_8_2_24.html); data now comes from Supabase (db_uk_offer_stats). */
window.MAM_initStats=function(){
/* ================= ARB: UK PUBLIC OFFER STATISTICS ================= */
(function(){
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const RAW=window.MAM.ukStats;
const D=RAW.R.map(r=>{const o={};RAW.K.forEach((k,i)=>{if(r[i]!=null)o[k]=r[i];});return o;});
{let RV=RAW.paths||{};D.forEach(r=>{const x=RV[r.no];if(x&&x.rv!=null)r.rv=x.rv;});}
const SECT=RAW.sectors;
const EVS=[0,5,10,25,50,100,250,500,1000,2500,5000,10000,25000,Infinity];
const YMIN=Math.min(...D.map(r=>r.y||9999)), YMAX=Math.max(...D.map(r=>r.y||0));
const ATT=[['Fr','Friendly'],['Ho','Hostile'],['IH','Initially hostile'],['WK','White knight'],['Ne','Neutral'],['NA','Not stated']];
const ATTN=Object.fromEntries(ATT);
const MKT=[['F100','FTSE 100'],['F250','FTSE 250'],['FSC','Small Cap'],['FFL','Fledgling'],['AIM','AIM'],['OTH','Other']];
const ST={C:'Completed',F:'Failed',P:'Pending',X:'Possible offer'};
const COL={C:'#0D9B6A',F:'#DC3E1B',P:'#4F6EF7',X:'#B07D00'};
const nf=(v,d=0)=>v==null||!isFinite(v)?'—':v.toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
const pc=(a,b)=>b?a/b*100:null;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const fmtEV=v=>v===Infinity?'£25bn+':v>=1000?'£'+nf(v/1000,v%1000?1:0)+'bn':'£'+v+'m';

/* ---------- state ---------- */
const DEF=()=>({uni:'firm',att:new Set(ATT.map(a=>a[0])),xb:'all',ev:[0,EVS.length-1],yr:[YMIN,YMAX],mkt:new Set(MKT.map(m=>m[0])),sch:'all',mbo:'all',cn:'all',c:'all',sec:'all',rv:'all',cp:'all'});
let S=DEF(), sortK='d', sortD=-1, shown=25, dirty=true;

function pass(r,s,uniOnly){
  if(s.uni==='firm'&&r.s==='X')return false;
  if(uniOnly)return true;
  if(!s.att.has(r.a||'NA'))return false;
  if(s.xb!=='all'&&(r.xb==null||(s.xb==='y')!==(r.xb===1)))return false;
  if(!(s.ev[0]===0&&s.ev[1]===EVS.length-1)){if(r.ev==null||r.ev<EVS[s.ev[0]]||r.ev>=EVS[s.ev[1]])return false;}
  if(!(s.yr[0]===YMIN&&s.yr[1]===YMAX)){if(r.y==null||r.y<s.yr[0]||r.y>s.yr[1])return false;}
  if(!s.mkt.has(r.m))return false;
  if(s.sch==='sch'&&r.sch!==1)return false;
  if(s.sch==='off'&&(r.sch===1||r.s==='X'))return false;
  if(s.mbo==='mbo'&&r.mbo!==1)return false;
  if(s.mbo==='oth'&&r.mbo===1)return false;
  if(s.cn!=='all'&&r.cn!==s.cn)return false;
  if(s.c!=='all'&&r.c!==s.c)return false;
  if(s.sec!=='all'&&r.sc!==+s.sec)return false;
  if(s.rv&&s.rv!=='all'&&(r.rv==null||(s.rv==='y')!==(r.rv===1)))return false;
  if(s.cp&&s.cp!=='all'&&(s.cp==='y')!==(r.cp===1))return false;
  return true;
}

/* ---------- statistics ---------- */
function stats(R){
  const o={n:R.length,sit:new Set(R.map(r=>r.si)).size};
  const cnt={C:0,F:0,P:0,X:0,Xr:0};R.forEach(r=>{cnt[r.s]++;if(r.s==='X'&&!r.lv)cnt.Xr++;});o.cnt=cnt;
  o.firm=cnt.C+cnt.F+cnt.P;
  const pr=R.filter(r=>r.pr!=null).map(r=>r.pr);o.pr=pr;o.prem={n:pr.length,mean:mean(pr),med:median(pr)};
  const opm=new Map();R.forEach(r=>{if(r.op!=null&&!opm.has(r.ok))opm.set(r.ok,r.op);});const ops=[...opm.values()];
  o.op={n:ops.length,mean:mean(ops),med:median(ops)};
  const dc=R.filter(r=>r.s==='C'&&r.d1!=null).map(r=>r.d1), df=R.filter(r=>r.s==='F'&&r.d1!=null).map(r=>r.d1);
  o.d1={n:dc.length,mean:mean(dc),med:median(dc),fn:df.length,fmean:mean(df)};
  const pu=R.filter(r=>r.pu!=null), puY=pu.filter(r=>r.pu===1), pxb=puY.filter(r=>r.px!=null), cv=puY.filter(r=>!r.lv&&r.om!=null);
  o.pusu={n:pu.length,y:puY.length,pct:pc(puY.length,pu.length),en:pxb.length,ey:pxb.filter(r=>r.px===1).length,cn:cv.length,cy:cv.filter(r=>r.om===1).length};
  o.fail={n:cnt.C+cnt.F,y:cnt.F,pct:pc(cnt.F,cnt.C+cnt.F),nf:pc(cnt.Xr,cnt.Xr+cnt.C+cnt.F)};
  const wa=R.filter(r=>r.a), ho=wa.filter(r=>r.a==='Ho').length, ih=wa.filter(r=>r.a==='IH').length;
  o.host={n:wa.length,ho,ih,pct:pc(ho+ih,wa.length)};
  const cs=new Map();R.forEach(r=>{if(r.cp)cs.set(r.si,r.w);});
  const w={O:0,L:0,N:0,U:0};cs.forEach(v=>w[v]++);const res=w.O+w.L+w.N;
  o.comp={n:cs.size,pct:pc(cs.size,o.sit),w,res,pO:pc(w.O,res),pL:pc(w.L,res),pN:pc(w.N,res)};
  const inc=R.filter(r=>r.s!=='X'&&r.in!=null), up=inc.filter(r=>r.in===1), ips=up.map(r=>r.ip), nup=inc.filter(r=>r.in===0);
  const cr=a=>{const x=a.filter(r=>r.s==='C'||r.s==='F');return {n:x.length,pct:pc(x.filter(r=>r.s==='C').length,x.length)};};
  const ic=R.filter(r=>r.ic>=1);
  o.inc={n:inc.length,y:up.length,pct:pc(up.length,inc.length),mean:mean(ips),med:median(ips),max:ips.length?Math.max(...ips):null,crU:cr(up),crN:cr(nup),icn:ic.length,icy:ic.filter(r=>r.iu===1).length};
  return o;
}

/* ---------- filter panel ---------- */
$('#os-att').innerHTML=ATT.map(a=>'<label class="chip" data-a="'+a[0]+'"'+(a[0]==='NA'?' hidden':'')+'><input type="checkbox" value="'+a[0]+'" checked> '+a[1]+'</label>').join('');
$('#os-mkt').innerHTML=MKT.map(m=>'<label class="chip"><input type="checkbox" value="'+m[0]+'" checked> '+m[1]+'</label>').join('');
$('#os-sec').innerHTML='<option value="all">All sectors</option>'+SECT.map((s,i)=>'<option value="'+i+'">'+esc(s)+'</option>').join('');
const ticks=(id,pts)=>{$('#'+id).innerHTML=pts.map(p=>'<span style="left:calc(9px + '+(p[0]*100).toFixed(2)+'% - '+(p[0]*18).toFixed(2)+'px)">'+p[1]+'</span>').join('');};
{const y=[YMIN,Math.round((YMIN*2+YMAX)/3),Math.round((YMIN+YMAX*2)/3),YMAX];ticks('os-yr-t',y.map(v=>[(v-YMIN)/(YMAX-YMIN),v]));
 const n=EVS.length-1;ticks('os-ev-t',[[0,'£0'],[EVS.indexOf(100)/n,'£100m'],[EVS.indexOf(1000)/n,'£1bn'],[1,'£25bn+']]);}

function dual(id,min,max,get,set,label){
  const box=$('#'+id),[lo,hi]=box.querySelectorAll('input'),fl=box.querySelector('.fl');
  [lo,hi].forEach(i=>{i.min=min;i.max=max;i.step=1;});
  const paint=()=>{const v=get();lo.value=v[0];hi.value=v[1];const f=x=>(x-min)/(max-min)*100;fl.style.left=f(v[0])+'%';fl.style.right=(100-f(v[1]))+'%';
    lo.style.zIndex=v[0]>=max-(max-min)*.1?3:2;hi.style.zIndex=2;label();};
  lo.addEventListener('input',()=>{const v=get();let a=+lo.value;if(a>v[1]-(id==='os-ev'?1:0))a=v[1]-(id==='os-ev'?1:0);set([a,v[1]]);paint();update();});
  hi.addEventListener('input',()=>{const v=get();let b=+hi.value;if(b<v[0]+(id==='os-ev'?1:0))b=v[0]+(id==='os-ev'?1:0);set([v[0],b]);paint();update();});
  return paint;
}
const paintEV=dual('os-ev',0,EVS.length-1,()=>S.ev,v=>S.ev=v,()=>{const f=S.ev[0]===0&&S.ev[1]===EVS.length-1;$('#os-ev-o').textContent=f?'Any':(S.ev[1]===EVS.length-1?fmtEV(EVS[S.ev[0]])+'+':fmtEV(EVS[S.ev[0]])+' – '+fmtEV(EVS[S.ev[1]]));
  $('#os-ev').querySelectorAll('input')[0].setAttribute('aria-valuetext',fmtEV(EVS[S.ev[0]]));$('#os-ev').querySelectorAll('input')[1].setAttribute('aria-valuetext',S.ev[1]===EVS.length-1?'No maximum':fmtEV(EVS[S.ev[1]]));});
const paintYR=dual('os-yr',YMIN,YMAX,()=>S.yr,v=>S.yr=v,()=>{$('#os-yr-o').textContent=S.yr[0]===YMIN&&S.yr[1]===YMAX?'All years':S.yr[0]===S.yr[1]?S.yr[0]:S.yr[0]+' – '+S.yr[1];});

function syncControls(){
  $$('input[name="os-uni"]').forEach(i=>i.checked=i.value===S.uni);
  ['xb','sch','mbo','cn','c','rv','cp'].forEach(k=>$$('input[name="os-'+k+'"]').forEach(i=>i.checked=i.value===S[k]));
  $$('#os-att input').forEach(i=>i.checked=S.att.has(i.value));
  $$('#os-mkt input').forEach(i=>i.checked=S.mkt.has(i.value));
  $('#os-sec').value=S.sec;paintEV();paintYR();
}
$$('input[name="os-uni"]').forEach(i=>i.addEventListener('change',()=>{S.uni=i.value;update();}));
['xb','sch','mbo','cn','c','rv','cp'].forEach(k=>$$('input[name="os-'+k+'"]').forEach(i=>i.addEventListener('change',()=>{S[k]=i.value;update();})));
$('#os-att').addEventListener('change',e=>{const v=e.target.value;e.target.checked?S.att.add(v):S.att.delete(v);update();});
$('#os-att-pre').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const p=b.dataset.p;S.att=new Set(p==='all'?ATT.map(a=>a[0]):p==='fr'?['Fr']:['Ho','IH']);syncControls();update();});
$('#os-mkt').addEventListener('change',e=>{const v=e.target.value;e.target.checked?S.mkt.add(v):S.mkt.delete(v);update();});
$('#os-sec').addEventListener('change',e=>{S.sec=e.target.value;update();});
$('#os-reset').addEventListener('click',e=>{e.preventDefault();S=DEF();syncControls();update();});
const side=$('#os-side'),tog=$('#os-tog');
tog.addEventListener('click',()=>{const shut=side.classList.toggle('shut');tog.setAttribute('aria-expanded',String(!shut));tog.textContent=shut?'Show criteria':'Hide criteria';});
if(window.matchMedia('(max-width:1024px)').matches){side.classList.add('shut');tog.setAttribute('aria-expanded','false');tog.textContent='Show criteria';}

function activeFilters(){
  const a=[];
  if(S.att.size<ATT.length){const on=ATT.filter(x=>S.att.has(x[0])&&(x[0]!=='NA'||S.uni==='all')).map(x=>x[1]);a.push(on.length?on.join(' / '):'No attitude');}
  if(S.xb!=='all')a.push(S.xb==='y'?'Cross-border':'Domestic');
  if(!(S.ev[0]===0&&S.ev[1]===EVS.length-1))a.push($('#os-ev-o').textContent);
  if(!(S.yr[0]===YMIN&&S.yr[1]===YMAX))a.push(String($('#os-yr-o').textContent));
  if(S.mkt.size<MKT.length)a.push(MKT.filter(m=>S.mkt.has(m[0])).map(m=>m[1]).join(' / ')||'No market');
  if(S.sch!=='all')a.push(S.sch==='sch'?'Schemes':'Contractual offers');
  if(S.mbo!=='all')a.push(S.mbo==='mbo'?'MBO / MBI':'Non-MBO bidders');
  if(S.cn!=='all')a.push(S.cn==='c'?'Cash only':'Incl. shares');
  if(S.c!=='all')a.push(S.c==='UK'?'UK targets':'Irish targets');
  if(S.sec!=='all')a.push(SECT[+S.sec]);
  if(S.rv!=='all')a.push(S.rv==='y'?'Price revised':'Price unchanged');
  if(S.cp!=='all')a.push(S.cp==='y'?'Competitive deals':'Uncontested deals');
  return a;
}

/* ---------- tooltip ---------- */
const tip=document.createElement('div');tip.className='os-tip';tip.setAttribute('role','tooltip');document.body.appendChild(tip);
function tipOn(e,html){tip.innerHTML=html;tip.classList.add('on');const w=tip.offsetWidth,h=tip.offsetHeight;let x=e.clientX+14,y=e.clientY-h-12;if(x+w>innerWidth-8)x=e.clientX-w-14;if(y<8)y=e.clientY+16;tip.style.left=x+'px';tip.style.top=y+'px';}
function tipOff(){tip.classList.remove('on');}
function bindTips(el){
  el.onpointermove=e=>{const t=e.target.closest('[data-tip]');if(t)tipOn(e,t.dataset.tip);else tipOff();};
  el.onpointerleave=tipOff;
  el.onpointerdown=e=>{const t=e.target.closest('[data-tip]');if(t)tipOn(e,t.dataset.tip);};
}
addEventListener('scroll',tipOff,{passive:true});

/* ---------- charts ---------- */
const topRound=(x,y,w,h,r)=>{r=Math.min(r,h,w/2);return 'M'+x+','+(y+h)+'V'+(y+r)+'Q'+x+','+y+' '+(x+r)+','+y+'H'+(x+w-r)+'Q'+(x+w)+','+y+' '+(x+w)+','+(y+r)+'V'+(y+h)+'Z';};
const niceScale=v=>{v=Math.max(v,1);const raw=v/4,p=Math.pow(10,Math.floor(Math.log10(raw))),m=raw/p;let st=(m<=1?1:m<=2?2:m<=5?5:10)*p;st=Math.max(1,Math.round(st));const n=Math.ceil(v/st);return {mx:st*n,n};};
function yearChart(R){
  const el=$('#os-yc'),W=Math.max(280,el.clientWidth-28),H=244,L=34,Rr=6,T=14,B=26;
  const keys=S.uni==='all'?['C','F','P','X']:['C','F','P'];
  const years=[];for(let y=S.yr[0];y<=S.yr[1];y++)years.push(y);
  const by={};years.forEach(y=>by[y]={C:0,F:0,P:0,X:0});R.forEach(r=>{if(by[r.y])by[r.y][r.s]++;});
  const tot=y=>keys.reduce((s,k)=>s+by[y][k],0);
  const sc=niceScale(Math.max(1,...years.map(tot))),mx=sc.mx,ih=H-T-B,slot=(W-L-Rr)/years.length,bw=Math.min(24,slot*.7);
  let g='';
  for(let i=0;i<=sc.n;i++){const v=mx*i/sc.n,y=T+ih*(1-i/sc.n);g+='<line x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="'+(i?'rgba(15,23,41,.07)':'rgba(15,23,41,.18)')+'"/><text x="'+(L-7)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9.5" fill="#8594AD">'+nf(v)+'</text>';}
  const step=years.length>12?(W<520?4:2):1;
  years.forEach((yr,i)=>{
    const cx=L+slot*i+slot/2,x=cx-bw/2;let base=T+ih;const segs=keys.filter(k=>by[yr][k]>0);
    segs.forEach((k,j)=>{const hgt=by[yr][k]/mx*ih;const y0=base-hgt;
      const hh=Math.max(0,hgt-(j>0?2:0));const yy=y0;
      g+=j===segs.length-1?'<path d="'+topRound(x,yy,bw,hh,4)+'" fill="'+COL[k]+'"/>':'<rect x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hh.toFixed(1)+'" fill="'+COL[k]+'"/>';
      base=y0;});
    const t=tot(yr);
    const tipH='<b>'+yr+'</b>'+keys.map(k=>'<div class="r2"><span><i style="background:'+COL[k]+'"></i>'+ST[k]+'</span><span>'+by[yr][k]+'</span></div>').join('')+'<div class="r2" style="border-top:1px solid rgba(255,255,255,.18);margin-top:3px;padding-top:3px"><span>Total</span><span>'+t+'</span></div>';
    g+='<rect class="hit" x="'+(L+slot*i).toFixed(1)+'" y="'+T+'" width="'+slot.toFixed(1)+'" height="'+ih+'" fill="transparent" data-tip="'+esc(tipH)+'"/>';
    if((yr-years[0])%step===0||years.length<=12)g+='<text x="'+cx.toFixed(1)+'" y="'+(H-B+15)+'" text-anchor="middle" font-size="9.5" fill="#8594AD">'+(years.length>8?"'"+String(yr).slice(2):yr)+'</text>';
  });
  el.innerHTML='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Number of offers per year, split by outcome">'+g+'</svg>';
  $('#os-yr-lgd').innerHTML=keys.map(k=>'<span><i style="background:'+COL[k]+'"></i>'+ST[k]+'</span>').join('');
  bindTips(el);
}
function histChart(o){
  const el=$('#os-hc'),W=Math.max(280,el.clientWidth-28),H=244,L=34,Rr=6,T=36,B=26;
  const edges=[];for(let v=-50;v<=150;v+=10)edges.push(v);
  const bins=edges.slice(0,-1).map((lo,i)=>({lo,hi:edges[i+1],n:0}));
  bins.unshift({lo:-Infinity,hi:-50,n:0});bins.push({lo:150,hi:Infinity,n:0});
  o.pr.forEach(v=>{const b=bins.find(b=>v>=b.lo&&v<b.hi);if(b)b.n++;});
  $('#os-hc-s').textContent=o.prem.n?nf(o.prem.n)+' offers with a premium':'';
  if(!o.prem.n){el.innerHTML='<div class="os-empty">No premium data for these criteria</div>';return;}
  const sc=niceScale(Math.max(...bins.map(b=>b.n))),mx=sc.mx,ih=H-T-B,slot=(W-L-Rr)/bins.length,bw=Math.min(24,slot-2);
  const xOf=v=>{const i=Math.min(bins.length-1,Math.max(0,v<-50?0:v>=150?bins.length-1:Math.floor((v+50)/10)+1));const b=bins[i];const f=isFinite(b.lo)&&isFinite(b.hi)?(v-b.lo)/(b.hi-b.lo):.5;return L+slot*i+slot*f;};
  let g='';
  for(let i=0;i<=sc.n;i++){const v=mx*i/sc.n,y=T+ih*(1-i/sc.n);g+='<line x1="'+L+'" x2="'+(W-Rr)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="'+(i?'rgba(15,23,41,.07)':'rgba(15,23,41,.18)')+'"/><text x="'+(L-7)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9.5" fill="#8594AD">'+nf(v)+'</text>';}
  bins.forEach((b,i)=>{
    const cx=L+slot*i+slot/2,h=b.n/mx*ih,x=cx-bw/2;
    if(b.n)g+='<path d="'+topRound(x,T+ih-h,bw,h,4)+'" fill="#4F6EF7"/>';
    const lab=!isFinite(b.lo)?'Below −50%':!isFinite(b.hi)?'150% and above':b.lo+'% to '+b.hi+'%';
    g+='<rect class="hit" x="'+(L+slot*i).toFixed(1)+'" y="'+T+'" width="'+slot.toFixed(1)+'" height="'+ih+'" fill="transparent" data-tip="'+esc('<b>'+lab+'</b><div class="r2"><span>Offers</span><span>'+b.n+'</span></div><div class="r2"><span>Share</span><span>'+nf(pc(b.n,o.prem.n),1)+'%</span></div>')+'"/>';
  });
  [-50,0,50,100,150].forEach(v=>{const i=v===-50?1:v===150?bins.length-1:(v+50)/10+1;const x=L+slot*i;g+='<text x="'+x.toFixed(1)+'" y="'+(H-B+15)+'" text-anchor="middle" font-size="9.5" fill="#8594AD">'+(v>0?'+':v<0?'−':'')+Math.abs(v)+'%</text>';});
  const mxp=xOf(o.prem.mean),mdp=xOf(o.prem.med);
  g+='<line x1="'+mxp.toFixed(1)+'" x2="'+mxp.toFixed(1)+'" y1="'+(T-8)+'" y2="'+(T+ih)+'" stroke="#0F1729" stroke-width="1.5"/>';
  const right=mxp>W-110, tx=right?mxp-6:mxp+6;
  g+='<text x="'+tx.toFixed(1)+'" y="'+(T-24)+'" text-anchor="'+(right?'end':'start')+'" font-size="10" font-weight="700" fill="#0F1729">Average '+nf(o.prem.mean,1)+'%</text><text x="'+tx.toFixed(1)+'" y="'+(T-12)+'" text-anchor="'+(right?'end':'start')+'" font-size="9.5" fill="#4A5568">Median '+nf(o.prem.med,1)+'%</text>';
  el.innerHTML='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Distribution of pre-bid speculation premia">'+g+'</svg>';
  bindTips(el);
}

/* ---------- render ---------- */
let R=[],O=null,B=null;
function delta(v,b,unit,dec){if(v==null||b==null)return '';const d=v-b;if(Math.abs(d)<Math.pow(10,-dec)/2)return '<i>=</i> in line with all';return '<i>'+(d>0?'▲ ':'▼ ')+nf(Math.abs(d),dec)+unit+'</i> vs all '+(S.uni==='all'?'offers':'firm offers');}
function tile(val,unit,label,sub,dl,hl){return '<div class="os-k'+(hl?' hl':'')+'"><div class="kv">'+val+(val!=='—'&&unit?'<span class="u">'+unit+'</span>':'')+'</div><div class="kl">'+label+'</div><div class="sub">'+sub+'</div><div class="dl2">'+(dl||'&nbsp;')+'</div></div>';}
function update(){
  if(window.__orvUpdate)setTimeout(window.__orvUpdate,0);
  R=D.filter(r=>pass(r,S));
  const base=D.filter(r=>pass(r,S,true));
  B=stats(base);O=stats(R);
  const af=activeFilters(),filt=af.length>0;
  const uniTxt=S.uni==='all'?'offers and possible offers':'firm offers';
  $('#os-count').innerHTML='Showing <b>'+nf(O.n)+'</b> '+uniTxt+' in <b>'+nf(O.sit)+'</b> bid situations';
  $('#os-af').innerHTML=filt?af.map(a=>'<span>'+esc(a)+'</span>').join(''):'<span class="none">No criteria applied</span>';
  $('#os-asat').textContent='Data as at '+RAW.snap;
  $('#os-uni-h').textContent=S.uni==='all'?'Firm offers plus possible offers where that bidder never went firm.':'Firm offers only. Add possible offers to see how often PUSUs convert.';
  $$('#os-att [data-a="NA"]').forEach(l=>l.hidden=S.uni!=='all');
  {const a=[...S.att].sort().join();$$('#os-att-pre button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p==='all'?S.att.size===ATT.length:b.dataset.p==='fr'?a==='Fr':a==='Ho,IH')));}
  $('#os-warn').innerHTML=O.n>0&&O.n<10?'<div class="os-warn">Small sample: only '+O.n+' offer'+(O.n>1?'s':'')+' match these criteria, so treat the percentages with care.</div>':'';
  if(!O.n){
    $('#os-kpis').innerHTML='<div class="card os-empty" style="grid-column:1/-1">No offers match these criteria. Widen the equity value or year range, or reset the criteria.</div>';
    ['#os-comp','#os-inc','#os-yc','#os-hc'].forEach(s=>$(s).innerHTML='<div class="os-empty">No matching offers</div>');
    $('#os-comp-s').textContent='';$('#os-hc-s').textContent='';$('#os-yr-lgd').innerHTML='';renderTable();return;
  }
  const k=[];
  k.push(tile(nf(O.n),'',S.uni==='all'?'Offers & possible offers':'Firm offers','in <b>'+nf(O.sit)+'</b> bid situations'+(S.uni==='all'?' · <b>'+nf(O.cnt.X)+'</b> possible only':''),filt?'<i>'+nf(pc(O.n,B.n),1)+'%</i> of all '+(S.uni==='all'?'offers':'firm offers'):'',true));
  k.push(tile(nf(O.prem.mean,1),'%','Avg pre-bid speculation premium','Median <b>'+nf(O.prem.med,1)+'%</b> · '+nf(O.prem.n)+' priced',filt?delta(O.prem.mean,B.prem.mean,' pts',1):''));
  k.push(tile(nf(O.op.mean,0),' days','Avg offer period','Median <b>'+nf(O.op.med,0)+'</b> days · '+nf(O.op.n)+' offer periods',filt?delta(O.op.mean,B.op.mean,' days',0):''));
  k.push(tile(nf(O.d1.mean,0),' days','Firm offer to completion','Median <b>'+nf(O.d1.med,0)+'</b> days'+(O.d1.fn?' · failed offers lapse after <b>'+nf(O.d1.fmean,0)+'</b>':''),filt?delta(O.d1.mean,B.d1.mean,' days',0):''));
  k.push(tile(nf(O.pusu.pct,1),'%','With a PUSU deadline','<b>'+nf(pc(O.pusu.ey,O.pusu.en),1)+'%</b> of PUSUs extended'+(S.uni==='all'?' · <b>'+nf(pc(O.pusu.cy,O.pusu.cn),1)+'%</b> went firm':''),filt?delta(O.pusu.pct,B.pusu.pct,' pts',1):''));
  k.push(tile(nf(O.fail.pct,1),'%','Firm offers failed','<b>'+nf(O.fail.y)+'</b> of '+nf(O.fail.n)+' resolved'+(S.uni==='all'?' · <b>'+nf(O.fail.nf,1)+'%</b> of approaches never went firm':''),filt?delta(O.fail.pct,B.fail.pct,' pts',1):''));
  k.push(tile(nf(O.host.pct,1),'%','Hostile','Hostile <b>'+O.host.ho+'</b> · initially hostile <b>'+O.host.ih+'</b>',filt?delta(O.host.pct,B.host.pct,' pts',1):''));
  k.push(tile(nf(O.comp.pct,1),'%','Competing situations','<b>'+nf(O.comp.n)+'</b> of '+nf(O.sit)+' bid situations had a rival bidder',filt?delta(O.comp.pct,B.comp.pct,' pts',1):''));
  $('#os-kpis').innerHTML=k.join('');

  // competing
  const c=O.comp;
  $('#os-comp-s').textContent=nf(c.n)+' contested situation'+(c.n===1?'':'s')+(c.w.U?' · '+c.w.U+' unresolved':'');
  if(!c.res){$('#os-comp').innerHTML='<div class="os-empty">'+(c.n?'Contests for these criteria are still unresolved':'No competing situations for these criteria')+'</div>';}
  else{
    const seg=(n,p,col,lab)=>n?'<span style="flex:'+n+';background:'+col+'" title="'+lab+'">'+(p>=18?nf(p,0)+'%':'')+'</span>':'';
    $('#os-comp').innerHTML='<div class="os-cells"><div><div class="kv">'+nf(c.pO,1)+'<span class="u">%</span></div><div class="kl">First bidder won</div></div><div><div class="kv">'+nf(c.pL,1)+'<span class="u">%</span></div><div class="kl">Later bidder won</div></div><div><div class="kv">'+nf(c.pN,1)+'<span class="u">%</span></div><div class="kl">Neither won</div></div></div>'+
      '<div class="card-bd" style="display:grid;gap:10px"><div class="os-split" role="img" aria-label="First bidder won '+nf(c.pO,1)+'%, later bidder won '+nf(c.pL,1)+'%, neither won '+nf(c.pN,1)+'%">'+seg(c.w.O,c.pO,'#4F6EF7','First bidder')+seg(c.w.L,c.pL,'#B07D00','Later bidder')+seg(c.w.N,c.pN,'#8594AD','Neither')+'</div>'+
      '<div class="lgd"><span><i style="background:#4F6EF7"></i>First bidder won · '+c.w.O+'</span><span><i style="background:#B07D00"></i>Later bidder won · '+c.w.L+'</span><span><i style="background:#8594AD"></i>Neither won · '+c.w.N+'</span></div>'+
      '<div class="os-hint">Based on '+c.res+' resolved contest'+(c.res===1?'':'s')+(c.w.U?'; '+c.w.U+' still live':'')+'.</div></div>';
  }
  // increases
  const n=O.inc;
  if(!n.n){$('#os-inc').innerHTML='<div class="os-empty">'+(S.uni==='all'&&O.firm===0?'Possible offers only: no firm offer to increase':'No firm offer prices for these criteria')+'</div>';}
  else $('#os-inc').innerHTML='<div class="os-cells"><div><div class="kv">'+nf(n.pct,1)+'<span class="u">%</span></div><div class="kl">Offers increased</div></div><div><div class="kv">'+(n.y?nf(n.mean,1)+'<span class="u">%</span>':'—')+'</div><div class="kl">Average increase</div></div><div><div class="kv">'+(n.y?nf(n.med,1)+'<span class="u">%</span>':'—')+'</div><div class="kl">Median increase</div></div></div>'+
    '<div class="os-lines">'+
    '<div class="os-line"><span>Firm offers increased</span><b>'+nf(n.y)+'<small>of '+nf(n.n)+'</small></b></div>'+
    '<div class="os-line"><span>Completion rate when increased</span><b>'+nf(n.crU.pct,1)+'%<small>n='+n.crU.n+'</small></b></div>'+
    '<div class="os-line"><span>Completion rate when not increased</span><b>'+nf(n.crN.pct,1)+'%<small>n='+n.crN.n+'</small></b></div>'+
    '<div class="os-line"><span>Indicative proposal raised at least once</span><b>'+nf(pc(n.icy,n.icn),1)+'%<small>of '+nf(n.icn)+' with a price</small></b></div>'+
    '</div>';
  yearChart(R);histChart(O);
  shown=25;renderTable();
}

/* ---------- table ---------- */
const COLS=[['d','Date'],['t','Target / bidder'],['s','Status'],['a','Attitude'],['ev','Equity value £m','r'],['pr','Spec. premium','r'],['ip','Increase','r'],['cp','Competing','c']];
function renderTable(){
  const val=(r,k)=>k==='a'?(ATTN[r.a||'NA']):k==='ip'?(r.in===1?r.ip:r.in===0?0:null):k==='s'?ST[r.s]:r[k];
  const rows=[...R].sort((a,b)=>{const x=val(a,sortK),y=val(b,sortK);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x<y?-1:x>y?1:0)*sortD;});
  const th='<thead><tr>'+COLS.map(c=>'<th class="s'+(c[2]?' '+c[2]:'')+(c[0]===sortK?' so':'')+'" data-k="'+c[0]+'" aria-sort="'+(c[0]===sortK?(sortD>0?'ascending':'descending'):'none')+'" tabindex="0">'+c[1]+'<span class="ar">'+(c[0]===sortK&&sortD>0?'▲':'▼')+'</span></th>').join('')+'</tr></thead>';
  const fd=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
  const body=rows.slice(0,shown).map(r=>{
    const stc=r.s==='X'?'Proposed':ST[r.s];
    return '<tr><td><span class="dt">'+fd(r.d)+'</span></td><td><div class="tn">'+esc(r.t)+'</div><div class="bn">'+esc(r.b||'—')+'</div></td>'+
    '<td><span class="stat stat-'+stc+'">'+ST[r.s]+(r.lv?' · live':'')+'</span></td>'+
    '<td><span class="os-att'+(r.a==='Ho'||r.a==='IH'?' h':'')+'">'+(r.a?ATTN[r.a]:'<span class="muted">—</span>')+'</span></td>'+
    '<td class="r num'+(r.ev==null?' muted':'')+'">'+(r.ev==null?'—':nf(r.ev,1))+'</td>'+
    '<td class="r num'+(r.pr==null?' muted':'')+'">'+(r.pr==null?'—':nf(r.pr,1)+'%')+'</td>'+
    '<td class="r num'+(r.in!==1?' muted':'')+'">'+(r.in===1?'+'+nf(r.ip,1)+'%':r.in===0?'No':'—')+'</td>'+
    '<td class="c">'+(r.cp?'<span class="yes">YES</span>':'<span class="muted">—</span>')+'</td></tr>';
  }).join('');
  $('#os-tbl').innerHTML=th+'<tbody>'+(body||'<tr><td colspan="8" class="os-empty">No matching offers</td></tr>')+'</tbody>';
  $('#os-tcount').innerHTML='Showing <b>'+nf(Math.min(shown,rows.length))+'</b> of '+nf(rows.length);
  $('#os-more').hidden=shown>=rows.length;
}
$('#os-tbl').addEventListener('click',e=>{const t=e.target.closest('th[data-k]');if(!t)return;const k=t.dataset.k;if(k===sortK)sortD=-sortD;else{sortK=k;sortD=(k==='t'||k==='s'||k==='a')?1:-1;}renderTable();});
$('#os-tbl').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('th[data-k]')){e.preventDefault();e.target.click();}});
$('#os-more').addEventListener('click',()=>{shown+=25;renderTable();});

syncControls();
let rendered=false;
window.__renderStats=()=>{if(!rendered){rendered=true;update();}else{yearChart(R);histChart(O);}};

addEventListener('resize',(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(()=>{if(location.hash==='#arb-stats'&&O&&O.n){yearChart(R);histChart(O);}},150);};})());
window.__osStats=()=>({S,O,B,pass,D});
})();

};
