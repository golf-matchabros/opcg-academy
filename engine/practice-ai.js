// Local practice opponent. No rollout of the real game, private decklist, RNG,
// event history or opponent hand. All policy/engine queries use this allowlist.
import * as E from './core.js?v=202611261856';

function observation(g, p) {
  const cards = Object.create(null), q = g.pending;
  const reveal = u => { if (u) cards[u] = g.cards[u]; };
  const players = g.players.map((s, i) => {
    [s.leader, s.stage, ...s.chars, ...s.trash].forEach(reveal);
    if (i === p) s.hand.forEach(reveal);
    return { leader:s.leader, stage:s.stage, chars:s.chars, trash:s.trash,
      hand:i === p ? s.hand : Array(s.hand.length), deck:Array(s.deck.length), life:Array(s.life.length),
      donActive:s.donActive, donRested:s.donRested, donDeck:s.donDeck, turnsTaken:s.turnsTaken };
  });
  // Only cards explicitly shown by the engine to this chooser. No iteration of either library.
  if (q?.type === 'search') q.options.forEach(reveal);
  if (q?.type === 'trigger') reveal(q.uid);
  if (q?.type === 'target') for (const u of q.options) if (g.cards[u]?.owner === p) reveal(u);
  const item = q && g.queue[0]; // only prompt's public ability definition, never its saved selections/looked cards
  return { players, cards, turn:g.turn, first:g.first, active:g.active, phase:g.phase, sandbox:false,
    mods:g.mods, used:g.used, battle:g.battle, pending:q,
    queue:item ? [{ a:item.a, ab:item.ab, isCost:item.isCost }] : [] };
}
  function fallback(q) {
    if (!q) return {type:'endTurn'};
    switch(q.type){
      case 'mulligan':return {type:'mulligan',redraw:false};
      case 'block':case 'counter':return {type:q.type,uid:null};
      case 'yesno':return {type:'yesno',yes:false};
      case 'trigger':return {type:'trigger',use:false};
      case 'manual':return {type:'manualDone'};
      case 'option':return {type:'option',index:0};
      case 'search':case 'target':return {type:'choose',uids:q.options.slice(0,q.min||0)};
      default:return null;
    }
  }

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo,n));
const removal = new Set(['ko','bounce','toTrash','toDeckTop','toDeckBottom']);
function policy(G, db, p) {
  const P = G.players[p], O = G.players[1-p], B = G.battle, Q = G.pending;
  const card = u => E.def(G, db, u), eff = u => E.effectsOf(db, card(u).no);
  const memo = f => { const map = new Map(); return u => { if (!map.has(u)) map.set(u,f(u)); return map.get(u); }; };
  const power = memo(u => E.power(G,db,u)), cost = memo(u => E.costOf(G,db,u));
  const kwCache = new Map(); const kw = (u,k) => { if (!kwCache.has(k)) kwCache.set(k,memo(v=>E.hasKw(G,db,v,k))); return kwCache.get(k)(u); };
  const mine = u => G.cards[u]?.owner === p;
  const body = memo(u => (card(u).power||0)/1600 + (card(u).cost||0)*.18 + (kw(u,'blocker')?2:0) + (kw(u,'doubleAttack')?1.4:0));
  const hand = memo(u => (card(u).counter||0)/1150 + (card(u).type==='character'?body(u)*.36:0) - Math.max(0,cost(u)-P.donActive-2)*.18);
  const ready = u => !G.cards[u].rested && (u===P.leader || G.cards[u].playedTurn!==G.turn || kw(u,'rush') || kw(u,'rushCharacter'));
  const readyEnemies = O.chars.filter(u => !G.cards[u].rested && kw(u,'blocker') && !kw(u,'cannotBlock') && !kw(u,'blockerDisabled'));
  const counterEffect = (u,target) => {
    if (card(u).type === 'character') return card(u).counter||0;
    // Count only unconditional, payable, directly targeted boosts. Don't spend an
    // event expecting its unimplemented text or another target's buff to save us.
    let n=0;
    for (const ab of eff(u).abilities.filter(a=>a.timing==='counter' && !a.cost?.length && !a.condition))
      for (const s of ab.steps||[]) if (s.do==='power' && s.amount>0 && !s.condition && s.target && ['leader','character','leaderOrCharacter'].includes(s.target.zone) && E.targetCandidates(G,db,s.target,{p,src:u}).includes(target)) n+=s.amount;
    return n;
  };
  // Compare marginal value of a legal target (as seen by the chooser).
  function targetScore(u,a) {
    if (!G.cards[u]) return 0; // blind choice; never look up an opponent's private option
    const own=mine(u), sg=own?1:-1, t=a?.do;
    if (['discard','handToDeck'].includes(t) || t==='lifeAdd' && G.cards[u].zone==='hand') return -hand(u);
    if (['search','trashToHand','play','trashToDeck','revealFromHand'].includes(t)) return hand(u) + (t==='play'?body(u):1);
    if (removal.has(t) || t==='rest' || t==='negate') return -sg*(body(u)+1) - (t==='rest' && G.cards[u].rested ? 20 : 0);
    if (t==='setActive') return sg*(G.cards[u].rested?body(u)+2:0);
    if (t==='power' || t==='attachDon' || t==='grant') {
      if (B && t==='power' && a.amount>0 && own) return u===B.target?30:0;
      const invert=t==='power' && a.amount<0?-1:1;
      return sg*invert*(1+body(u)*.32 + (own && ready(u)?3:0) + (u===O.leader?1:0));
    }
    return own?hand(u):0;
  }
  function stepValue(a,src) {
    if (!a) return 0;
    const n=a.n||1;
    if (a.do==='choose') return Math.max(0,...a.options.map(xs=>xs.reduce((s,x)=>s+stepValue(x,src),0)));
    if (a.do==='manual') return 0;
    if (a.condition && E.evalCond(G,db,a.condition,{p,src})!==true) return 0;
    if (a.target && ['character','leader','leaderOrCharacter','stage','leaderOrStage',undefined].includes(a.target.zone)) {
      const ts=E.targetCandidates(G,db,a.target,{p,src}); if (!ts.length) return 0;
      if (removal.has(a.do)) return Math.max(...ts.map(u => (mine(u)?-1:1)*(3+body(u)*.8)));
      if (a.do==='setActive') return ts.some(u=>mine(u)&&G.cards[u].rested)?4:0;
      if (a.do==='attachDon') return P[a.state==='active'?'donActive':'donRested']>0 && ts.some(u=>mine(u)&&ready(u))?2:0;
    }
    switch(a.do){
      case 'draw': return (a.side==='opp'?-1:1)*(P.deck.length<=n?-100:2.8*n);
      case 'addDon': return P.donDeck>0 ? 3.7*n : 0;
      case 'search': case 'trashToHand': return 2.7;
      case 'play': case 'extraTurn': case 'addLife': return 5;
      case 'power': return Math.min(3,Math.abs(a.amount||0)/1100);
      case 'discard': return a.side==='opp'?2.5*n:-1.8*n;
      case 'lifeToHand': return P.life.length>2?1:-2;
      case 'rest': case 'grant': return 1.5;
      case 'setDonActive': return P.donRested?1.8*n:0;
      case 'returnDon': return -2.3*n;
      case 'trashLife': return -3.5*n;
      default:return 0;
    }
  }
  const abValue=(ab,u)=> !ab || ab.condition && E.evalCond(G,db,ab.condition,{p,src:u})!==true || ab.cost?.some(a=>a.do==='manual') ? 0 :
    (ab.steps||[]).reduce((s,a)=>s+stepValue(a,u),0) - (ab.cost||[]).reduce((s,a)=>s+(a.do==='rest'&&a.target?.thisCard&&ready(u)?2.5:a.do==='restDon'?.8:a.do==='returnDon'?2.3:1.9)*(a.n||1),0);
  // Minimum-loss counter subset across power AND remaining event DON, then use
  // one card and replan after the engine resolves it. Strictly greater wins.
  function counterPlan(target,opts) {
    const need=power(B.attacker)-power(target)+1;
    if (need<=0) return {loss:0,uid:null};
    let states=new Map([['0:0',{sum:0,don:0,loss:0,uid:null}]]);
    for(const u of opts){const boost=counterEffect(u,target); if(!boost)continue;
      const k=card(u).type==='event'?cost(u):0;
      for(const s of [...states.values()]){if(s.sum>=need || s.don+k>P.donActive)continue;
        const sum=Math.min(need,s.sum+boost),don=s.don+k,loss=s.loss+1+hand(u)*.12+k*.1+Math.max(0,s.sum+boost-need+1)/15000;
        const key=sum+':'+don; if((states.get(key)?.loss??Infinity)>loss) states.set(key,{sum,don,loss,uid:s.uid||u});
      }
    }
    return [...states.values()].filter(s=>s.sum>=need).sort((a,b)=>a.loss-b.loss)[0]||{loss:Infinity,uid:null};
  }
  function pending(){
    const item=G.queue[0], src=Q.src||Q.uid;
    switch(Q.type){
      case 'mulligan': {const cs=P.hand.filter(u=>card(u).type==='character'), cheap=cs.some(u=>cost(u)<= (p===G.first?3:4) && (body(u)>1.5||eff(u).abilities.some(a=>a.timing==='onPlay'))); return {type:'mulligan',redraw:!cheap||cs.length<2};}
      case 'counter': {const s=counterPlan(B.target,Q.options), lethal=P.life.length<(kw(B.attacker,'doubleAttack')?2:1), leader=B.target===P.leader;
        const budget=leader?(lethal?Infinity:P.life.length===1?3.2:P.life.length===2?1.8:P.hand.length>=6?1.55:0):body(B.target)*.52;
        return {type:'counter',uid:s.loss<=budget?s.uid:null};}
      case 'block': {const atk=power(B.attacker), leader=B.target===P.leader;
        if(atk<power(B.target))return fallback(Q);
        const danger=leader?(P.life.length<(kw(B.attacker,'doubleAttack')?2:1)?99:P.life.length<=1?4.5:P.life.length===2?3:1):body(B.target)*.65;
        const c=counterPlan(B.target,P.hand).loss;
        const candidates=Q.options.map(u=>({u,loss:power(u)>atk?.25:(kw(u,'cannotBeKOd')||kw(u,'cannotBeKOdInBattle'))?.3:.45+body(u)*.58})).sort((a,b)=>a.loss-b.loss);
        return {type:'block',uid:candidates[0]?.loss<Math.min(danger,c+.35)?candidates[0].u:null};}
      case 'option': {const vals=Q.options.map(xs=>xs.reduce((s,x)=>s+stepValue(x,src),0));return {type:'option',index:vals.indexOf(Math.max(...vals))};}
      case 'search':case 'target': {const a=Q.type==='search'?{do:'search'}:item?.a||{}, ranked=Q.options.map(u=>({u,v:targetScore(u,a)})).sort((x,y)=>y.v-x.v);
        const optional = ['ko','bounce','rest','power','setActive','toTrash','toDeckBottom','negate'].includes(a.do) && !item?.isCost;
        const n=optional?Math.max(Q.min||0,ranked.filter(x=>x.v>0).length):Q.max;
        return {type:'choose',uids:ranked.slice(0,Math.min(Q.max,n)).map(x=>x.u)};}
      case 'trigger':return {type:'trigger',use:eff(Q.uid).abilities.some(a=>a.timing==='trigger' && abValue(a,Q.uid)>0)};
      case 'yesno':return {type:'yesno',yes:Q.key==='opt'?abValue(item?.ab,src)>0:Q.key==='stepOpt'?stepValue(item?.a,src)>0:false};
      default:return fallback(Q);
    }
  }
  function main(){
    const L=E.legalMain(G,db,p), budget=P.donActive, life=O.life.length;
    // Never loop a free, repeatable activation. The engine itself marks once-per-turn
    // abilities; for others we require a finite resource cost or skip them.
    for(const x of L.activate){const ab=eff(x.uid).abilities[x.i];
      const finite=ab.oncePerTurn || ab.cost?.some(a=>a.do==='rest'&&a.target?.thisCard || a.do==='restDon' || a.do==='returnDon' || a.do==='discard'&&!a.upTo);
      if(!x.event && finite && abValue(ab,x.uid)>0)return {type:'activate',uid:x.uid,i:x.i};
    }
    // Multiple-choice knapsack over each attacker's possible DON allocations and
    // each card that could be played. Replan after each atomic engine response.
    const groups=[];
    for(const uid of L.attack){
      const opts=[], ap=power(uid), two=kw(uid,'doubleAttack'), unblocked=!readyEnemies.length||kw(uid,'unblockable')||kw(uid,'blockerDisabled');
      for(const target of E.attackTargets(G,db,uid)){
        const face=target===O.leader, dp=power(target);
        if(!face && (kw(target,'cannotBeKOd')||kw(target,'cannotBeKOdInBattle')))continue;
        for(let n=0;n<=budget;n++){
          const margin=(ap+1000*n-dp)/1000;if(margin<0)continue;
          const lethal=face && life<(two?2:1);
          const blockTax=(!unblocked && readyEnemies.some(u=>power(u)>ap+1000*n))?1.7:0;
          if(lethal && unblocked && !O.hand.length)return n?{type:'attachDon',uid,n}:{type:'attack',uid,target};
          const pressure=O.hand.length ? (Math.min(margin,2)*.68 + Math.min(4,Math.max(0,margin-2))*.19) : 0;
          const threat=face ? (lethal?6.8:life<=1?4.9:life===2?3.9:2.9)+(two?1.7:0)+(kw(uid,'banish')?.9:0) : 1.2+body(target)*.55;
          const finish=lethal && unblocked && O.hand.length ? clamp(margin/(1+O.hand.length*.9),0,1)*5 : 0;
          const hold=kw(uid,'blocker') && !lethal ? (P.life.length<=1?4.8:2.2) : 0;
          opts.push({k:n,v:threat+pressure+finish-hold-blockTax-.035*n,
            action:n?{type:'attachDon',uid,n}:{type:'attack',uid,target}, order:10+ap/100000+(lethal?-2:0)});
        }
      }
      groups.push(opts);
    }
    for(const uid of L.play){
      const c=card(uid), k=cost(uid), xs=eff(uid).abilities;
      const play={type:'play',uid}; let v=0;
      if(c.type==='character'){
        v=body(uid)*1.05-.95-(c.counter||0)/1450 + (kw(uid,'rush')&&G.turn>2?3.7:0);
        if(P.chars.length<2)v+=1.2;
        if(P.chars.length===E.MAX_CHARS){const victim=P.chars.reduce((x,y)=>body(x)<body(y)?x:y); play.replace=victim;v-=body(victim)+1.7+(L.attack.includes(victim)?2:0);}
      } else if(c.type==='stage'){if(P.stage)continue;v=xs.some(a=>a.timing==='activateMain'&&abValue(a,uid)>0)?2:0;}
      v+=xs.filter(a=>a.timing===(c.type==='event'?'main':'onPlay')).reduce((s,a)=>s+abValue(a,uid),0);
      if(v>0)groups.push([{k,v,action:play,order:play.replace?20:5}]);
    }
    // Leave DON for a known counter event only when that beats spending it now.
    const defense=P.hand.filter(u=>card(u).type==='event' && cost(u)<=budget && counterEffect(u,P.leader)>0);
    if(defense.length) groups.push(defense.map(u=>({k:cost(u),v:P.life.length<=1?2.7:1.25,action:null,order:99})));
    let states=Array(budget+1).fill(null);states[0]={v:0,first:null};
    for(const opts of groups){const next=states.slice();
      for(let k=0;k<=budget;k++)if(states[k])for(const o of opts){const nk=k+o.k,v=states[k].v+o.v;if(nk>budget || v<=(next[nk]?.v??0))continue;
        const first=states[k].first;next[nk]={v,first:!o.action?first:!first||o.order<first.order?o:first};}
      states=next;
    }
    const best=states.reduce((a,b)=>!a||b&&b.v>a.v?b:a,null);
    return best?.first?.action||{type:'endTurn'};
  }
  return Q ? pending() : main();
}

// Same one-command contract as E.aiStep; do not apply the proposal here. A
// conservative pass/decline is preferable to falling back to a full-state AI.
export function practiceStep(G, db, p) {
  if (G.winner!==null || (G.pending ? G.pending.p!==p : G.active!==p || G.phase!=='main' || G.queue.length || G.battle)) return null;
  try { return policy(observation(G,p),db,p); }
  catch (err) { console.warn('practiceStep: conservative fallback', err?.message);
    return fallback(G.pending);
  }
}
