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
/* consideration terms (bid premia exports): sp = listed share element %, pp = d/o paper. An offer whose only shares are an unlisted
   partial share alternative counts as cash. */
D.forEach(r=>{if(r.sp!=null&&r.cn==='s'&&!(r.sp>0)&&/partial share alternative/i.test(r.ct||'')&&!/ordinary shares|convertible/i.test(r.ct||''))r.cn='c';});
const HAS_SP=D.some(r=>r.sp!=null), SPN=20, spPct=i=>i*5;
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
/* outliers: Tukey's fences, 1.5 x IQR beyond the quartiles of the values in hand (needs 5+ values) */
const quart=(s,p)=>{const i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};
const fence=a=>{if(a.length<5)return null;const s=[...a].sort((x,y)=>x-y),q1=quart(s,.25),q3=quart(s,.75),k=1.5*(q3-q1);return [q1-k,q3+k];};
const inF=(v,f)=>!f||(v>=f[0]&&v<=f[1]);
const trim=(a,on)=>{const f=on?fence(a):null,k=f?a.filter(v=>inF(v,f)):a;return {k,f,x:a.length-k.length};};
const hasWU=no=>{const d=window.MAM.byNo&&window.MAM.byNo[no];return !!(d&&d.has_report);};
const fmtEV=v=>v===Infinity?'£25bn+':v>=1000?'£'+nf(v/1000,v%1000?1:0)+'bn':'£'+v+'m';

/* ---------- state ---------- */
/* ex = deals unticked in the list (left out of every figure); out = exclude outliers; ws = word search result */
const DEF=()=>({sp:[0,SPN],pp:'all',uni:'firm',att:new Set(ATT.map(a=>a[0])),xb:'all',ev:[0,EVS.length-1],yr:[YMIN,YMAX],mkt:new Set(MKT.map(m=>m[0])),sch:'all',mbo:'all',cn:'all',c:'all',sec:'all',rv:'all',cp:'all',ex:new Set(),out:false,ws:null});
let S=DEF(), sortK='d', sortD=-1, shown=25, dirty=true;

