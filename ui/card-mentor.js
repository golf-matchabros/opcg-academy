// Read-only advice. A legal card play, a legal timing, and an effect that will
// change the board are three different things. Never run the action to preview it.
import * as E from '../engine/core.js?v=202611262018';
import { actionText, condText, explainAbility, explainKeyword, targetText } from '../engine/explain.js?v=202611262018';
import { cardCaution } from './rule-cautions.js?v=202611262018';

const noMain = {play:[], attack:[], activate:[], attachDon:false};
const field = (P,u) => u === P.leader || P.chars.includes(u) || u === P.stage;
const combat = (P,u) => u === P.leader || P.chars.includes(u);
const pool = (G,p) => { const P=G.players[p]; return P.donActive+P.donRested+[P.leader,...P.chars,P.stage].reduce((sum,u)=>sum+(G.cards[u]?.don||0),0); };
const esc = s => String(s ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const shortTiming = {activateMain:'기동: 메인', main:'메인 이벤트', onPlay:'등장 시',counter:'카운터 효과',trigger:'트리거',static:'지속 효과',whenAttacking:'어택 시',onBlock:'블록 시',replacement:'대신 처리하는 효과'};
const safeTargets = t => !['deck','life'].includes(t.zone) && !(t.zone==='hand' && t.side!=='self');
const visibleName = (G,db,u,p) => {
  const i=G.cards[u]; if (!i || i.hidden || !(field(G.players[i.owner],u) || i.owner===p && i.zone==='hand' || i.zone==='trash')) return '';
  return db.cards.get(i.no)?.name || '';
};
const names = (G,db,ids,p) => { const vals=ids.slice(0,2).map(u=>visibleName(G,db,u,p)).filter(Boolean);return vals.length ? vals.join(', ')+(ids.length>2?` 외 ${ids.length-2}장`:'') : ''; };
function cleanCondition(c) { const text=condText(c); return /[{}]/.test(text) ? (c.raw || '카드에 적힌 조건') : text; }
function costs(G,db,ab,ctx) {
  return (ab.cost || []).map(a=>{
    if (a.do==='returnDon') return `두웅!! −${a.n||1}: 필드에서 ${a.n||1}장을 두웅!! 덱으로 돌려요. 눕히는 비용과 달라요 (필드에 ${pool(G,ctx.p)}장). 연습판은 누운 두웅!! → 서 있는 두웅!! → 붙인 두웅!! 순으로 돌려요.`;
    if (a.do==='restDon') return `서 있는 두웅!! ${a.n||1}장을 눕혀요 (남은 액티브 ${G.players[ctx.p].donActive}장).`;
    return actionText(a);
  }).join(' ');
}
// Only model the immediate, known payment and movement of the selected card.
// Never peek at a deck or make a choice for either player.
function afterPlay(G,uid,p,k,type) {
  const P=G.players[p], dest=type==='character'?'chars':type==='stage'?'stage':'trash';
  const next={...P,hand:P.hand.filter(u=>u!==uid),donActive:P.donActive-k,donRested:P.donRested+k};
  if(dest==='stage') next.stage=uid; else next[dest]=[...P[dest],uid];
  const players=[...G.players]; players[p]=next;
  return {...G,players,cards:{...G.cards,[uid]:{...G.cards[uid],zone:dest,rested:false}}};
}
function abilityRow(G,db,uid,p,c,ab,now,allowed,caution) {
  const ctx={p,src:uid}, P=G.players[p], i=G.cards[uid], steps=ab.steps||[];
  const ex=explainAbility({...ab,cost:ab.cost||[],steps},c), label=shortTiming[ab.timing] || '카드 효과';
  const lines=[ex.when]; if(ex.condition)lines.push('조건: '+cleanCondition(ab.condition));
  if(ab.cost?.length)lines.push('효과 비용: '+costs(G,db,ab,ctx));
  if(ex.result && !ex.manual)lines.push('카드 효과: '+ex.result);
  if(ex.manual)lines.push('카드 원문: '+(ab.src || ex.result));
  if(ab.optional && now)lines.push('선택 효과라서 비용을 내거나 효과를 쓰지 않아도 돼요.');
  let reason='', warn='';
  if(ab.timing==='replacement' || E.isManualEventTiming(ab.timing)) warn='이 타이밍을 게임이 자동으로 처리하지 않아요.';
  if(ex.manual || ab.cost?.some(a=>a.condition && E.evalCond(G,db,a.condition,ctx)!==true))warn='이 효과에는 게임이 처리하지 못하는 단계가 있어요. 그 단계는 적용되지 않아요.';
  if(caution && (steps.some(s=>s.do==='search') || ab.timing==='replacement'))warn=caution;
  if(ab.condition) { const v=E.evalCond(G,db,ab.condition,ctx); if(v==='unknown')warn='이 조건은 자동 판정하지 못해요. 조건이 맞는다고 가정하지 않아요.'; else if(v===false)reason='조건이 맞지 않아요: '+cleanCondition(ab.condition); }
  if(now && (ab.during==='yourTurn' && G.active!==p || ab.during==='oppTurn' && G.active===p))reason='이 효과가 적용되는 턴이 아니에요.';
  if(now && ab.oncePerTurn && G.used?.[uid+'|'+(ab.src||'').slice(0,40)]===G.turn)reason='이번 턴에 이미 한 번 썼어요.';
  if(now && ab.donReq && (i.don||0)<ab.donReq)reason=`이 카드에 두웅!!이 ${ab.donReq}장 붙어 있어야 해요 (지금 ${i.don||0}장).`;
  if(now && G.mods.some(m=>m.kind==='negate'&&m.target===uid))reason='이 카드의 효과가 무효가 된 상태예요.';
  if(now && ab.cost?.length && !E.canPay(G,db,ab.cost,ctx))reason='효과 비용을 낼 수 없어요.';
  if(now && !allowed && !reason && !warn)reason='지금 제시된 행동에 이 효과가 없어요.';
  let uncertain=false;
  if(now && !reason) for(const [n,s] of steps.entries()) {
    if(s.condition) { const v=E.evalCond(G,db,s.condition,ctx); if(v==='unknown')warn='자동 판정하지 못하는 단계 조건이 있어요.'; else if(v===false && n===0)lines.push('현재 이 단계의 조건은 맞지 않아요.'); uncertain=true; }
    if(!s.target && s.do==='play' && ['hand','trash'].includes(s.from) && !G.players[p][s.from].some(u=>E.matchFilter(G,db,u,{type:'character',...s.filter},ctx))) { lines.push(`현재 ${s.from==='hand'?'손패':'트래시'}에 효과로 낼 수 있는 카드가 없어요.`); uncertain=true; }
    if(!s.target || n>0 || s.target.thisCard)continue;
    if(!safeTargets(s.target)) { uncertain=true; continue; }
    const ids=E.targetCandidates(G,db,s.target,ctx);
    lines.push(ids.length ? `현재 후보: ${names(G,db,ids,p)||targetText(s.target)}.` : `지금 대상이 없어요: ${targetText(s.target)}. 이 단계로 바뀌는 카드는 없어요.`);
    if(!ids.length)uncertain=true;
  }
  if(warn)lines.unshift(warn); if(now && reason)lines.unshift(reason);
  return {label,kind:warn?'unknown':!now?'later':reason?'blocked':uncertain?'check':'ready',status:warn?'자동 처리 제한':!now?'다른 타이밍':reason?'지금은 불가':uncertain?'단계 확인':ab.timing==='static'?'현재 적용 조건':'발동 타이밍',lines};
}
export function cardMentor(G,db,uid,p,legal) {
  const i=G.cards[uid], P=G.players[p]; if(!i || i.hidden || i.owner!==p || !(P.hand.includes(uid)||field(P,uid)))return null;
  const c=db.cards.get(i.no); if(!c)return null;
  const hand=P.hand.includes(uid), eff=E.effectsOf(db,c.no), caution=cardCaution(c.base||c.no), pend=G.pending?.p===p?G.pending:null;
  const main=G.winner===null && G.active===p && G.phase==='main' && !G.pending && !G.battle && !G.queue.length;
  const L=legal || (main?E.legalMain(G,db,p):noMain), k=E.costOf(G,db,uid), rows=[], later=[];
  const has=t=>eff.abilities.some(a=>a.timing===t), mainPlay=main && L.play.includes(uid), defense=pend?.type==='counter', canCounter=defense && pend.options.includes(uid);
  const costLine=`카드에 적힌 코스트 ${c.cost??0} · 지금 낼 비용 ${k}. 액티브 두웅!! ${k}장을 눕혀요 (현재 ${P.donActive}장).`;
  const row=(label,kind,status,...lines)=>rows.push({label,kind,status,lines:lines.filter(Boolean)});
  const counterCard=c.type==='character' && c.counter>0 || c.type==='event' && has('counter');
  if(hand && (defense || counterCard && !mainPlay)) {
    const char=c.type==='character', amount=char?`이 카드를 손에서 트래시로 보내요. 두웅!!을 쓰지 않고 공격받는 카드의 파워를 이번 배틀만 +${c.counter} 해요.`:costLine;
    const b=G.battle, math=canCounter && char && b ? `방어 ${E.power(G,db,b.target)} → ${E.power(G,db,b.target)+c.counter}, 공격 ${E.power(G,db,b.attacker)}. ${E.power(G,db,b.target)+c.counter>E.power(G,db,b.attacker)?'현재 공격 파워를 넘어요.':'막으려면 공격 파워보다 높아야 해요.'}`:'';
    row('손패 카운터',canCounter?'ready':defense?'blocked':'later',canCounter?'지금 선택 가능':defense?'지금은 불가':'방어할 때',!counterCard?'이 카드에는 손패 카운터가 없어요.':!defense?'상대가 공격하고 블록이 끝난 뒤 카운터 단계에서 써요.':!canCounter&&k>P.donActive?`서 있는 두웅!!이 ${k-P.donActive}장 부족해요.`:'',counterCard?amount:'',math);
  }
  if(hand && !defense) {
    const why=!main?(G.pending?'지금은 다른 선택을 처리 중이에요.':'내 메인 페이즈에만 손에서 낼 수 있어요.'):c.type==='event'&&!has('main')?'이 이벤트에는 메인 효과가 없어요.':k>P.donActive?`서 있는 두웅!!이 ${k-P.donActive}장 부족해요.`:'지금 낼 수 있는 카드 목록에 없어요.';
    row(c.type==='event'?'메인 이벤트 사용':'손에서 내기',mainPlay?'ready':'blocked',mainPlay?'지금 낼 수 있어요':'지금은 불가',mainPlay?'':why,c.type==='event'&&!has('main')?'':costLine,mainPlay?(c.type==='character'?P.chars.length>=E.MAX_CHARS?'필드가 가득 찼어요. 내 캐릭터 1장을 골라 트래시로 보내고 그 자리에 내요.':'내 캐릭터 칸에 나와요.':c.type==='stage'?P.stage?'기존 스테이지를 트래시로 보내고 교체해요.':'내 스테이지 칸에 놓아요.':'이벤트는 사용 후 트래시로 가요.'):null);
    if(mainPlay && c.type==='character' && c.counter>0)later.push({label:'손패에 남겨두면',kind:'later',status:'방어할 때',lines:[`상대의 어택에 이 카드를 버리면 두웅!! 비용 없이 이번 배틀만 방어 파워 +${c.counter}예요.`]});
  }
  if(!hand && pend?.type==='block' && combat(P,uid)) {
    const yes=pend.options.includes(uid);row('블록',yes?'ready':'blocked',yes?'지금 선택 가능':'지금은 불가',yes?'이 캐릭터를 눕혀 공격 대상을 이 카드로 바꿔요. 원래 대상 대신 이 카드가 싸워요.':i.rested?'이미 누워 있어서 대신 막을 수 없어요.':uid===G.battle?.target?'이미 공격받는 카드예요.':'이번 배틀에서 선택할 수 있는 블로커가 아니에요.');
  } else if(!hand && combat(P,uid)) {
    const targets=main && E.canAttack(G,db,uid)?E.attackTargets(G,db,uid):[], yes=L.attack.includes(uid)&&targets.length>0;
    const why=!main?'내 메인 페이즈에 다른 선택이나 배틀이 없을 때 어택해요.':(P.turnsTaken??(G.turn<=2?1:2))<=1?'자신의 첫 턴에는 어택할 수 없어요.':i.rested?'이미 레스트(누운 상태)라 어택할 수 없어요.':E.hasKw(G,db,uid,'cannotAttack')?'어택을 막는 효과가 걸려 있어요.':i.playedTurn===G.turn && !E.hasKw(G,db,uid,'rush')&&!E.hasKw(G,db,uid,'rushCharacter')?'이번 턴에 나온 캐릭터예요. 속공이 없어 다음 내 턴을 기다려요.':'지금 어택할 대상이 없어요.';
    row('어택',yes?'ready':'blocked',yes?'대상 선택 가능':'지금은 불가',yes?`이 카드를 눕혀 공격해요. 대상: ${names(G,db,targets,p)}. 블록이나 카운터로 결과가 바뀔 수 있어요.`:why);
    if(main && L.attachDon)later.push({label:'두웅!! 붙이기',kind:'ready',status:'지금 선택 가능',lines:[`남은 액티브 ${P.donActive}장 중 1장을 붙일 때마다 내 턴 동안 이 카드의 파워가 +1000이에요. 붙인 두웅!!은 코스트로 눕힐 수 없어요.`]});
  }
  const next=hand && (mainPlay || canCounter && c.type==='event') ? afterPlay(G,uid,p,k,c.type) : G;
  eff.abilities.forEach((ab,idx)=>{
    const now=hand?(mainPlay && ['onPlay','main'].includes(ab.timing) || canCounter && ab.timing==='counter'):(main && ab.timing==='activateMain' || ab.timing==='static' || main && L.attack.includes(uid) && ab.timing==='whenAttacking' || pend?.type==='block' && pend.options.includes(uid) && ab.timing==='onBlock');
    const allowed=ab.timing!=='activateMain'||L.activate.some(x=>x.uid===uid&&x.i===idx&&!x.event);
    if((c.base||c.no)==='OP15-058' && ab.timing==='static' && ab.src?.includes('6장')) {
      later.push({label:'두웅!! 덱',kind:'ready',status:'리더 규칙',lines:['에넬은 두웅!! 6장으로 시작해요. 덱에 남은 수만큼만 필드로 가져올 수 있어요.']}); return;
    }
    const r=abilityRow(now?next:G,db,uid,p,c,ab,now,allowed,caution);
    if((c.base||c.no)==='OP15-058' && ab.timing==='activateMain')r.lines.push(`두웅!! 덱에 남은 수는 ${P.donDeck}장이에요. 세울 장수, 눕힐 장수, 내 캐릭터에 붙일 장수를 각각 골라요. 0장도 가능해요.`);
    if(now && hand && c.type==='character' && P.chars.length>=E.MAX_CHARS)r.lines.push('교체할 캐릭터에 따라 대상과 조건이 달라질 수 있어요.');
    if(r.kind==='unknown'||now)rows.push(r);else later.push(r);
  });
  if(caution && !rows.some(r=>r.lines.includes(caution)))rows.push({label:'실제 카드와의 차이',kind:'unknown',status:'구현 제한',lines:[caution]});
  for(const k of eff.keywords||[]) { const kw=explainKeyword(k); if(kw.text)later.push({label:kw.name,kind:'later',status:'필드에서',lines:[kw.text]}); }
  if(((c.base||c.no)!=='OP15-058' && eff.unparsed?.length || c.text && !(db.effects?.[c.no]||db.effects?.[c.base])) && !rows.some(r=>r.kind==='unknown'))row('카드 문구', 'unknown','자동 처리 제한','아직 게임이 해석하지 못한 문구가 있어요. 카드 설명에서 원문을 확인하세요.');
  return {rows,later};
}
export function mentorHtml(m) {
  if(!m)return '';
  const part=r=>`<div class="cm-row cm-${esc(r.kind)}"><div><b>${esc(r.label)}</b><span>${esc(r.status)}</span></div>${r.lines.filter(Boolean).map(t=>`<p>${esc(t)}</p>`).join('')}</div>`;
  return `<section class="card-mentor" tabindex="0" aria-label="선택한 카드 도움말"><h4>이 카드, 지금 어떻게 써요?</h4>${m.rows.map(part).join('')}${m.later.length?`<details><summary>다른 행동과 타이밍 ${m.later.length}개</summary>${m.later.map(part).join('')}</details>`:''}</section>`;
}
