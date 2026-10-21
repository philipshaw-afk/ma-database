/* ARB-Insight · Offer revisions view of the Offer Statistics screen.
   Ported from the integrated-site mockup; offer price paths come from Supabase (db_uk_offer_paths). */
window.MAM_initRevisions=function(){
/* ================= ARB: OFFER STATISTICS · OFFER REVISIONS VIEW ================= */
(function(){
const root=document.getElementById('orv'),src=window.MAM.ukStats&&window.MAM.ukStats.paths,sec=document.querySelector('[data-screen="arb-stats"]');
if(!root||!src||!sec||!window.__osStats)return;
const X=src;
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=(v,d=0)=>v==null||!isFinite(v)?'—':v.toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
const sg=(v,d=1)=>v==null||!isFinite(v)?'—':(v>=0.05?'+':v<=-0.05?'−':'')+nf(Math.abs(v),d);
const pc=(n,d)=>d?nf(n/d*100,1)+'%':'—';
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const quant=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};
const median=a=>quant(a,.5);
const px=v=>v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:4});
const fd=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
const days=(a,b)=>a&&b?Math.round((Date.parse(b)-Date.parse(a))/864e5):null;
const pcol=v=>v>=0.05?'up':v<=-0.05?'dn':'z';
const ST={C:'Completed',F:'Failed',P:'Pending',X:'Possible offer'};
/* attitude is held once per bid: 'Initially hostile' = hostile at the first offer, friendly at the last */
const FLOW={IH:['Ho','Fr'],Ho:['Ho','Ho'],Fr:['Fr','Fr'],WK:['WK','WK'],Ne:['Ne','Ne'],NA:['NA','NA']};
const AN={Fr:'Friendly',Ho:'Hostile',Ne:'Neutral',WK:'White knight',NA:'Not stated'};
const AORD=['Fr','Ho','Ne','WK','NA'],FORDER=['IH','Ho','Fr','WK','Ne','NA'];
const hc=a=>a==='Ho'?'h':a==='Fr'?'f':'';
const flow=k=>{const f=FLOW[k]||FLOW.NA;return f[0]===f[1]?'<span class="orv-fl"><span class="'+hc(f[0])+'">'+AN[f[0]]+'</span></span>':'<span class="orv-fl"><span class="'+hc(f[0])+'">'+AN[f[0]]+'</span><span class="x">→</span><span class="'+hc(f[1])+'">'+AN[f[1]]+'</span></span>';};

/* stages: indicative 1st-5th + last, formal 1st-5th + last */
const ORD=['1st','2nd','3rd','4th','5th'];
const STAGES=['i','f'].flatMap(c=>[1,2,3,4,5,0].map(n=>({k:c+(n||'L'),c,n,short:n?ORD[n-1]:'Last',kind:c==='i'?'indicative':'formal',noun:c==='i'?'proposal':'offer'})));
STAGES.forEach((s,i)=>{s.o=i;s.long=(s.n?s.short:'last')+' '+s.kind;s.full=s.long+' '+s.noun;});
const SI=Object.fromEntries(STAGES.map(s=>[s.k,s]));
const U={mode:'f',end:'out',sel:new Set(['f1','f2']),ref:0,scope:'up',hist:'px',sortK:'chg',sortD:-1,shown:15};
const priceAt=(r,x,s)=>{const a=s.c==='i'?x.i:(r.s!=='X'?x.f:null);if(!a||!a.length)return null;return s.n?(a.length>=s.n?a[s.n-1]:null):a[a.length-1];};
const UP=0.0005,isUp=(a,b)=>b/a-1>=UP,isDn=(a,b)=>b/a-1<=-UP;

/* tooltip */
const tip=document.createElement('div');tip.className='os-tip';tip.setAttribute('role','tooltip');document.body.appendChild(tip);
const tipOn=(e,h)=>{tip.innerHTML=h;tip.classList.add('on');const w=tip.offsetWidth,hh=tip.offsetHeight;let x=e.clientX+14,y=e.clientY-hh-12;if(x+w>innerWidth-8)x=e.clientX-w-14;if(y<8)y=e.clientY+16;tip.style.left=x+'px';tip.style.top=y+'px';};
const tipOff=()=>tip.classList.remove('on');
root.addEventListener('pointermove',e=>{const t=e.target.closest('[data-tip]');t?tipOn(e,t.dataset.tip):tipOff();});
root.addEventListener('pointerleave',tipOff);addEventListener('scroll',tipOff,{passive:true});