function pass(r,s,uniOnly,keepEx){
  if(s.uni==='firm'&&r.s==='X')return false;
  if(!keepEx&&s.ex&&s.ex.has(r.no))return false;
  if(uniOnly)return true;
  if(s.ws&&!s.ws.nos.has(r.no))return false;
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
  if(!(s.sp[0]===0&&s.sp[1]===SPN)){if(r.sp==null||r.sp<spPct(s.sp[0])-1e-9||r.sp>spPct(s.sp[1])+1e-9)return false;}
  if(s.pp!=='all'&&r.pp!==s.pp)return false;
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
  const F=o.F={},on=S.out;
  const tp=trim(R.filter(r=>r.pr!=null).map(r=>r.pr),on),pr=tp.k;F.pr=tp.f;o.pr=pr;o.prem={n:pr.length,mean:mean(pr),med:median(pr),x:tp.x};
  const opm=new Map();R.forEach(r=>{if(r.op!=null&&!opm.has(r.ok))opm.set(r.ok,r.op);});
  const to=trim([...opm.values()],on),ops=to.k;F.op=to.f;
  o.op={n:ops.length,mean:mean(ops),med:median(ops),x:to.x};
  const tc=trim(R.filter(r=>r.s==='C'&&r.d1!=null).map(r=>r.d1),on), tf=trim(R.filter(r=>r.s==='F'&&r.d1!=null).map(r=>r.d1),on), dc=tc.k, df=tf.k;F.d1=tc.f;F.df=tf.f;
  o.d1={n:dc.length,mean:mean(dc),med:median(dc),fn:df.length,fmean:mean(df),x:tc.x,fx:tf.x};
  const pu=R.filter(r=>r.pu!=null), puY=pu.filter(r=>r.pu===1), pxb=puY.filter(r=>r.px!=null), cv=puY.filter(r=>!r.lv&&r.om!=null);
  o.pusu={n:pu.length,y:puY.length,pct:pc(puY.length,pu.length),en:pxb.length,ey:pxb.filter(r=>r.px===1).length,cn:cv.length,cy:cv.filter(r=>r.om===1).length};
  o.fail={n:cnt.C+cnt.F,y:cnt.F,pct:pc(cnt.F,cnt.C+cnt.F),nf:pc(cnt.Xr,cnt.Xr+cnt.C+cnt.F)};
  const wa=R.filter(r=>r.a), ho=wa.filter(r=>r.a==='Ho').length, ih=wa.filter(r=>r.a==='IH').length;
  o.host={n:wa.length,ho,ih,pct:pc(ho+ih,wa.length)};
  const cs=new Map();R.forEach(r=>{if(r.cp)cs.set(r.si,r.w);});
  const w={O:0,L:0,N:0,U:0};cs.forEach(v=>w[v]++);const res=w.O+w.L+w.N;
  o.comp={n:cs.size,pct:pc(cs.size,o.sit),w,res,pO:pc(w.O,res),pL:pc(w.L,res),pN:pc(w.N,res)};
  const inc=R.filter(r=>r.s!=='X'&&r.in!=null), up=inc.filter(r=>r.in===1), ti=trim(up.filter(r=>r.ip!=null).map(r=>r.ip),on), ips=ti.k, nup=inc.filter(r=>r.in===0);F.ip=ti.f;
  const cr=a=>{const x=a.filter(r=>r.s==='C'||r.s==='F');return {n:x.length,pct:pc(x.filter(r=>r.s==='C').length,x.length)};};
  const ic=R.filter(r=>r.ic>=1);
  o.inc={n:inc.length,y:up.length,pct:pc(up.length,inc.length),mean:mean(ips),med:median(ips),max:ips.length?Math.max(...ips):null,crU:cr(up),crN:cr(nup),icn:ic.length,icy:ic.filter(r=>r.iu===1).length,x:ti.x};
  return o;
}
/* is this offer's value one the outlier rule left out? (key: pr premium, op offer period, d1 completion/lapse, ip increase) */
function isOut(r,k,o){
  if(!S.out||!o||!o.F||S.ex.has(r.no))return false;
  if(k==='pr')return r.pr!=null&&!inF(r.pr,o.F.pr);
  if(k==='op')return r.op!=null&&!inF(r.op,o.F.op);
  if(k==='d1')return r.d1!=null&&(r.s==='C'?!inF(r.d1,o.F.d1):r.s==='F'?!inF(r.d1,o.F.df):false);
  if(k==='ip')return r.in===1&&r.ip!=null&&!inF(r.ip,o.F.ip);
  return false;
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
const spLab=()=>{const [a,b]=S.sp;return a===0&&b===SPN?'Any':a===b?(a===0?'None (cash)':spPct(a)+'%'):b===SPN?spPct(a)+'%+':a===0?'Up to '+spPct(b)+'%':spPct(a)+'% – '+spPct(b)+'%';};
const paintSP=HAS_SP?dual('os-sp',0,SPN,()=>S.sp,v=>S.sp=v,()=>{$('#os-sp-o').textContent=spLab();const [lo,hi]=$('#os-sp').querySelectorAll('input');lo.setAttribute('aria-valuetext',spPct(S.sp[0])+'%');hi.setAttribute('aria-valuetext',spPct(S.sp[1])+'%');}):()=>{};
if(HAS_SP){$('#os-shr').hidden=false;ticks('os-sp-t',[[0,'0%'],[.25,'25%'],[.5,'50%'],[.75,'75%'],[1,'100%']]);
  const nT=D.filter(r=>r.s!=='X'&&r.sp!=null).length,nF=D.filter(r=>r.s!=='X').length;
  $('#os-sp-h').textContent='Listed bidder shares as a percentage of the offer value per target share; unlisted partial share alternatives count as cash. Domestic paper = listed in the UK (or Ireland, for an Irish target). Loaded so far for '+nf(nT)+' of the '+nf(nF)+' firm offers: the others drop out once this is narrowed or a paper choice is set.';}
const paintYR=dual('os-yr',YMIN,YMAX,()=>S.yr,v=>S.yr=v,()=>{$('#os-yr-o').textContent=S.yr[0]===YMIN&&S.yr[1]===YMAX?'All years':S.yr[0]===S.yr[1]?S.yr[0]:S.yr[0]+' – '+S.yr[1];});

function syncControls(){
  $$('input[name="os-uni"]').forEach(i=>i.checked=i.value===S.uni);
  ['xb','sch','mbo','cn','c','rv','cp','pp'].forEach(k=>$$('input[name="os-'+k+'"]').forEach(i=>i.checked=i.value===S[k]));
  $$('#os-att input').forEach(i=>i.checked=S.att.has(i.value));
  $$('#os-mkt input').forEach(i=>i.checked=S.mkt.has(i.value));
  $('#os-sec').value=S.sec;paintEV();paintYR();paintSP();
  $('#os-out').checked=S.out;
  if(!S.ws){$('#os-ws').value='';$('#os-ws-not').value='';$$('input[name="os-wsm"]').forEach(i=>i.checked=i.value==='ph');$('#os-ws-docs').checked=false;$('#os-ws-go').textContent='Search write-ups';}
  wsShow();
}
$('#os-out').addEventListener('change',e=>{S.out=e.target.checked;update(true);});

/* ---------- word search of the deal write-ups (server-side, db_word_search) and, when ticked, of the deal
   documents (db_doc_search: the same rules as the Search Form's word search) ---------- */
const WSM={ph:'Exact phrase',all:'All words',any:'Any word'};
let wsSeq=0,docStat=null;
const pl=(n,w)=>nf(n)+' '+w+(n===1?'':'s');
function wsShow(msg){
  const nWU=D.filter(r=>hasWU(r.no)).length;
  $('#os-ws-clr').hidden=!S.ws&&!$('#os-ws').value&&!$('#os-ws-not').value;
  $('#os-ws-st').innerHTML=msg!=null?msg:S.ws?(()=>{const h=D.filter(r=>S.ws.nos.has(r.no)&&pass(r,S,true,true)).length,w=S.uni==='all'?'offer':'firm offer';
    const found=S.ws.docs?'Found in <b>'+nf(S.ws.nRep)+'</b> write-up'+(S.ws.nRep===1?'':'s')+' and in the documents of <b>'+nf(S.ws.docs.size)+'</b> deal'+(S.ws.docs.size===1?'':'s')+' on the DataBase (<b>'+nf(S.ws.hits)+'</b> deal'+(S.ws.hits===1?'':'s')+' in all)'
      :'Found in <b>'+nf(S.ws.hits)+'</b> write-up'+(S.ws.hits===1?'':'s')+' on the DataBase';
    return found+'; <b>'+nf(h)+'</b> of them '+(h===1?'is a '+w:'are '+w+'s')+' in these statistics.';})():'';
  const dk=$('#os-ws-docs').checked;
  $('#os-ws-h').textContent='Searches the deal write-ups on the DataBase, which cover '+nf(nWU)+' of the '+nf(D.length)+' offers here'+(nWU<D.length/2?' (mostly recent ones)':'')+'. Offers without a write-up drop out while a search is set.'+
    (dk?' Deal documents: in a document each of the words must appear somewhere in it and an exact phrase on one page'+(docStat?'; '+pl(docStat.done,'document')+' on '+pl(docStat.deals,'deal')+' can be searched so far'+(docStat.pending?' ('+docStat.pending+' still being read)':''):'')+'.':'');
}
async function loadDocStat(){
  if(docStat&&Date.now()-docStat.at<60000)return;
  const {data,error}=await window.MAM.sb.rpc('db_doc_text_stats');
  if(!error&&data){docStat={...data,at:Date.now()};wsShow();}
}
async function runWs(){
  const q=$('#os-ws').value.trim(),nt=$('#os-ws-not').value.trim(),mode=(document.querySelector('input[name="os-wsm"]:checked')||{}).value||'ph';
  const docs=$('#os-ws-docs').checked;
  const seq=++wsSeq;
  if(!q&&!nt){S.ws=null;wsShow();update();return;}
  const args={p_all:null,p_phrase:null,p_any:null,p_not:nt||null};
  if(q){if(mode==='ph')args.p_phrase=q;else if(mode==='all')args.p_all=q;else args.p_any=q.split(q.includes(',')?/\s*,\s*/:/\s+/).filter(Boolean);}
  $('#os-ws-go').disabled=true;wsShow('<span class="spin" aria-hidden="true"></span> Searching the write-ups'+(docs?' and the deal documents':'')+'…');
  try{
    const [rep,dr]=await Promise.all([window.MAM.sb.rpc('db_word_search',args),docs&&q?window.MAM.sb.rpc('db_doc_search',args):Promise.resolve({data:[]})]);
    if(seq!==wsSeq)return;
    const error=rep.error||dr.error;
    if(error){wsShow('<span class="err">Word search failed: '+esc(error.message)+'</span>');return;}
    const repNos=new Set((rep.data||[]).map(x=>typeof x==='string'?x:x&&(x.db_word_search||Object.values(x)[0])));
    // deal number -> the documents that matched (best pages first), for the marker in the deal list
    const dm=docs?new Map():null;
    if(dm)(dr.data||[]).forEach(x=>{if(!dm.has(x.deal_number))dm.set(x.deal_number,[]);dm.get(x.deal_number).push(x);});
    const nos=new Set([...repNos,...(dm?dm.keys():[])]);
    const lab=(q?(mode==='ph'?'“'+q+'”':WSM[mode].toLowerCase()+': '+q):'')+(nt?(q?' · ':'')+'not '+nt:'');
    S.ws={nos,q,nt,mode,hits:nos.size,nRep:repNos.size,rep:repNos,docs:dm,label:(docs?'Write-up or documents: ':'Write-up: ')+lab};
    wsShow();update();
  }catch(e){if(seq===wsSeq)wsShow('<span class="err">Word search failed: '+esc(e.message||e)+'</span>');}
  finally{if(seq===wsSeq)$('#os-ws-go').disabled=false;}
}
$('#os-ws-f').addEventListener('submit',e=>{e.preventDefault();runWs();});
// ticking / unticking the documents box re-runs a search that is already set
const goLab=()=>{$('#os-ws-go').textContent=$('#os-ws-docs').checked?'Search write-ups + documents':'Search write-ups';};
$('#os-ws-docs').addEventListener('change',e=>{if(e.target.checked)loadDocStat();goLab();wsShow();if(S.ws)runWs();});
$('#os-ws-clr').addEventListener('click',()=>{wsSeq++;$('#os-ws').value='';$('#os-ws-not').value='';$('#os-ws-go').disabled=false;const had=!!S.ws;S.ws=null;wsShow();if(had)update();});
['#os-ws','#os-ws-not'].forEach(s=>$(s).addEventListener('input',()=>{$('#os-ws-clr').hidden=!S.ws&&!$('#os-ws').value&&!$('#os-ws-not').value;}));
$$('input[name="os-uni"]').forEach(i=>i.addEventListener('change',()=>{S.uni=i.value;update();}));
['xb','sch','mbo','cn','c','rv','cp','pp'].forEach(k=>$$('input[name="os-'+k+'"]').forEach(i=>i.addEventListener('change',()=>{S[k]=i.value;update();})));
$('#os-att').addEventListener('change',e=>{const v=e.target.value;e.target.checked?S.att.add(v):S.att.delete(v);update();});
$('#os-att-pre').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const p=b.dataset.p;S.att=new Set(p==='all'?ATT.map(a=>a[0]):p==='fr'?['Fr']:['Ho','IH']);syncControls();update();});
$('#os-mkt').addEventListener('change',e=>{const v=e.target.value;e.target.checked?S.mkt.add(v):S.mkt.delete(v);update();});
$('#os-sec').addEventListener('change',e=>{S.sec=e.target.value;update();});
$('#os-reset').addEventListener('click',e=>{e.preventDefault();wsSeq++;$('#os-ws-go').disabled=false;S=DEF();syncControls();update();});
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
  if(!(S.sp[0]===0&&S.sp[1]===SPN))a.push('Listed shares: '+spLab());
  if(S.pp!=='all')a.push(S.pp==='d'?'Domestic paper':'Overseas paper');
  if(S.c!=='all')a.push(S.c==='UK'?'UK targets':'Irish targets');
  if(S.sec!=='all')a.push(SECT[+S.sec]);
  if(S.rv!=='all')a.push(S.rv==='y'?'Price revised':'Price unchanged');
  if(S.cp!=='all')a.push(S.cp==='y'?'Competitive deals':'Uncontested deals');
  if(S.ws)a.push(S.ws.label);
  return a;
}
/* settings that apply to every figure, including the "vs all" comparison: shown as pills but not counted as criteria */
function globalPills(){
  const a=[];
  if(S.out)a.push('Outliers excluded');
  if(S.ex.size)a.push(nf(S.ex.size)+' deal'+(S.ex.size===1?'':'s')+' unticked');
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
  $('#os-hc-s').textContent=o.prem.n?nf(o.prem.n)+' offers with a premium'+(o.prem.x?' · '+nf(o.prem.x)+' outlier'+(o.prem.x===1?'':'s')+' left out':''):'';
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
let R=[],T=[],O=null,B=null;
const outs=n=>n?' · <span class="olx-n" title="Left out by Exclude outliers">'+nf(n)+' outlier'+(n===1?'':'s')+' out</span>':'';
function delta(v,b,unit,dec){if(v==null||b==null)return '';const d=v-b;if(Math.abs(d)<Math.pow(10,-dec)/2)return '<i>=</i> in line with all';return '<i>'+(d>0?'▲ ':'▼ ')+nf(Math.abs(d),dec)+unit+'</i> vs all '+(S.uni==='all'?'offers':'firm offers');}
function tile(val,unit,label,sub,dl,hl){return '<div class="os-k'+(hl?' hl':'')+'"><div class="kv">'+val+(val!=='—'&&unit?'<span class="u">'+unit+'</span>':'')+'</div><div class="kl">'+label+'</div><div class="sub">'+sub+'</div><div class="dl2">'+(dl||'&nbsp;')+'</div></div>';}
function update(keep){
  if(window.__orvUpdate)setTimeout(window.__orvUpdate,0);
  T=D.filter(r=>pass(r,S,false,true));          // everything matching the criteria, ticked or not (the list)
  R=T.filter(r=>!S.ex.has(r.no));               // what the figures use
  const base=D.filter(r=>pass(r,S,true));
  B=stats(base);O=stats(R);
  const af=activeFilters(),filt=af.length>0,gp=globalPills(),xn=T.length-R.length;
  const uniTxt=S.uni==='all'?'offers and possible offers':'firm offers';
  $('#os-count').innerHTML='Showing <b>'+nf(O.n)+'</b> '+uniTxt+' in <b>'+nf(O.sit)+'</b> bid situations'+(xn?' · <b>'+nf(xn)+'</b> unticked':'');
  $('#os-af').innerHTML=filt||gp.length?af.map(a=>'<span>'+esc(a)+'</span>').join('')+gp.map(a=>'<span class="xp">'+esc(a)+'</span>').join(''):'<span class="none">No criteria applied</span>';
  $('#os-tbl-s').textContent=S.out?'Struck-through figures are outliers left out of the averages · untick a deal to leave it out of every figure':'Untick a deal to leave it out of every figure · click a column to sort';
  $$('[data-xl]').forEach(b=>b.disabled=!T.length);
  if(S.ws)wsShow();
  $('#os-asat').textContent='Data as at '+RAW.snap;
  $('#os-uni-h').textContent=S.uni==='all'?'Firm offers plus possible offers where that bidder never went firm.':'Firm offers only. Add possible offers to see how often PUSUs convert.';
  $$('#os-att [data-a="NA"]').forEach(l=>l.hidden=S.uni!=='all');
  {const a=[...S.att].sort().join();$$('#os-att-pre button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p==='all'?S.att.size===ATT.length:b.dataset.p==='fr'?a==='Fr':a==='Ho,IH')));}
  $('#os-warn').innerHTML=O.n>0&&O.n<10?'<div class="os-warn">Small sample: only '+O.n+' offer'+(O.n>1?'s':'')+' match these criteria, so treat the percentages with care.</div>':'';
  if(!O.n){
    $('#os-kpis').innerHTML='<div class="card os-empty" style="grid-column:1/-1">'+(T.length?'Every offer matching these criteria is unticked. Tick deals in the list below to bring them back into the figures.':S.ws&&!D.some(r=>S.ws.nos.has(r.no)&&pass(r,S,true,true))?'None of the offers in these statistics has a write-up'+(S.ws.docs?' or document':'')+' matching the word search.':'No offers match these criteria. Widen the equity value or year range, or reset the criteria.')+'</div>';
    ['#os-comp','#os-inc','#os-yc','#os-hc'].forEach(s=>$(s).innerHTML='<div class="os-empty">No matching offers</div>');
    $('#os-comp-s').textContent='';$('#os-hc-s').textContent='';$('#os-yr-lgd').innerHTML='';if(!keep)shown=25;renderTable();return;
  }
  const k=[];
  k.push(tile(nf(O.n),'',S.uni==='all'?'Offers & possible offers':'Firm offers','in <b>'+nf(O.sit)+'</b> bid situations'+(S.uni==='all'?' · <b>'+nf(O.cnt.X)+'</b> possible only':''),filt?'<i>'+nf(pc(O.n,B.n),1)+'%</i> of all '+(S.uni==='all'?'offers':'firm offers'):'',true));
  k.push(tile(nf(O.prem.mean,1),'%','Avg pre-bid speculation premium','Median <b>'+nf(O.prem.med,1)+'%</b> · '+nf(O.prem.n)+' priced'+outs(O.prem.x),filt?delta(O.prem.mean,B.prem.mean,' pts',1):''));
  k.push(tile(nf(O.op.mean,0),' days','Avg offer period','Median <b>'+nf(O.op.med,0)+'</b> days · '+nf(O.op.n)+' offer periods'+outs(O.op.x),filt?delta(O.op.mean,B.op.mean,' days',0):''));
  k.push(tile(nf(O.d1.mean,0),' days','Firm offer to completion','Median <b>'+nf(O.d1.med,0)+'</b> days'+(O.d1.fn?' · failed offers lapse after <b>'+nf(O.d1.fmean,0)+'</b>':'')+outs(O.d1.x+O.d1.fx),filt?delta(O.d1.mean,B.d1.mean,' days',0):''));
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
    '</div>'+(n.x?'<div class="os-hint os-inc-x">'+nf(n.x)+' outlier'+(n.x===1?'':'s')+' left out of the average, median and largest increase.</div>':'');
  yearChart(R);histChart(O);
  if(!keep)shown=25;renderTable();
}

/* ---------- table ---------- */
const COLS=[['d','Date'],['t','Target / bidder'],['s','Status'],['a','Attitude'],['ev','Equity value £m','r'],['pr','Spec. premium','r'],['ip','Increase','r'],['cp','Competing','c']];
const tval=(r,k)=>k==='a'?(ATTN[r.a||'NA']):k==='ip'?(r.in===1?r.ip:r.in===0?0:null):k==='s'?ST[r.s]:r[k];
const sorted=L=>[...L].sort((a,b)=>{const x=tval(a,sortK),y=tval(b,sortK);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x<y?-1:x>y?1:0)*sortD;});
function renderTable(){
  const rows=sorted(T),nOff=T.filter(r=>S.ex.has(r.no)).length;
  const th='<thead><tr><th class="ck"><input type="checkbox" id="os-ckall" aria-label="Tick or untick every matching offer"'+(nOff?'':' checked')+' title="'+(nOff?'Tick every matching offer':'Untick every matching offer')+'"></th>'+COLS.map(c=>'<th class="s'+(c[2]?' '+c[2]:'')+(c[0]===sortK?' so':'')+'" data-k="'+c[0]+'" aria-sort="'+(c[0]===sortK?(sortD>0?'ascending':'descending'):'none')+'" tabindex="0">'+c[1]+'<span class="ar">'+(c[0]===sortK&&sortD>0?'▲':'▼')+'</span></th>').join('')+'</tr></thead>';
  const fd=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
  const OX=' title="Outlier: left out of the averages"';
  const body=rows.slice(0,shown).map(r=>{
    const stc=r.s==='X'?'Proposed':ST[r.s],off=S.ex.has(r.no),po=isOut(r,'pr',O),io=isOut(r,'ip',O);
    const tn=hasWU(r.no)?'<a class="tn" href="#deal/'+esc(r.no)+'" title="Open the deal write-up">'+esc(r.t)+'</a>':'<div class="tn">'+esc(r.t)+'</div>';
    // word search with documents ticked: where the words were found (the deal report's Documents tab has the files)
    const dl=S.ws&&S.ws.docs&&S.ws.docs.get(r.no);
    const dmk=dl?' <a class="os-wsd'+(S.ws.rep.has(r.no)?'':' only')+'" href="#deal/'+esc(r.no)+'" title="'+esc((S.ws.rep.has(r.no)?'Found in the write-up and in: ':'Found only in the documents: ')+dl.map(x=>x.file_name.replace(/\.[a-z0-9]{2,5}$/i,'')+(/\.pdf$/i.test(x.file_name)&&x.pages&&x.pages.length?' (p. '+x.pages.slice(0,3).join(', ')+')':'')).join('; '))+'">'+(S.ws.rep.has(r.no)?'+ ':'')+pl(dl.length,'document')+'</a>':'';
    return '<tr'+(off?' class="off"':'')+'><td class="ck"><input type="checkbox" data-no="'+esc(r.no)+'"'+(off?'':' checked')+' aria-label="Include '+esc(r.t)+(r.b?' / '+esc(r.b):'')+' in the figures"></td>'+
    '<td><span class="dt">'+fd(r.d)+'</span></td><td>'+tn+'<div class="bn">'+esc(r.b||'—')+dmk+'</div></td>'+
    '<td><span class="stat stat-'+stc+'">'+ST[r.s]+(r.lv?' · live':'')+'</span></td>'+
    '<td><span class="os-att'+(r.a==='Ho'||r.a==='IH'?' h':'')+'">'+(r.a?ATTN[r.a]:'<span class="muted">—</span>')+'</span></td>'+
    '<td class="r num'+(r.ev==null?' muted':'')+'">'+(r.ev==null?'—':nf(r.ev,1))+'</td>'+
    '<td class="r num'+(r.pr==null?' muted':'')+(po?' olx':'')+'"'+(po?OX:'')+'>'+(r.pr==null?'—':'<span>'+nf(r.pr,1)+'%</span>')+'</td>'+
    '<td class="r num'+(r.in!==1?' muted':'')+(io?' olx':'')+'"'+(io?OX:'')+'>'+(r.in===1?'<span>+'+nf(r.ip,1)+'%</span>':r.in===0?'No':'—')+'</td>'+
    '<td class="c">'+(r.cp?'<span class="yes">YES</span>':'<span class="muted">—</span>')+'</td></tr>';
  }).join('');
  $('#os-tbl').innerHTML=th+'<tbody>'+(body||'<tr><td colspan="9" class="os-empty">No matching offers</td></tr>')+'</tbody>';
  const all=$('#os-ckall');if(all)all.indeterminate=nOff>0&&nOff<rows.length;
  $('#os-tcount').innerHTML='Showing <b>'+nf(Math.min(shown,rows.length))+'</b> of '+nf(rows.length)+(nOff?' · <b>'+nf(nOff)+'</b> unticked <button type="button" class="linkbtn" id="os-tickall">Tick them all again</button>':'');
  $('#os-more').hidden=shown>=rows.length;
}
function setTicks(nos,on){nos.forEach(no=>on?S.ex.delete(no):S.ex.add(no));update(true);}
$('#os-tbl').addEventListener('change',e=>{
  const t=e.target;if(t.type!=='checkbox')return;
  if(t.id==='os-ckall'){setTicks(T.map(r=>r.no),T.some(r=>S.ex.has(r.no)));return;}   // any unticked: tick all; otherwise untick all
  if(t.dataset.no)setTicks([t.dataset.no],t.checked);
});
$('#os-tcount').addEventListener('click',e=>{if(e.target.id==='os-tickall')setTicks(T.map(r=>r.no),true);});
$('#os-tbl').addEventListener('click',e=>{const t=e.target.closest('th[data-k]');if(!t)return;const k=t.dataset.k;if(k===sortK)sortD=-sortD;else{sortK=k;sortD=(k==='t'||k==='s'||k==='a')?1:-1;}renderTable();});
$('#os-tbl').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('th[data-k]')){e.preventDefault();e.target.click();}});
$('#os-more').addEventListener('click',()=>{shown+=25;renderTable();});

