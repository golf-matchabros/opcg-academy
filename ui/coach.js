// 코치: "낼 수 있다" 와 "지금 내면 좋다" 를 구분해서 설명
import * as E from '../engine/core.js?v=202611261836';
import { condText, targetText, explainAbility } from '../engine/explain.js?v=202611261836';

const KW = { blocker: '블로커', rush: '속공', rushCharacter: '속공(캐릭터만)', doubleAttack: '더블 어택', banish: '배니시', unblockable: '블록 불가' };

// 어떤 카드인지 한 줄 요약
export function roleOf(db, c) {
  const eff = E.effectsOf(db, c.no);
  const kws = (eff.keywords || []).map(k => KW[k]).filter(Boolean);
  const type = { character: '캐릭터', event: '이벤트', stage: '스테이지', leader: '리더' }[c.type];
  let s = `${type} · 코스트 ${c.cost ?? '-'}`;
  if (c.type === 'character') s += ` · 파워 ${c.power}`;
  if (c.counter) s += ` · 카운터 +${c.counter}`;
  if (kws.length) s += ` · ${kws.join('/')}`;
  const timings = new Set(eff.abilities.map(a => a.timing));
  const role = [];
  if (timings.has('onPlay')) role.push('낼 때 효과가 있는 카드');
  if (timings.has('activateMain')) role.push('필드에서 직접 쓰는 효과가 있는 카드');
  if (timings.has('whenAttacking')) role.push('어택할 때 효과가 있는 카드');
  if (timings.has('counter')) role.push('상대 공격을 막는 카운터 이벤트');
  if (timings.has('main') && c.type === 'event') role.push('내 턴에 쓰는 이벤트');
  if (timings.has('trigger')) role.push('라이프에서 패로 가져올 때 선택하는 트리거가 있는 카드');
  if (!eff.abilities.length && !kws.length) role.push('효과 없는 카드(파워로 싸우는 몸통)');
  return { line: s, role: role.join(', ') };
}

// 지금 내면 어떤지 판단: grade = good | ok | meh
export function evalPlay(G, db, uid, me) {
  const c = db.cards.get(G.cards[uid].no); const eff = E.effectsOf(db, c.no);
  const P = G.players[me], O = G.players[1 - me];
  const ctx = { p: me, src: uid };
  const good = [], bad = [], info = [];
  const playAbs = eff.abilities.filter(a => (c.type === 'event' ? a.timing === 'main' : a.timing === 'onPlay'));
  for (const ab of playAbs) {
    const label = c.type === 'event' ? '이벤트 효과' : '【등장 시】 효과';
    if (ab.condition) {
      const v = E.evalCond(G, db, ab.condition, ctx);
      if (v === false) { bad.push(`${label}의 조건이 지금 안 맞아서 효과가 안 나요 (조건: ${condText(ab.condition)})`); continue; }
      if (v === 'unknown') { info.push(`${label} 조건은 자동 판정을 지원하지 않아요: ${condText(ab.condition)}`); continue; }
    }
    if (ab.cost && ab.cost.length && !E.canPay(G, db, ab.cost, ctx)) { bad.push(`${label}을 쓰려면 비용이 필요한데 지금은 낼 수 없어요`); continue; }
    let fizz = false;
    for (const st of ab.steps || []) {
      if (st.do === 'manual') { info.push('미지원 효과는 적용되지 않아요'); fizz = true; continue; }
      const t = st.target;
      if (t && !t.thisCard && ['ko', 'rest', 'bounce', 'toDeckBottom', 'power', 'grant', 'costMod', 'negate', 'attachDon', 'setActive'].includes(st.do)) {
        let cands = E.targetCandidates(G, db, t, ctx);
        if (st.do === 'ko' || st.do === 'bounce' || st.do === 'toDeckBottom' || st.do === 'rest' || (st.do === 'power' && st.amount < 0)) cands = cands.filter(u => G.cards[u].owner !== me || t.side === 'self');
        if (!cands.length) { bad.push(`지금은 효과를 걸 대상이 없어요 (대상: ${targetText(t)})`); fizz = true; }
      }
      if (st.do === 'play' && st.from === 'hand') {
        const f = { ...(st.filter || {}) }; if (!f.type) f.type = 'character';
        if (!P.hand.some(u => u !== uid && E.matchFilter(G, db, u, f, ctx))) { bad.push('효과로 꺼낼 수 있는 카드가 손패에 없어요'); fizz = true; }
      }
      if (st.do === 'play' && st.from === 'trash') {
        const f = { ...(st.filter || {}) }; if (!f.type) f.type = 'character';
        if (!P.trash.some(u => E.matchFilter(G, db, u, f, ctx))) { bad.push('효과로 꺼낼 카드가 트래시에 없어요'); fizz = true; }
      }
      if (st.do === 'lifeToHand' && st.side !== 'opp' && P.life.length <= 1) info.push('내 라이프가 줄어드는 효과라 라이프가 적을 땐 조심해요');
      if (st.do === 'discard' && st.side !== 'opp' && P.hand.length <= 2) info.push('손패를 버리는 효과라 손패가 적으면 부담이에요');
    }
    if (!fizz && !bad.length) { try { good.push(`지금 내면 효과가 제대로 나요: ${explainAbility(ab, c).result}`); } catch { good.push('지금 내면 효과가 제대로 나요'); } }
  }
  if(c.type==='event' && (P.turnsTaken===1 || (P.turnsTaken===undefined && G.turn<=2)) && playAbs.length && playAbs.every(ab => ab.steps?.length && ab.steps.every(st => st.duration==='turn' && st.target?.side==='self' && ((st.do==='grant' && ['unblockable','rush','rushCharacter','banish','doubleAttack'].includes(st.keyword)) || (st.do==='power' && st.amount>0))))) {
    good.length=0; bad.push('지금 낼 수는 있지만 첫 턴이라 어택할 수 없어요. 이 효과는 이번 턴이 끝나면 사라져요.');
    if(eff.abilities.some(ab=>ab.timing==='counter')) info.push('손에 남겨 두면 나중에 상대의 어택에 카운터로 쓸 수 있어요');
  }
  const kws = eff.keywords || [];
  if (c.type === 'character') {
    if (kws.includes('rush') && G.turn > 2) good.push('【속공】이라 내자마자 바로 어택할 수 있어요');
    if (kws.includes('blocker')) info.push('【블로커】라 상대 턴에 내 리더를 지켜줘요');
    if (!playAbs.length && !kws.length) info.push('낼 때 바로 쓰는 효과는 없어요. 다음 내 턴부터 어택에 쓸 수 있어요');
    if (bad.length) info.push('효과는 안 나도 필드에 캐릭터를 늘리는 의미는 있어요');
    if (P.chars.length >= E.MAX_CHARS) bad.push('필드가 5장으로 꽉 차서 한 장을 트래시로 보내야 해요');
  }
  if (c.counter >= 2000 && !playAbs.length && !kws.includes('blocker')) info.push(`카운터 +${c.counter} 카드라 손에 남겨두면 상대 공격을 막을 때 좋아요`);
  const cost = E.costOf(G, db, uid);
  if (cost >= P.donActive && P.donActive > 0 && G.turn > 2) info.push('이걸 내면 남는 두웅!!이 없어서 리더 파워를 올릴 수 없어요');
  let grade = 'ok';
  if (good.length && !bad.length) grade = 'good';
  if (bad.length && !(c.type === 'character' && !bad.some(b => b.includes('꽉 차')) && playAbs.length === 0)) grade = 'meh';
  if (c.type === 'event' && bad.length) grade = 'meh';
  return { grade, good, bad, info };
}