/* the comparison in hand: labels for its two ends, and a point list per bid */
let B=[],C=[],T=[],SEL=[],LAB=[],PATH='',EXCL=0,UNIV={};
function stagesFor(){
  if(U.mode==='f')return [SI.f1,SI.fL];
  if(U.mode==='p')return [SI.i1,U.end==='iL'?SI.iL:SI.fL];
  return [...U.sel].map(k=>SI[k]).sort((a,b)=>a.o-b.o);
}
function ptsFor(r,x){
  if(U.mode==='f'){if(r.s==='X'||!x.f||!x.f.length)return null;return [x.f[0],x.f[x.f.length-1]];}
  if(U.mode==='p'){if(!x.i||!x.i.length)return null;const f=r.s!=='X'&&x.f&&x.f.length?x.f:null;
    const end=U.end==='iL'?x.i[x.i.length-1]:U.end==='fL'?(f?f[f.length-1]:null):(f?f[f.length-1]:x.i[x.i.length-1]);return end?[x.i[0],end]:null;}
  const pts=SEL.map(s=>priceAt(r,x,s));return pts.some(p=>!p)?null:pts;
}
function outcome(r,x){const f=r.s!=='X'&&x.f&&x.f.length;return f?{k:'firm',t:'Went firm · '+ST[r.s]+(r.lv?' · live':''),c:r.s==='F'?'r':r.s==='C'?'g':'m'}:r.lv?{k:'live',t:'Possible offer · live',c:'m'}:{k:'lapsed',t:'No firm offer',c:'m'};}

function build(){
  const st=window.__osStats(),S2=Object.assign({},st.S,{uni:'all'});
  B=st.D.filter(r=>X[r.no]&&st.pass(r,S2));
  SEL=stagesFor();
  C=[];EXCL=0;
  B.forEach(r=>{const x=X[r.no],pts=ptsFor(r,x);if(!pts)return;
    const p0=pts[0][1],pN=pts[pts.length-1][1];
    if(pts.some(p=>p[1]/p0>3||p[1]/p0<1/3)){EXCL++;return;}
    const ref=x.ref[U.ref],odd=!!ref&&pts.some(p=>p[1]/ref>8||p[1]/ref<0.125);
    const c={r,x,pts,prem:ref&&!odd?pts.map(p=>(p[1]/ref-1)*100):null,pchk:odd,chg:(pN/p0-1)*100,att:r.a||'NA',dd:days(pts[0][0],pts[pts.length-1][0]),out:outcome(r,x)};
    c.up=pts.some((p,i)=>i&&isUp(pts[i-1][1],p[1]));c.dn=!c.up&&isDn(p0,pN);
    C.push(c);});
  T=U.scope==='all'?C:C.filter(c=>c.up);
  if(U.mode==='f'){LAB=['1st formal','Last formal'];PATH='1st formal → last formal offer';}
  else if(U.mode==='p'){const e=U.end==='iL'?'Last proposal':U.end==='fL'?'Last formal':'Final outcome';LAB=['1st proposal',e];PATH='1st proposal → '+e.toLowerCase();}
  else{LAB=SEL.map(s=>s.long);PATH=SEL.map(s=>s.long).join(' → ');}
}