/* ---------- Excel download: every box's figures, and the offers behind them ----------
   Same house layout as the DataBase's other downloads: grey title band, blue header row, Arial 8. */
const YN=v=>v===1?'Yes':v===0?'No':null;
const WIN={O:'First bidder',L:'Later bidder',N:'Neither',U:'Unresolved'};
const MKTN=Object.fromEntries(MKT);
const isoD=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));return m?new Date(Date.UTC(+m[1],m[2]-1,+m[3])):null;};
async function toExcel(btn){
  if(!O||!T.length)return;
  const lab=btn.innerHTML;$$('[data-xl]').forEach(b=>b.disabled=true);btn.textContent='Preparing…';
  try{
    const X=await window.MAM.loadExcel();
    const wb=new X.Workbook();wb.creator='M&A Monitor';wb.created=new Date();
    const A=(sz,b,c,x)=>Object.assign({name:'Arial',family:2,size:sz,bold:!!b,color:c?{argb:c}:undefined},x||{});
    const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
    const now=new Date(),p2=v=>String(v).padStart(2,'0'),stamp=p2(now.getDate())+'/'+p2(now.getMonth()+1)+'/'+now.getFullYear()+' '+p2(now.getHours())+':'+p2(now.getMinutes());
    const all=S.uni==='all',crit=activeFilters(),gp=globalPills();
    const critTxt='Criteria : '+(crit.length?crit.join('; '):'none')+' · '+(all?'firm offers plus possible offers that never went firm':'firm offers only')+(gp.length?' · '+gp.join(' · '):'');
    const FMT={i:'#,##0',n1:'#,##0.0',n2:'#,##0.00',d:'dd/mm/yyyy'};
    /* cols: {h: header, w: width, f: format, g: group}; a cell is a value or {v, f, strike, grey} */
    function sheet(name,desc,cols,rows,note){
      const H=9,n=Math.max(cols.length,8);
      const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:H}]});
      ws.columns=Array.from({length:n},(_,i)=>({width:cols[i]?cols[i].w||14:14}));
      const band=['M&A Monitor','','Description : '+desc,'Date : '+stamp,'Data as at : '+(RAW.snap||'—'),critTxt,note||''];
      for(let i=0;i<H-1;i++){
        const r=ws.getRow(i+1);r.height=i>=5&&i<7?28:18;
        for(let c=1;c<=n;c++){const cell=r.getCell(c);cell.fill=fill('FFDDDDDD');cell.font=A(8);}
        if(i<7){ws.mergeCells(i+1,1,i+1,n);const a=r.getCell(1);a.value=band[i]||null;a.font=i===0?A(12,true,'FF0066CC'):i<3?A(10,true,'FF000000'):A(8,false,'FF000000');a.alignment={vertical:'middle',wrapText:true};}
      }
      if(cols.some(c=>c.g)){   // row 8: which box each column feeds
        let s=0;const gr=ws.getRow(H-1);gr.height=18;
        cols.forEach((c,i)=>{if(i===cols.length-1||cols[i+1].g!==c.g){if(c.g){if(i>s)ws.mergeCells(H-1,s+1,H-1,i+1);const cell=gr.getCell(s+1);cell.value=c.g;cell.font=A(8,true,'FF0066CC');cell.fill=fill('FFE8EEFB');cell.alignment={horizontal:'center',vertical:'middle'};cell.border={left:{style:'thin',color:{argb:'FFBBBBBB'}}};}s=i+1;}});
      }
      const hd=ws.getRow(H);hd.height=36;
      cols.forEach((c,i)=>{const cell=hd.getCell(i+1);cell.value=c.h;cell.font=A(8,true,'FFFFFFF7');cell.fill=fill('FF0066CC');cell.alignment={vertical:'bottom',wrapText:true};cell.border={bottom:{style:'double',color:{argb:'FF000000'}}};});
      for(let c=cols.length+1;c<=n;c++)hd.getCell(c).fill=fill('FFDDDDDD');
      rows.forEach((vals,ri)=>{
        const r=ws.getRow(H+1+ri),rowGrey=vals.grey;
        cols.forEach((c,i)=>{
          let x=vals[i];const o=x&&typeof x==='object'&&!(x instanceof Date)?x:{v:x};const cell=r.getCell(i+1),f=o.f||c.f;
          cell.font=A(8,!!o.b,rowGrey||o.strike?'FF8594AD':'FF000000',o.strike?{strike:true}:null);cell.alignment={vertical:'top',wrapText:c.f==='t'};
          if(o.v==null||o.v===''||(typeof o.v==='number'&&!isFinite(o.v)))return;
          if(f==='d'){const d=isoD(o.v);cell.value=d||String(o.v);if(d)cell.numFmt=FMT.d;}
          else if(FMT[f]&&typeof o.v==='number'){cell.value=o.v;cell.numFmt=FMT[f];}
          else cell.value=o.v;
        });
      });
      ws.autoFilter={from:{row:H,column:1},to:{row:H+Math.max(rows.length,1),column:cols.length}};
      return ws;
    }

    /* 1. Summary: every figure in the boxes and panels, with all offers alongside */
    const o=O,b=B,SR=[],bx0={};
    const add=(box,fig,v,unit,bv,basis,f)=>{SR.push([{v:box,b:!bx0[box]},fig,{v,f},unit||'',{v:bv,f},basis||'']);bx0[box]=1;};
    const fx=f=>f?'kept '+nf(f[0],1)+' to '+nf(f[1],1):'';
    const B1=all?'Offers & possible offers':'Firm offers';
    add(B1,all?'Offers and possible offers':'Firm offers',o.n,'',b.n,all?'Firm offers plus possible offers where that bidder never went firm':'Rule 2.7 firm offers','i');
    add(B1,'Bid situations',o.sit,'',b.sit,'Target and speculation date','i');
    add(B1,'Completed',o.cnt.C,'',b.cnt.C,'','i');add(B1,'Failed',o.cnt.F,'',b.cnt.F,'','i');add(B1,'Pending',o.cnt.P,'',b.cnt.P,'','i');
    if(all)add(B1,'Possible offers only',o.cnt.X,'',b.cnt.X,'The bidder never made a firm offer','i');
    add(B1,'Share of all '+(all?'offers':'firm offers'),pc(o.n,b.n),'%',100,'','n1');
    const B2='Avg pre-bid speculation premium';
    add(B2,'Average premium',o.prem.mean,'%',b.prem.mean,'Offer value against the undisturbed price before speculation','n1');
    add(B2,'Median premium',o.prem.med,'%',b.prem.med,'','n1');
    add(B2,'Offers with a premium',o.prem.n,'',b.prem.n,'','i');
    if(S.out)add(B2,'Outliers left out',o.prem.x,'',b.prem.x,fx(o.F.pr)+(o.F.pr?'%':''),'i');
    const B3='Avg offer period';
    add(B3,'Average offer period',o.op.mean,'days',b.op.mean,'Added to removed from the Takeover Panel disclosure table, once per offer period','n1');
    add(B3,'Median offer period',o.op.med,'days',b.op.med,'','n1');
    add(B3,'Offer periods',o.op.n,'',b.op.n,'Live offer periods excluded','i');
    if(S.out)add(B3,'Outliers left out',o.op.x,'',b.op.x,fx(o.F.op)+(o.F.op?' days':''),'i');
    const B4='Firm offer to completion';
    add(B4,'Average days to completion',o.d1.mean,'days',b.d1.mean,'Completed offers','n1');
    add(B4,'Median days to completion',o.d1.med,'days',b.d1.med,'','n1');
    add(B4,'Completed offers timed',o.d1.n,'',b.d1.n,'','i');
    add(B4,'Average days to lapse',o.d1.fmean,'days',b.d1.fmean,'Failed offers','n1');
    add(B4,'Failed offers timed',o.d1.fn,'',b.d1.fn,'','i');
    if(S.out){add(B4,'Outliers left out (completed)',o.d1.x,'',b.d1.x,fx(o.F.d1)+(o.F.d1?' days':''),'i');add(B4,'Outliers left out (failed)',o.d1.fx,'',b.d1.fx,fx(o.F.df)+(o.F.df?' days':''),'i');}
    const B5='With a PUSU deadline';
    add(B5,'Offers with a PUSU deadline',o.pusu.pct,'%',b.pusu.pct,'Of '+nf(o.pusu.n)+' offers where this is captured (from 2011)','n1');
    add(B5,'Offers with a PUSU',o.pusu.y,'',b.pusu.y,'','i');
    add(B5,'PUSUs extended',pc(o.pusu.ey,o.pusu.en),'%',pc(b.pusu.ey,b.pusu.en),'Of '+nf(o.pusu.en)+' with a PUSU where this is captured','n1');
    if(all)add(B5,'PUSUs that went firm',pc(o.pusu.cy,o.pusu.cn),'%',pc(b.pusu.cy,b.pusu.cn),'Of '+nf(o.pusu.cn)+' with a PUSU, live PUSUs excluded','n1');
    const B6='Firm offers failed';
    add(B6,'Firm offers failed',o.fail.pct,'%',b.fail.pct,'Failed ÷ (completed + failed); pending excluded','n1');
    add(B6,'Failed',o.fail.y,'',b.fail.y,'','i');add(B6,'Resolved (completed + failed)',o.fail.n,'',b.fail.n,'','i');
    if(all)add(B6,'Approaches that never went firm',o.fail.nf,'%',b.fail.nf,'Lapsed possible offers ÷ (lapsed possible + completed + failed)','n1');
    const B7='Hostile';
    add(B7,'Hostile or initially hostile',o.host.pct,'%',b.host.pct,'Of offers with a recorded attitude','n1');
    add(B7,'Hostile',o.host.ho,'',b.host.ho,'','i');add(B7,'Initially hostile',o.host.ih,'',b.host.ih,'','i');add(B7,'Offers with a recorded attitude',o.host.n,'',b.host.n,'','i');
    const B8='Competing situations';
    add(B8,'Bid situations with a rival bidder',o.comp.pct,'%',b.comp.pct,'','n1');
    add(B8,'Contested situations',o.comp.n,'',b.comp.n,'','i');add(B8,'Bid situations',o.sit,'',b.sit,'','i');
    const B9='Competing bids (panel)';
    add(B9,'First bidder won',o.comp.pO,'%',b.comp.pO,'Of resolved contests','n1');add(B9,'Later bidder won',o.comp.pL,'%',b.comp.pL,'','n1');add(B9,'Neither won',o.comp.pN,'%',b.comp.pN,'Every bidder failed','n1');
    add(B9,'First bidder won (number)',o.comp.w.O,'',b.comp.w.O,'','i');add(B9,'Later bidder won (number)',o.comp.w.L,'',b.comp.w.L,'','i');add(B9,'Neither won (number)',o.comp.w.N,'',b.comp.w.N,'','i');
    add(B9,'Resolved contests',o.comp.res,'',b.comp.res,'','i');add(B9,'Unresolved contests',o.comp.w.U,'',b.comp.w.U,'Still live','i');
    const B10='Offer increases (panel)';
    add(B10,'Firm offers increased',o.inc.pct,'%',b.inc.pct,'Final vs initial firm offer per share','n1');
    add(B10,'Increased',o.inc.y,'',b.inc.y,'','i');add(B10,'Firm offers with prices',o.inc.n,'',b.inc.n,'','i');
    add(B10,'Average increase',o.inc.mean,'%',b.inc.mean,'Increased offers only','n1');add(B10,'Median increase',o.inc.med,'%',b.inc.med,'','n1');add(B10,'Largest increase',o.inc.max,'%',b.inc.max,'','n1');
    add(B10,'Completion rate when increased',o.inc.crU.pct,'%',b.inc.crU.pct,'n = '+nf(o.inc.crU.n),'n1');add(B10,'Completion rate when not increased',o.inc.crN.pct,'%',b.inc.crN.pct,'n = '+nf(o.inc.crN.n),'n1');
    add(B10,'Indicative proposal raised at least once',pc(o.inc.icy,o.inc.icn),'%',pc(b.inc.icy,b.inc.icn),'Of '+nf(o.inc.icn)+' with an indicative price','n1');
    if(S.out)add(B10,'Outliers left out',o.inc.x,'',b.inc.x,fx(o.F.ip)+(o.F.ip?'%':''),'i');
    sheet('Summary','UK Public Offer Statistics: the figures in each box',[{h:'Box',w:30,f:'t'},{h:'Figure',w:38,f:'t'},{h:'Value',w:11},{h:'Unit',w:7,f:'t'},{h:'All '+(all?'offers':'firm offers')+' (no criteria)',w:14},{h:'Based on',w:60,f:'t'}],SR,
      'Value = the offers matching the criteria'+(S.ex.size?' (unticked deals left out)':'')+'. The "All" column is the same figure with no criteria applied. The Offers sheet lists every offer behind these figures.');

    /* 2. Offers by year (the chart) */
    const keys=all?['C','F','P','X']:['C','F','P'],yrs=[];for(let y=S.yr[0];y<=S.yr[1];y++)yrs.push(y);
    const by={};yrs.forEach(y=>by[y]={C:0,F:0,P:0,X:0});R.forEach(r=>{if(by[r.y])by[r.y][r.s]++;});
    sheet('Offers by year','Offers by year and outcome',[{h:'Year',w:8}].concat(keys.map(k=>({h:ST[k],w:12,f:'i'})),[{h:'Total',w:10,f:'i'}]),
      yrs.map(y=>[y].concat(keys.map(k=>by[y][k]),[keys.reduce((s,k)=>s+by[y][k],0)])));

    /* 3. Premium distribution (the chart) */
    const bins=[{lo:-Infinity,hi:-50}];for(let v=-50;v<150;v+=10)bins.push({lo:v,hi:v+10});bins.push({lo:150,hi:Infinity});
    bins.forEach(x=>x.n=o.pr.filter(v=>v>=x.lo&&v<x.hi).length);
    sheet('Premium distribution','Pre-bid speculation premium distribution',[{h:'Premium band',w:18,f:'t'},{h:'From %',w:9,f:'i'},{h:'To % (below)',w:11,f:'i'},{h:'Offers',w:9,f:'i'},{h:'Share of priced offers %',w:13,f:'n1'}],
      bins.map(x=>[!isFinite(x.lo)?'Below -50%':!isFinite(x.hi)?'150% and above':x.lo+'% to '+x.hi+'%',isFinite(x.lo)?x.lo:null,isFinite(x.hi)?x.hi:null,x.n,pc(x.n,o.prem.n)]),
      'Average '+nf(o.prem.mean,1)+'% · median '+nf(o.prem.med,1)+'% · '+nf(o.prem.n)+' offers with a premium'+(o.prem.x?' · '+nf(o.prem.x)+' outliers left out':''));

    /* 4. Contested bid situations (the competing boxes) */
    const sits=new Map();R.filter(r=>r.cp).forEach(r=>{const s=sits.get(r.si)||{t:r.t,d:r.d,b:[],w:r.w};s.b.push(r.b||'—');if(r.d&&(!s.d||r.d<s.d))s.d=r.d;sits.set(r.si,s);});
    sheet('Contested situations','Bid situations with a rival bidder, and who won',[{h:'Bid situation',w:11,f:'i'},{h:'First offer',w:11,f:'d'},{h:'Target',w:36,f:'t'},{h:'Bidders in these figures',w:60,f:'t'},{h:'Bidders',w:8,f:'i'},{h:'Winner',w:14,f:'t'}],
      [...sits.entries()].sort((a,b)=>(b[1].d||'').localeCompare(a[1].d||'')).map(([k,s])=>[k,s.d,s.t,s.b.join(' / '),s.b.length,WIN[s.w]||null]));

    /* 5. Offers: every offer matching the criteria, with the values that feed each box */
    const G={d:'Deal',p:'Premium box',o:'Offer period box',c:'Completion box',u:'PUSU box',h:'Hostile box',k:'Competing boxes',i:'Offer increases panel',x:'Criteria fields'};
    const oc=[{h:'Included in the figures',w:10,f:'t',g:G.d},{h:'Deal number',w:10,f:'t',g:G.d},{h:'Date',w:10,f:'d',g:G.d},{h:'Year',w:6,g:G.d},{h:'Target',w:32,f:'t',g:G.d},{h:'Bidder',w:32,f:'t',g:G.d},{h:'Status',w:11,f:'t',g:G.d},{h:'Possible offer still live',w:9,f:'t',g:G.d},
      {h:'Pre-bid speculation premium %',w:11,f:'n1',g:G.p},{h:'Premium outlier',w:9,f:'t',g:G.p},
      {h:'Offer period ref',w:9,f:'i',g:G.o},{h:'Offer period days',w:9,f:'i',g:G.o},{h:'Offer period outlier',w:9,f:'t',g:G.o},
      {h:'Days firm offer to completion / lapse',w:12,f:'i',g:G.c},{h:'Completion outlier',w:10,f:'t',g:G.c},
      {h:'PUSU deadline',w:8,f:'t',g:G.u},{h:'PUSU extended',w:8,f:'t',g:G.u},{h:'Went firm',w:8,f:'t',g:G.u},
      {h:'Attitude',w:13,f:'t',g:G.h},
      {h:'Bid situation',w:9,f:'i',g:G.k},{h:'Competitive',w:10,f:'t',g:G.k},{h:'Contest winner',w:12,f:'t',g:G.k},
      {h:'Firm offer increased',w:9,f:'t',g:G.i},{h:'Increase %',w:9,f:'n1',g:G.i},{h:'Increase outlier',w:9,f:'t',g:G.i},{h:'Indicative proposals with a price',w:11,f:'i',g:G.i},{h:'Indicative proposal raised',w:10,f:'t',g:G.i},{h:'Price revised',w:9,f:'t',g:G.i},
      {h:'Equity value £m',w:11,f:'n1',g:G.x},{h:'Market',w:10,f:'t',g:G.x},{h:'Sector',w:24,f:'t',g:G.x},{h:'Target country',w:8,f:'t',g:G.x},{h:'Cross-border',w:8,f:'t',g:G.x},{h:'Structure',w:9,f:'t',g:G.x},{h:'MBO / MBI',w:7,f:'t',g:G.x},{h:'Consideration',w:11,f:'t',g:G.x},{h:'Consideration type',w:26,f:'t',g:G.x},{h:'Listed share element %',w:10,f:'n1',g:G.x},{h:'Bidder stock exchange index',w:16,f:'t',g:G.x},{h:'Paper',w:10,f:'t',g:G.x},{h:'Write-up on the DataBase',w:10,f:'t',g:G.x}];
    const ol=(r,k)=>isOut(r,k,O)?'Yes':null;
    const OR=sorted(T).map(r=>{const off=S.ex.has(r.no),po=isOut(r,'pr',O),io=isOut(r,'ip',O);const a=[
      off?'No (unticked)':'Yes',r.no,r.d||null,r.y||null,r.t,r.b||null,ST[r.s],r.s==='X'?YN(r.lv?1:0):null,
      {v:r.pr,strike:po},ol(r,'pr'),
      r.ok!=null?r.ok:null,r.op!=null?{v:r.op,strike:isOut(r,'op',O)}:null,ol(r,'op'),
      r.d1!=null?{v:r.d1,strike:isOut(r,'d1',O)}:null,ol(r,'d1'),
      YN(r.pu),YN(r.px),YN(r.om),
      r.a?ATTN[r.a]:null,
      r.si!=null?r.si:null,r.cp?'Yes':'No',r.cp?WIN[r.w]||null:null,
      r.s!=='X'?YN(r.in):null,r.in===1?{v:r.ip,strike:io}:null,ol(r,'ip'),r.ic!=null?r.ic:null,r.ic>=1?YN(r.iu):null,YN(r.rv),
      r.ev!=null?r.ev:null,MKTN[r.m]||r.m||null,r.sc!=null?SECT[r.sc]:null,r.c||null,YN(r.xb),r.s==='X'?null:r.sch===1?'Scheme':'Offer',r.mbo===1?'Yes':'No',r.cn==='c'?'Cash':r.cn==='s'?'Incl. shares':null,r.ct||null,r.sp!=null?r.sp:null,r.bx||null,r.pp==='d'?'Domestic':r.pp==='o'?'Overseas':null,hasWU(r.no)?'Yes':'No'];
      a.grey=off;return a;});
    sheet('Offers','Offers matching the criteria, with the values behind each box',oc,OR,
      'One row per bidder\'s approach. "Included" = No for deals unticked on the page. Outlier = left out of that average by Exclude outliers. The offer period is shared by every bidder in it and counted once in the averages. Possible offers have no completion figures.');

    wb.views=[{activeTab:0}];
    const buf=await wb.xlsx.writeBuffer();
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    a.download='uk_offer_statistics_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.xlsx';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  }catch(e){console.error(e);if(window.MAM.toast)window.MAM.toast('Could not make the spreadsheet: '+(e.message||e),true);}
  finally{btn.innerHTML=lab;$$('[data-xl]').forEach(b=>b.disabled=!T.length);}
}
$$('[data-xl]').forEach(b=>b.addEventListener('click',()=>toExcel(b)));

syncControls();
let rendered=false;
window.__renderStats=()=>{if(!rendered){rendered=true;update();}else{yearChart(R);histChart(O);}};

addEventListener('resize',(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(()=>{if(location.hash==='#arb-stats'&&O&&O.n){yearChart(R);histChart(O);}},150);};})());
window.__osStats=()=>({S,O,B,pass,D});
})();

};