function clear(msg){
  $('orv-fun').innerHTML='';$('orv-warn').innerHTML='';$('orv-kpis').innerHTML='';$('orv-steps-card').hidden=true;
  $('orv-tbl').innerHTML='';$('orv-tcount').innerHTML='';$('orv-more').hidden=true;$('orv-note').innerHTML='';$('orv-att').innerHTML='';$('orv-yr').innerHTML='';
  $('orv-hist').innerHTML='<div class="os-empty">'+msg+'</div>';$('orv-hist-s').textContent='';$('orv-att-s').textContent='';$('orv-yr-s').textContent='';
}
function render(){
  root.dataset.mode=U.mode;
  const st=window.__osStats(),S2=Object.assign({},st.S,{uni:'all'});
  const base=st.D.filter(r=>X[r.no]&&st.pass(r,S2));
  /* counts on the mode cards and the custom chips */
  const nF=base.filter(r=>r.s!=='X'&&X[r.no].f&&X[r.no].f.length).length,nP=base.filter(r=>X[r.no].i&&X[r.no].i.length).length;
  $('orv-mn-f').textContent=nf(nF)+' bids';$('orv-mn-p').textContent=nf(nP)+' bids';$('orv-mn-c').textContent='any stage';
  const cnt={};STAGES.forEach(s=>cnt[s.k]=0);
  base.forEach(r=>{const x=X[r.no];STAGES.forEach(s=>{if(priceAt(r,x,s))cnt[s.k]++;});});
  ['i','f'].forEach(c=>{$('orv-c'+c).innerHTML=STAGES.filter(s=>s.c===c).map(s=>{const n=cnt[s.k],on=U.sel.has(s.k),off=n<5&&!on;
    const t=s.n?nf(n)+' bids made at least '+(s.n===1?'one':s.n)+' '+s.kind+' '+s.noun+(s.n>1?'s':''):'Each bid\'s last '+s.kind+' '+s.noun+' (the same as its highest numbered one)';
    return '<label class="chip'+(s.n?'':' lst')+(off?' off':'')+'" title="'+esc(t+(off?' · too few to compare':''))+'"><input type="checkbox" value="'+s.k+'"'+(on?' checked':'')+(off?' disabled':'')+'> '+s.short+'<span class="ct">'+nf(n)+'</span></label>';}).join('');});
  {const key=[...U.sel].map(k=>SI[k]).sort((a,b)=>a.o-b.o).map(s=>s.k).join(' ');root.querySelectorAll('#orv-pre button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p===key)));}
  $('orv-ref-h').hidden=U.mode!=='p';
  $('orv-end-h').textContent=U.end==='out'?'Each bid is followed to wherever it ended: its last formal offer if it went firm, otherwise its last indicative proposal.':U.end==='iL'?'Stays within the indicative proposals, whether or not the bid later went firm.':'Only bids that went on to a firm offer; the last formal offer is compared.';
  $('orv-af').innerHTML=$('os-af')?$('os-af').innerHTML:'';
  $('orv-asat').textContent=$('os-asat')?$('os-asat').textContent:'';
  if(U.mode==='c'&&U.sel.size<2){$('orv-count').innerHTML='Tick at least <b>two</b> stages to compare';$('orv-mode-s').textContent='';clear('Tick two or more boxes above, for example the 1st and 2nd formal offer.');return;}
  build();
  $('orv-mode-s').textContent=PATH;
  const nUp=C.filter(c=>c.up).length,nDn=C.filter(c=>c.dn).length,nZ=C.length-nUp-nDn;
  UNIV={n:C.length,up:nUp,dn:nDn,z:nZ};
  $('orv-count').innerHTML='<b>'+nf(C.length)+'</b> offer'+(C.length===1?'':'s')+' · <b>'+nf(nUp)+'</b> raised ('+pc(nUp,C.length)+') · '+esc(PATH);
  funnel(base,cnt);
  $('orv-warn').innerHTML=T.length&&T.length<10?'<div class="os-warn">Small sample: only '+T.length+' offer'+(T.length>1?'s':'')+' in the chart and table, so treat the averages with care.</div>':'';
  if(!C.length){clear(U.mode==='p'&&U.end==='fL'?'None of these possible offers went on to a firm offer.':'No offers reached both stages.');$('orv-fun').innerHTML=$('orv-fun').innerHTML;return;}
  kpis();steps();hist();attitude();byYear();table();
  const pb=T.filter(c=>c.pchk).length;
  $('orv-note').innerHTML='Prices are per share, in the offer currency. All the premia for an offer use the same reference share price, backed out of the DataBase premium for its final price, so the change in premium reflects the price change alone. '+
    'An offer counts as raised when its last price is above its first. Attitude is held once per bid, so "hostile to friendly" means the DataBase records the bid as <b>Initially hostile</b>. '+
    (U.mode==='p'?'A bid that went firm is compared with its last formal offer; one that never did with its last indicative proposal. ':'')+
    'Uses the criteria on the left apart from Offers included.'+(EXCL?' '+EXCL+' offer'+(EXCL>1?'s':'')+' with prices more than 3x apart '+(EXCL>1?'are':'is')+' left out as probable data errors.':'')+
    (pb?' '+pb+' offer'+(pb>1?'s have prices':' has a price')+' over 8x (or under an eighth of) the reference price, probably a pence / pounds slip, so '+(pb>1?'their premia are':'its premium is')+' left out.':'');
}

function funnel(base,cnt){
  const fs=(b,s,sm,on)=>'<div class="fs'+(on?' on':'')+'"><b>'+b+'</b><span>'+s+'</span>'+(sm?'<small>'+sm+'</small>':'')+'</div>';
  const n=C.length,nUp=UNIV.up,nDn=UNIV.dn,nZ=UNIV.z,ex=EXCL?' · '+EXCL+' left out as data errors':'';
  let h='';
  if(U.mode==='f'){
    h=fs(nf(n+EXCL),'made a formal offer','Rule 2.7 firm offers')+
      fs(nf(nUp)+'<small>'+pc(nUp,n)+'</small>','raised the price before their last formal offer',nf(nZ)+' never changed it'+(nDn?' · '+nDn+' lowered it':'')+ex,true);
  }else if(U.mode==='p'){
    const withP=base.filter(r=>X[r.no].i&&X[r.no].i.length),firm=withP.filter(r=>r.s!=='X'&&X[r.no].f&&X[r.no].f.length).length;
    h=fs(nf(withP.length),'put a price on an indicative proposal','Rule 2.4 possible offers')+
      fs(nf(firm)+'<small>'+pc(firm,withP.length)+'</small>','went on to a firm offer',nf(withP.length-firm)+' never did'+(U.end==='fL'?' and are left out':''))+
      fs(nf(nUp)+'<small>'+pc(nUp,n)+'</small>','ended above the first proposal',nf(nZ)+' unchanged'+(nDn?' · '+nDn+' ended lower':'')+ex,true);
  }else{
    const first=SEL[0],mid=SEL.slice(1),f1=cnt[first.k];
    h=fs(nf(f1),'made a '+esc(first.full),'')+
      fs(nf(n+EXCL)+(f1?'<small>'+pc(n+EXCL,f1)+'</small>':''),(mid.length>1?'also reached the '+mid.map(s=>esc(s.long)).join(', '):mid[0].n?'also made a '+esc(mid[0].full):mid[0].c===first.c?'compared with their last '+mid[0].kind+' '+mid[0].noun:'went on to a '+mid[0].kind+' '+mid[0].noun+' (the last one is compared)'),'')+
      fs(nf(nUp)+'<small>'+pc(nUp,n)+'</small>','raised the price'+(SEL.length>2?' at least once':''),nf(nZ)+' did not'+(nDn?' · '+nDn+' lowered it':'')+ex,true);
  }
  $('orv-fun').innerHTML=h;
}

function kpis(){
  const tile=(v,l,s,d,hl)=>'<div class="os-k'+(hl?' hl':'')+'"><div class="kv">'+v+'</div><div class="kl">'+l+'</div><div class="sub">'+s+'</div><div class="dl2">'+(d||'&nbsp;')+'</div></div>';
  const up=C.filter(c=>c.up),all=C;
  const ch=up.map(c=>c.chg),chA=all.map(c=>c.chg);
  const pr=up.filter(c=>c.prem),prA=all.filter(c=>c.prem);
  const p0=pr.map(c=>c.prem[0]),p1=pr.map(c=>c.prem[c.prem.length-1]),dp=pr.map(c=>c.prem[c.prem.length-1]-c.prem[0]),dpA=prA.map(c=>c.prem[c.prem.length-1]-c.prem[0]);
  const dd=up.map(c=>c.dd).filter(v=>v!=null&&v>=0);
  const hs=all.filter(c=>c.att==='IH'||c.att==='Ho'),ih=all.filter(c=>c.att==='IH').length,ho=hs.length-ih;
  const hUp=hs.filter(c=>c.up).length,fr=all.filter(c=>c.att==='Fr'),frUp=fr.filter(c=>c.up).length;
  const k=[];
  k.push(tile('<span class="'+(up.length?'up':'z')+'">'+pc(up.length,all.length)+'</span>','Offers raised','<b>'+nf(up.length)+'</b> of '+nf(all.length)+' ended above their first price'+(UNIV.dn?' · <b>'+UNIV.dn+'</b> ended lower':''),esc(PATH),true));
  k.push(tile(up.length?'<span class="'+pcol(mean(ch))+'">'+sg(mean(ch))+'<span class="u">%</span></span>':'—','Average increase, raised offers',up.length?'Median <b>'+sg(median(ch))+'%</b> · largest <b>'+sg(Math.max(...ch))+'%</b>':'No offer was raised','Across all '+nf(all.length)+' offers: '+sg(mean(chA))+'%'));
  k.push(tile(pr.length?'<span class="'+pcol(mean(dp))+'">'+sg(mean(dp))+'<span class="u"> pts</span></span>':'—','Change in premium, raised offers',pr.length?'Average <b>'+nf(mean(p0),1)+'%</b> → <b>'+nf(mean(p1),1)+'%</b><br>Median <b>'+nf(median(p0),1)+'%</b> → <b>'+nf(median(p1),1)+'%</b>':'No reference price for these offers',prA.length?'All offers: '+sg(mean(dpA))+' pts'+(prA.length<all.length?' · '+nf(prA.length)+' with a premium':''):''));
  k.push(tile(dd.length?nf(mean(dd))+'<span class="u"> days</span>':'—','Days between, raised offers',dd.length?'Median <b>'+nf(median(dd))+'</b> days · longest <b>'+nf(Math.max(...dd))+'</b>':'No dates to compare',dd.length<up.length?nf(dd.length)+' of '+nf(up.length)+' with both dates':esc(PATH)));
  k.push(tile(nf(ih),'Hostile to friendly',hs.length?'<b>'+ih+'</b> of the '+hs.length+' that started hostile'+(ho?' · <b>'+ho+'</b> stayed hostile':''):'None of these offers started hostile',hs.length&&fr.length?'Raised: hostile '+pc(hUp,hs.length)+' · friendly '+pc(frUp,fr.length):''));
  $('orv-kpis').innerHTML=k.join('');
}

function steps(){
  const card=$('orv-steps-card');card.hidden=!(U.mode==='c'&&SEL.length>=3);if(card.hidden)return;
  const row=(lab,i0,i1,bold)=>{const a=T.map(c=>(c.pts[i1][1]/c.pts[i0][1]-1)*100),up=a.filter(v=>v>=0.05).length,pr=T.filter(c=>c.prem),dp=pr.map(c=>c.prem[i1]-c.prem[i0]),d=T.map(c=>days(c.pts[i0][0],c.pts[i1][0])).filter(v=>v!=null&&v>=0);
    return '<tr'+(bold?' class="tot"':'')+'><td><span class="orv-st">'+lab+'</span></td><td class="r"><span class="nb">'+up+'<small style="color:var(--t3);font-weight:500"> of '+a.length+'</small></span></td><td class="r"><span class="nb '+pcol(mean(a))+'">'+sg(mean(a))+'%</span></td><td class="r"><span class="nb '+pcol(median(a))+'">'+sg(median(a))+'%</span></td><td class="r"><span class="nb '+pcol(mean(dp))+'">'+(dp.length?sg(mean(dp))+' pts':'—')+'</span></td><td class="r"><span class="nb">'+(d.length?nf(mean(d)):'—')+'</span></td></tr>';};
  let h='<div class="tscr"><table class="orv-steps"><thead><tr><th>Step</th><th class="r">Raised</th><th class="r">Avg change</th><th class="r">Median</th><th class="r">Change in premium</th><th class="r">Avg days</th></tr></thead><tbody>';
  for(let i=1;i<SEL.length;i++)h+=row(SEL[i-1].long+'<span class="x">→</span>'+SEL[i].long,i-1,i);
  h+=row('First to last · '+SEL[0].long+'<span class="x">→</span>'+SEL[SEL.length-1].long,0,SEL.length-1,true);
  $('orv-steps').innerHTML=h+'</tbody></table></div>';
}

/* histogram of the size of the increase (price %, or premium points) */
function hist(){
  const el=$('orv-hist'),isP=U.hist==='pr';
  const rows=T.map(c=>({c,v:isP?(c.prem?c.prem[c.prem.length-1]-c.prem[0]:null):c.chg})).filter(o=>o.v!=null);
  $('orv-hist-t').textContent=(U.scope==='all'?'Size of the ':'Size of the increase in ')+(isP?'premium':'price')+(U.scope==='all'?' change':'');
  if(!rows.length){el.innerHTML='<div class="os-empty">'+(isP?'No reference price for these offers':'No offers to chart')+'</div>';$('orv-hist-s').textContent='';return;}
  const vals=rows.map(o=>o.v);
  $('orv-hist-s').innerHTML='Average <b>'+sg(mean(vals))+(isP?' pts':'%')+'</b> · median <b>'+sg(median(vals))+(isP?' pts':'%')+'</b> · '+nf(rows.length)+' offer'+(rows.length===1?'':'s');
  const E=[0,5,10,15,20,25,30,40,50,75,100],bins=[];
  if(U.scope==='all'){bins.push({l:'Lowered',cls:'dn',t:(v)=>v<=-0.05});bins.push({l:'No change',cls:'z',t:(v)=>Math.abs(v)<0.05});}
  for(let i=0;i<E.length;i++){const a=E[i],b=E[i+1];bins.push({l:b==null?nf(a)+(isP?' pts+':'%+'):nf(a)+'–'+nf(b)+(isP?'':'%'),cls:'',t:v=>v>=(i?a:0.05)&&(b==null||v<b)});}
  bins.forEach(b=>{b.o=rows.filter(o=>b.t(o.v));b.n=b.o.length;});
  const W=Math.max(300,el.clientWidth-28),H=230,L=34,R=10,T0=22,Bm=38,m=bins.length,iw=(W-L-R)/m,mx=Math.max(1,...bins.map(b=>b.n)),ih=H-T0-Bm;
  const st=mx<=10?2:mx<=25?5:mx<=60?10:mx<=150?25:mx<=400?50:100,yhi=Math.ceil(mx/st)*st,ys=v=>T0+(1-v/yhi)*ih;
  let g='';
  for(let v=0;v<=yhi;v+=st){const y=ys(v);g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="'+(v?'rgba(15,23,41,.07)':'rgba(15,23,41,.22)')+'"/><text x="'+(L-6)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9.5" fill="#8594AD">'+nf(v)+'</text>';}
  bins.forEach((b,i)=>{const x=L+i*iw+iw*.14,w=iw*.72,y=ys(b.n),h=Math.max(0,T0+ih-y);
    const ex=b.o.slice().sort((p,q)=>q.v-p.v).slice(0,3).map(o=>esc(o.c.r.t)).join(', ');
    const t='<b>'+b.l+(isP?' premium':b.cls?'':' price')+'</b><div class="r2"><span>Offers</span><span>'+b.n+'</span></div><div class="r2"><span>Share</span><span>'+pc(b.n,rows.length)+'</span></div>'+(ex?'<div style="opacity:.75;margin-top:3px;font-size:10.5px">'+ex+(b.n>3?' …':'')+'</div>':'');
    g+='<rect class="hb '+b.cls+'" x="'+x.toFixed(1)+'" y="'+(b.n?y.toFixed(1):T0+ih)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3" data-tip="'+esc(t)+'"/>';
    if(b.n)g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(y-4).toFixed(1)+'" text-anchor="middle" font-size="9.5" font-weight="700" fill="#4A5568" style="pointer-events:none">'+b.n+'</text>';
    g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-Bm+14)+'" text-anchor="middle" font-size="9" fill="#8594AD" style="font-family:var(--sans)"'+(m>10?' transform="rotate(-28 '+(x+w/2).toFixed(1)+' '+(H-Bm+14)+')"':'')+'>'+b.l+'</text>';});
  g+='<text x="'+((L+W-R)/2).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle" font-size="9.5" fill="#8594AD" style="font-family:var(--sans)">'+(isP?'Change in premium, percentage points':'Increase in the price per share')+'</text>';
  el.innerHTML='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Offers by size of '+(isP?'premium change':'price increase')+'">'+g+'</svg>';
}

/* attitude at the first and last offer */
function attitude(){
  const first={},last={};AORD.forEach(a=>{first[a]=[];last[a]=[];});
  C.forEach(c=>{const f=FLOW[c.att]||FLOW.NA;first[f[0]].push(c);last[f[1]].push(c);});
  const n=C.length,ih=C.filter(c=>c.att==='IH').length;
  const bar=(lab,d)=>'<div class="row"><span class="lab">'+lab+'</span><div class="abar">'+AORD.filter(a=>d[a].length).map(a=>{const k=d[a].length,w=k/n*100;return '<span class="'+a+'" style="flex:'+k+' 1 0" data-tip="<b>'+AN[a]+' at the '+lab.toLowerCase()+'</b><div class=r2><span>Offers</span><span>'+k+'</span></div><div class=r2><span>Share</span><span>'+pc(k,n)+'</span></div>">'+(w>=9?pc(k,n):'')+'</span>';}).join('')+'</div></div>';
  let h='<div class="orv-attb">'+bar('First offer',first)+bar('Last offer',last)+'</div>';
  h+='<div class="orv-attl">'+AORD.map(a=>'<span><i style="background:'+({Fr:'#0D9B6A',Ho:'#D92D20',Ne:'#8594AD',WK:'#7C5CFC',NA:'#C9D2E3'})[a]+'"></i>'+AN[a]+'</span>').join('')+'</div>';
  h+='<div class="tscr"><table class="orv-att"><thead><tr><th>Attitude</th><th class="r">At first</th><th class="r">At last</th><th class="r">Raised</th><th class="r">Avg increase</th></tr></thead><tbody>';
  AORD.forEach(a=>{const f=first[a],l=last[a];if(!f.length&&!l.length)return;const up=f.filter(c=>c.up),ch=up.map(c=>c.chg);
    h+='<tr><td><span class="sw" style="background:'+({Fr:'#0D9B6A',Ho:'#D92D20',Ne:'#8594AD',WK:'#7C5CFC',NA:'#C9D2E3'})[a]+'"></span>'+AN[a]+'</td><td class="r"><span class="nb">'+nf(f.length)+'</span> <small>'+pc(f.length,n)+'</small></td><td class="r"><span class="nb">'+nf(l.length)+'</span> <small>'+pc(l.length,n)+'</small></td><td class="r"><span class="nb">'+(f.length?pc(up.length,f.length):'—')+'</span> <small>'+(f.length?up.length+' of '+f.length:'')+'</small></td><td class="r"><span class="nb '+(ch.length?pcol(mean(ch)):'z')+'">'+(ch.length?sg(mean(ch))+'%':'—')+'</span></td></tr>';});
  h+='</tbody></table></div>';
  $('orv-att').innerHTML=h;
  $('orv-att-s').innerHTML=ih?'<b>'+ih+'</b> hostile bid'+(ih>1?'s':'')+' turned friendly · all '+nf(n)+' offers':'All '+nf(n)+' offers';
}

/* share raised and average increase, by year */
function byYear(){
  const el=$('orv-yr'),st=window.__osStats(),yrs={};
  C.forEach(c=>{const y=c.r.y;(yrs[y]=yrs[y]||{n:0,up:[],dpl:[]}).n++;if(c.up){yrs[y].up.push(c.chg);}});
  const Y=Object.keys(yrs).map(Number).sort((a,b)=>a-b);
  if(Y.length<2){el.innerHTML='<div class="os-empty">Widen the year range to see the pattern over time</div>';$('orv-yr-s').textContent='';return;}
  $('orv-yr-s').textContent=Y[0]+' to '+Y[Y.length-1]+' · '+nf(C.length)+' offers · hover a bar';
  const panel=(title,sub,get,unit,fill)=>{
    const W=Math.max(260,(el.clientWidth-28)/2-28),H=170,L=34,R=6,T0=14,Bm=24,ih=H-T0-Bm,iw=(W-L-R)/Y.length;
    const v=Y.map(y=>get(yrs[y])),mx=Math.max(...v.map(o=>o.v||0),unit==='%'?10:5);
    const stp=unit==='%'?(mx<=20?5:mx<=50?10:mx<=100?25:50):(mx<=20?5:mx<=50?10:25),yhi=Math.ceil(mx/stp)*stp,ys=x=>T0+(1-x/yhi)*ih;
    let g='';
    for(let k=0;k<=yhi;k+=stp){const y=ys(k);g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="'+(k?'rgba(15,23,41,.07)':'rgba(15,23,41,.22)')+'"/><text x="'+(L-5)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end" font-size="9" fill="#8594AD">'+nf(k)+unit+'</text>';}
    Y.forEach((y,i)=>{const o=v[i],x=L+i*iw+iw*.18,w=iw*.64;
      if(o.v!=null){const yy=ys(o.v);g+='<rect class="yb" x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+(T0+ih-yy).toFixed(1)+'" rx="2.5" fill="'+fill+'" data-tip="<b>'+y+'</b>'+o.t+'"/>';}
      else g+='<rect x="'+x.toFixed(1)+'" y="'+(T0+ih-2)+'" width="'+w.toFixed(1)+'" height="2" fill="rgba(15,23,41,.12)" data-tip="<b>'+y+'</b>'+o.t+'"/>';
      if(Y.length<=12||i%2===0||i===Y.length-1)g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-Bm+13)+'" text-anchor="middle" font-size="8.5" fill="#8594AD">'+String(y).slice(2)+'</text>';});
    return '<div><div class="yt">'+title+'</div><div class="ys">'+sub+'</div><svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+title+' by year">'+g+'</svg></div>';
  };
  el.innerHTML=panel('Share of offers raised','Of all offers compared in each year',o=>({v:o.n?o.up.length/o.n*100:null,t:'<div class=r2><span>Raised</span><span>'+o.up.length+' of '+o.n+'</span></div><div class=r2><span>Share</span><span>'+pc(o.up.length,o.n)+'</span></div>'}),'%','#4F6EF7')+
    panel('Average increase','Raised offers only · faint tick = none raised that year',o=>({v:o.up.length?mean(o.up):null,t:o.up.length?'<div class=r2><span>Average</span><span>'+sg(mean(o.up))+'%</span></div><div class=r2><span>Median</span><span>'+sg(median(o.up))+'%</span></div><div class=r2><span>Raised offers</span><span>'+o.up.length+'</span></div>':'<div class=r2><span>Raised offers</span><span>0</span></div>'}),'%','#0D9B6A');
}

function table(){
  const cols=[['t','Target / bidder'],['att','Attitude']].concat(U.mode==='p'?[['out','Outcome']]:[]).concat(LAB.map((l,i)=>['s'+i,l,'r'])).concat([['chg',U.scope==='all'?'Change':'Increase','r'],['dd','Days','r']]);
  if(!cols.some(c=>c[0]===U.sortK)){U.sortK='chg';U.sortD=-1;}
  const val=(c,k)=>k==='t'?c.r.t:k==='att'?FORDER.indexOf(c.att):k==='out'?c.out.t:k==='chg'?c.chg:k==='dd'?c.dd:k[0]==='s'?(c.prem?c.prem[+k.slice(1)]:null):null;
  const rows=[...T].sort((a,b)=>{const x=val(a,U.sortK),y=val(b,U.sortK);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x<y?-1:x>y?1:0)*U.sortD;});
  const th='<thead><tr>'+cols.map(c=>'<th class="s'+(c[2]?' '+c[2]:'')+(c[0]===U.sortK?' so':'')+'" data-k="'+c[0]+'" tabindex="0" aria-sort="'+(c[0]===U.sortK?(U.sortD>0?'ascending':'descending'):'none')+'">'+c[1]+'<span class="ar">'+(c[0]===U.sortK&&U.sortD>0?'▲':'▼')+'</span></th>').join('')+'</tr></thead>';
  const body=rows.slice(0,U.shown).map(c=>'<tr><td><div class="tn">'+esc(c.r.t)+'</div><div class="bn">'+esc(c.r.b||'—')+'</div>'+(U.mode==='p'?'':'<div class="st2">'+ST[c.r.s]+(c.r.lv?' · live':'')+'</div>')+'</td><td>'+flow(c.att)+'</td>'+
    (U.mode==='p'?'<td><span class="oc '+c.out.c+'">'+c.out.t+'</span></td>':'')+
    c.pts.map((p,i)=>'<td class="r"><div class="pp">'+px(p[1])+'</div><div class="pd">'+(c.prem?'<b>'+nf(c.prem[i],1)+'%</b> · ':c.pchk?'<span class="tg tg-warn" title="Price is more than 8x (or under an eighth of) the reference share price: probably a pence / pounds slip">CHECK</span> ':'')+fd(p[0])+'</div></td>').join('')+
    '<td class="r"><span class="nb '+pcol(c.chg)+'">'+(Math.abs(c.chg)<0.05?'No change':sg(c.chg)+'%')+'</span></td><td class="r"><span class="nb">'+(c.dd!=null?nf(c.dd):'—')+'</span></td></tr>').join('');
  $('orv-tbl').innerHTML=th+'<tbody>'+body+'</tbody>';
  $('orv-tcount').innerHTML='Showing <b>'+nf(Math.min(U.shown,rows.length))+'</b> of '+nf(rows.length)+(U.scope==='all'?' offers':' raised offers');
  $('orv-more').hidden=U.shown>=rows.length;
}

/* events */
root.querySelectorAll('input[name=orv-mode]').forEach(i=>i.addEventListener('change',()=>{U.mode=i.value;U.shown=15;render();}));
root.querySelectorAll('input[name=orv-end]').forEach(i=>i.addEventListener('change',()=>{U.end=i.value;U.shown=15;render();}));
root.querySelectorAll('input[name=orv-scope]').forEach(i=>i.addEventListener('change',()=>{U.scope=i.value;U.shown=15;render();}));
root.querySelectorAll('input[name=orv-hist]').forEach(i=>i.addEventListener('change',()=>{U.hist=i.value;hist();}));
['orv-ci','orv-cf'].forEach(id=>$(id).addEventListener('change',e=>{const i=e.target;if(i.checked)U.sel.add(i.value);else U.sel.delete(i.value);U.shown=15;render();}));
$('orv-pre').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;U.sel=new Set(b.dataset.p.split(' '));U.shown=15;render();});
$('orv-ref').addEventListener('change',e=>{U.ref=+e.target.value;render();});
$('orv-tbl').addEventListener('click',e=>{const t=e.target.closest('th[data-k]');if(!t)return;const k=t.dataset.k;if(k===U.sortK)U.sortD=-U.sortD;else{U.sortK=k;U.sortD=(k==='t'||k==='att'||k==='out')?1:-1;}table();});
$('orv-tbl').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('th[data-k]')){e.preventDefault();e.target.click();}});
$('orv-more').addEventListener('click',()=>{U.shown+=15;table();});

/* overview / offer revisions views of the same Offer Statistics screen */
const tabs=[...sec.querySelectorAll('.os-vt a')];
function setView(){const rev=location.hash==='#arb-rev';sec.dataset.view=rev?'rev':'ov';tabs.forEach(a=>a.classList.toggle('on',a.dataset.v===(rev?'rev':'ov')));if(rev)requestAnimationFrame(render);}
addEventListener('hashchange',setView);setView();
window.__orvUpdate=()=>{if(sec.dataset.view==='rev')render();};
addEventListener('resize',(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(()=>{if(sec.dataset.view==='rev'&&!sec.hidden&&C.length){hist();byYear();}},150);};})());
})();

};
