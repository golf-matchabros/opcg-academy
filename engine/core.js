// 원피스 카드게임 엔진 (브라우저/Node 공용, 의존성 없음)
// G(상태)는 JSON 직렬화 가능. 카드/효과 DB는 G 밖에서 db 로 전달.
// apply(G, db, playerIndex, action) -> G 를 직접 변경. G.events 에 연출용 이벤트 누적.

export const MAX_CHARS = 5;

// ---------- 유틸 ----------
function rand(G) {
  let t = (G.rngState = (G.rngState + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(G, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand(G) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
export const opp = p => 1 - p;
export const card = (db, no) => db.cards.get(no);
export function inst(G, uid) { return G.cards[uid]; }
export function def(G, db, uid) { return db.cards.get(G.cards[uid].no); }
export function effectsOf(db, no) {
  const e = db.effects || {};
  const c = db.cards.get(no);
  const r = e[no] || (c && e[c.base]) || EMPTY_EFF;
  if (!r._x) {
    const x = { ...r, abilities: (r.abilities || []).flatMap(ab => ab.timing2 ? [ab, { ...ab, timing: ab.timing2, timing2: null }] : [ab]) };
    Object.defineProperty(r, '_x', { value: x, enumerable: false });
  }
  return r._x;
}
const EMPTY_EFF = { keywords: [], abilities: [], coverage: 1, unparsed: [] };
function ev(G, e) { e.i = G.evSeq = (G.evSeq || 0) + 1; if (G._src && e.by === undefined && e.t !== 'log') e.by = G._src; G.events.push(e); }
function log(G, text, p = null) { ev(G, { t: 'log', text, p }); }
const nm = (G, db, uid) => { const c = def(G, db, uid); return c ? `「${c.name}」` : '카드'; };

// ---------- 생성 ----------
export function expandDeck(deck) {
  const list = [];
  for (const { no, count } of deck.cards) for (let i = 0; i < count; i++) list.push(no);
  return list;
}
export function createGame({ decks, names = ['나', '상대'], seed = Date.now() % 2147483647, first = 0, ai = [false, true], sandbox = true }, db) {
  const G = {
    v: 1, seed, rngState: seed, turn: 0, active: first, first, phase: 'mulligan', winner: null, loseReason: null,
    players: [], cards: {}, nextUid: 1, mods: [], used: {}, queue: [], pending: null, battle: null,
    events: [], evSeq: 0, sandbox, ai,
  };
  for (let p = 0; p < 2; p++) {
    const d = decks[p];
    const P = { name: names[p], leader: null, chars: [], stage: null, hand: [], deck: [], trash: [], life: [], donDeck: 10, donActive: 0, donRested: 0, mull: false };
    G.players.push(P);
    P.leader = mk(G, d.leader, p);
    P.deck = shuffle(G, expandDeck(d).map(no => mk(G, no, p)));
  }
  for (let p = 0; p < 2; p++) drawN(G, db, p, 5, true);
  G.pending = { type: 'mulligan', p: first, text: '첫 패 5장을 다시 뽑을까요? (한 번만 가능)' };
  log(G, `${G.players[first].name} 선공으로 게임 시작`);
  return G;
}
// 레슨/효과 시연용: 정해진 장면으로 게임 생성
// spec = { players:[{ name, leader, chars:[no|{no,rested,don,fresh}], stage, hand:[no], deck:[no], life:n|[no], trash:[no], donActive, donRested, donDeck }], active, turn, ai:[b,b], sandbox, seed }
export function createScenario(spec, db) {
  const G = {
    v: 1, seed: spec.seed || 7, rngState: spec.seed || 7, turn: spec.turn ?? 3, active: spec.active ?? 0, first: 0, phase: spec.phase || 'main', winner: null, loseReason: null,
    players: [], cards: {}, nextUid: 1, mods: [], used: {}, queue: [], pending: null, battle: null, events: [], evSeq: 0,
    sandbox: spec.sandbox ?? true, ai: spec.ai || [false, true], scenario: true,
  };
  const filler = spec.filler || 'OP01-006';
  for (let p = 0; p < 2; p++) {
    const s = spec.players[p] || {};
    const P = { name: s.name || (p ? '상대' : '나'), leader: null, chars: [], stage: null, hand: [], deck: [], trash: [], life: [], donDeck: s.donDeck ?? 0, donActive: s.donActive ?? 0, donRested: s.donRested ?? 0, mull: true };
    G.players.push(P);
    P.leader = mk(G, s.leader || 'ST01-001', p); G.cards[P.leader].zone = 'leader';
    if (s.leaderRested) G.cards[P.leader].rested = true;
    if (s.leaderDon) G.cards[P.leader].don = s.leaderDon;
    for (const x of s.chars || []) {
      const o = typeof x === 'string' ? { no: x } : x; const u = mk(G, o.no, p);
      Object.assign(G.cards[u], { zone: 'chars', rested: !!o.rested, don: o.don || 0, playedTurn: o.fresh ? G.turn : -1 }); P.chars.push(u);
    }
    if (s.stage) { const u = mk(G, s.stage, p); G.cards[u].zone = 'stage'; P.stage = u; }
    for (const no of s.hand || []) { const u = mk(G, no, p); G.cards[u].zone = 'hand'; P.hand.push(u); }
    const deck = s.deck || Array(20).fill(filler);
    for (const no of deck) { const u = mk(G, no, p); P.deck.push(u); }
    const life = Array.isArray(s.life) ? s.life : Array(s.life ?? 4).fill(filler);
    for (const no of life) { const u = mk(G, no, p); G.cards[u].zone = 'life'; P.life.push({ uid: u, faceUp: false }); }
    for (const no of s.trash || []) { const u = mk(G, no, p); G.cards[u].zone = 'trash'; P.trash.push(u); }
  }
  return G;
}
// 카드 효과 시연: 해당 카드의 타이밍에 맞는 장면을 만들고 발동시킨다
export function findUid(G, no, p) { return Object.values(G.cards).find(c => c.no === no && (p == null || c.owner === p))?.uid; }

function mk(G, no, owner) {
  const uid = 'c' + G.nextUid++;
  G.cards[uid] = { uid, no, owner, rested: false, don: 0, playedTurn: -1, zone: 'deck' };
  return uid;
}

// ---------- 존 이동 ----------
function zoneOf(G, uid) {
  const c = G.cards[uid]; const P = G.players[c.owner];
  if (P.leader === uid) return 'leader';
  if (P.stage === uid) return 'stage';
  for (const z of ['chars', 'hand', 'deck', 'trash']) if (P[z].includes(uid)) return z;
  if (P.life.some(l => l.uid === uid)) return 'life';
  return null;
}
function removeFromZone(G, uid) {
  const c = G.cards[uid]; const P = G.players[c.owner];
  const z = zoneOf(G, uid);
  if (z === 'stage') P.stage = null;
  else if (z === 'life') P.life = P.life.filter(l => l.uid !== uid);
  else if (z && z !== 'leader') P[z] = P[z].filter(u => u !== uid);
  if ((z === 'chars' || z === 'stage') && c.don) { P.donRested += c.don; c.don = 0; }
  if (z === 'chars' || z === 'stage') G.mods = G.mods.filter(m => m.target !== uid);
  c.rested = false;
  return z;
}
export function moveCard(G, db, uid, to, { bottom = false, faceUp = false, rested = false } = {}) {
  const c = G.cards[uid]; const P = G.players[c.owner];
  const from = removeFromZone(G, uid);
  c.zone = to;
  if (to === 'hand') P.hand.push(uid);
  else if (to === 'trash') P.trash.push(uid);
  else if (to === 'deck') bottom ? P.deck.push(uid) : P.deck.unshift(uid);
  else if (to === 'life') P.life.push({ uid, faceUp });
  else if (to === 'chars') { P.chars.push(uid); c.rested = rested; c.playedTurn = G.turn; }
  else if (to === 'stage') { P.stage = uid; c.rested = rested; c.playedTurn = G.turn; }
  ev(G, { t: 'move', uid, no: c.no, owner: c.owner, from, to });
  return from;
}
function drawN(G, db, p, n, silent = false) {
  const P = G.players[p]; let k = 0;
  for (let i = 0; i < n; i++) {
    if (!P.deck.length) { lose(G, p, '덱이 0장이 되었어요'); break; }
    const uid = P.deck.shift(); G.cards[uid].zone = 'hand'; P.hand.push(uid); k++;
    ev(G, { t: 'draw', p, uid });
  }
  if (!silent && k) log(G, `${P.name}: ${k}장 드로우`, p);
}
function lose(G, p, why) {
  if (G.winner !== null) return;
  G.winner = opp(p); G.loseReason = why; G.phase = 'over'; G.pending = null; G.queue = [];
  ev(G, { t: 'gameover', winner: G.winner, why });
  log(G, `${G.players[p].name} 패배: ${why}`);
}

// ---------- 파워 / 키워드 / 코스트 ----------
function fieldUids(G, p) {
  const P = G.players[p]; const a = [P.leader, ...P.chars]; if (P.stage) a.push(P.stage); return a;
}
function staticSources(G, db) {
  const out = [];
  for (let p = 0; p < 2; p++) for (const uid of fieldUids(G, p)) {
    const e = effectsOf(db, G.cards[uid].no);
    if (isNegated(G, uid)) continue;
    e.abilities.forEach((ab, i) => { if (ab.timing === 'static') out.push({ uid, p, ab, i }); });
  }
  return out;
}
function staticActive(G, db, s) {
  const { uid, p, ab } = s;
  if (ab.during === 'yourTurn' && G.active !== p) return false;
  if (ab.during === 'oppTurn' && G.active === p) return false;
  if (ab.donReq && (G.cards[uid].don || 0) < ab.donReq) return false;
  if (ab.condition && evalCond(G, db, ab.condition, { p, src: uid }) !== true) return false;
  return true;
}
let _staticGuard = 0;
function staticEffectsOn(G, db, uid, kinds) {
  if (_staticGuard > 2) return [];
  _staticGuard++;
  const res = [];
  try {
    for (const s of staticSources(G, db)) {
      if (!staticActive(G, db, s)) continue;
      for (const st of s.ab.steps || []) {
        if (!kinds.includes(st.do)) continue;
        if (st.condition && evalCond(G, db, st.condition, { p: s.p, src: s.uid }) !== true) continue;
        const t = st.target || { thisCard: true };
        let hit = false;
        if (t.thisCard) hit = uid === s.uid;
        else hit = targetCandidates(G, db, t, { p: s.p, src: s.uid }, true).includes(uid);
        if (hit) res.push(st);
      }
    }
  } finally { _staticGuard--; }
  return res;
}
export function basePower(G, db, uid) {
  const c = def(G, db, uid); let b = c.power || 0;
  for (const m of G.mods) if (m.target === uid && m.kind === 'setBase') b = m.value;
  for (const st of staticEffectsOn(G, db, uid, ['setBasePower'])) b = st.value;
  return b;
}
export function power(G, db, uid) {
  const c = G.cards[uid]; let pw = basePower(G, db, uid);
  for (const m of G.mods) if (m.target === uid && m.kind === 'power') pw += m.value;
  for (const st of staticEffectsOn(G, db, uid, ['power'])) pw += st.amount || 0;
  if (c.owner === G.active) pw += (c.don || 0) * 1000;
  return Math.max(0, pw);
}
export function costOf(G, db, uid) {
  const c = def(G, db, uid); let k = c.cost || 0;
  for (const m of G.mods) if (m.target === uid && m.kind === 'costMod') k += m.value;
  for (const st of staticEffectsOn(G, db, uid, ['costMod'])) k += st.amount || 0;
  return Math.max(0, k);
}
export function hasKw(G, db, uid, kw) {
  if (isNegated(G, uid) && !G.mods.some(m => m.target === uid && m.kind === 'grant' && m.value === kw)) return false;
  const e = effectsOf(db, G.cards[uid].no);
  if ((e.keywords || []).includes(kw)) return true;
  if (G.mods.some(m => m.target === uid && m.kind === 'grant' && m.value === kw)) return true;
  return staticEffectsOn(G, db, uid, ['grant']).some(st => st.keyword === kw);
}
function isNegated(G, uid) { return G.mods.some(m => m.target === uid && m.kind === 'negate'); }

// ---------- 모디파이어 ----------
function addMod(G, m, owner = G.active) {
  const d = m.duration;
  const until = d === 'battle' ? 'battle' : d === 'untilOppTurnEnd' ? 'oppTurnEnd' : (d === 'untilYourNextTurn' || d === 'untilNextRefresh') ? 'myNextTurn' : (d === 'continuous' || d === 'permanent') ? 'leave' : 'turnEnd';
  G.mods.push({ ...m, until, turn: G.turn, by: owner });
}
function expireMods(G, when) {
  G.mods = G.mods.filter(m => {
    if (when === 'battle') return m.until !== 'battle';
    if (when === 'turnEnd') {
      if (m.until === 'turnEnd' || m.until === 'battle') return false;
      if (m.until === 'oppTurnEnd' && G.turn > m.turn && G.active !== m.by) return false;
      return true;
    }
    if (when === 'turnStart') return !(m.until === 'myNextTurn' && G.turn > m.turn && G.active === m.by) && !(m.kind === 'grant' && m.value === 'skipNextRefresh' && G.turn > m.turn);
    return true;
  });
}

// ---------- 필터 / 대상 ----------
export function matchFilter(G, db, uid, f = {}, ctx = {}) {
  if (!f) return true;
  const c = def(G, db, uid); const i = G.cards[uid];
  const onField = ['chars', 'stage', 'leader'].includes(zoneOf(G, uid));
  const cost = onField || zoneOf(G, uid) === 'hand' ? costOf(G, db, uid) : (c.cost || 0);
  if (f.costMax != null && cost > f.costMax) return false;
  if (f.costMin != null && cost < f.costMin) return false;
  if (f.cost != null && cost !== f.cost) return false;
  const pw = onField ? power(G, db, uid) : (c.power || 0);
  if (f.powerMax != null && pw > f.powerMax) return false;
  if (f.powerMin != null && pw < f.powerMin) return false;
  if (f.basePowerMax != null && (c.power || 0) > f.basePowerMax) return false;
  if (f.basePowerMin != null && (c.power || 0) < f.basePowerMin) return false;
  if (f.trait && !c.traits.some(t => t === f.trait || t.includes(f.trait))) return false;
  if (f.traitAny && !f.traitAny.some(tr => c.traits.some(t => t === tr || t.includes(tr)))) return false;
  if (f.traitContains && !c.traits.some(t => t.includes(f.traitContains))) return false;
  if (f.color && !c.colors.includes(f.color)) return false;
  const nmArr = v => Array.isArray(v) ? v : [v];
  if (f.name && !nmArr(f.name).includes(c.name)) return false;
  if (f.nameAny && !f.nameAny.includes(c.name)) return false;
  if (f.notName && nmArr(f.notName).includes(c.name)) return false;
  if (f.baseCostMax != null && (c.cost || 0) > f.baseCostMax) return false;
  if (f.baseCostMin != null && (c.cost || 0) < f.baseCostMin) return false;
  if (f.costMaxRef) {
    const me = ctx.p ?? i.owner; const ref = f.costMaxRef === 'oppLife' ? G.players[opp(me)].life.length : f.costMaxRef === 'myLife' ? G.players[me].life.length : G.players[0].life.length + G.players[1].life.length;
    if (cost > ref) return false;
  }
  if (f.noDon && i.don) return false;
  if (f.state === 'rested' && !i.rested) return false;
  if (f.state === 'active' && i.rested) return false;
  if (f.type && c.type !== f.type) return false;
  if (f.typeAny && !f.typeAny.includes(c.type)) return false;
  if (f.hasTrigger && !c.trigger) return false;
  if (f.notThis && uid === ctx.src) return false;
  if (f.hasCounter && !(c.counter > 0)) return false;
  return true;
}
export function targetCandidates(G, db, t, ctx, staticMode = false) {
  if (t.thisCard) return ctx.src ? [ctx.src] : [];
  const sides = t.side === 'opp' ? [opp(ctx.p)] : t.side === 'self' ? [ctx.p] : [ctx.p, opp(ctx.p)];
  let list = [];
  const leaderFree = t.filterAppliesTo === 'character';
  for (const s of sides) {
    const P = G.players[s];
    const z = t.zone || 'character';
    if (z === 'leader' || z === 'leaderOrCharacter' || z === 'leaderOrStage') list.push(P.leader);
    if (z === 'character' || z === 'leaderOrCharacter') list.push(...P.chars);
    if ((z === 'stage' || z === 'leaderOrStage') && P.stage) list.push(P.stage);
    if (z === 'hand') list.push(...P.hand);
    if (z === 'trash') list.push(...P.trash);
    if (z === 'deck') list.push(...P.deck);
  }
  if (!staticMode && t.filter && !t.filter.notThis && t.excludeThis) list = list.filter(u => u !== ctx.src);
  return list.filter(u => (leaderFree && G.players[G.cards[u].owner].leader === u) || matchFilter(G, db, u, t.filter, ctx));
}

// ---------- 조건 ----------
export function evalCond(G, db, c, ctx) {
  if (!c) return true;
  const P = G.players[ctx.p], O = G.players[opp(ctx.p)];
  if (c.and) { let r = true; for (const x of c.and) { const v = evalCond(G, db, x, ctx); if (v === false) return false; if (v !== true) r = v; } return r; }
  if (c.or) { let r = false; for (const x of c.or) { const v = evalCond(G, db, x, ctx); if (v === true) return true; if (v !== false) r = v; } return r; }
  if (c.not) { const v = evalCond(G, db, c.not, ctx); return v === true ? false : v === false ? true : v; }
  const donField = P.donActive + P.donRested + fieldUids(G, ctx.p).reduce((s, u) => s + (G.cards[u].don || 0), 0);
  const oDonField = O.donActive + O.donRested + fieldUids(G, opp(ctx.p)).reduce((s, u) => s + (G.cards[u].don || 0), 0);
  const L = def(G, db, P.leader);
  const checks = {
    lifeAtMost: v => P.life.length <= v, lifeAtLeast: v => P.life.length >= v,
    oppLifeAtMost: v => O.life.length <= v, oppLifeAtLeast: v => O.life.length >= v,
    handAtMost: v => P.hand.length <= v, handAtLeast: v => P.hand.length >= v,
    oppHandAtMost: v => O.hand.length <= v, oppHandAtLeast: v => O.hand.length >= v,
    donFieldAtLeast: v => donField >= v, donFieldAtMost: v => donField <= v,
    oppDonFieldAtLeast: v => oDonField >= v, donFieldLessThanOpp: () => donField < oDonField,
    leaderTrait: v => L.traits.some(t => t === v || t.includes(v)),
    leaderTraitAny: v => v.some(x => L.traits.some(t => t === x || t.includes(x))),
    leaderTraitContains: v => L.traits.some(t => t.includes(v)),
    totalLifeAtMost: v => P.life.length + O.life.length <= v, totalLifeAtLeast: v => P.life.length + O.life.length >= v,
    donFieldAtMostOpp: () => donField <= oDonField, donFieldAtLeastOpp: () => donField >= oDonField,
    charCountExactly: v => P.chars.filter(u => matchFilter(G, db, u, v.filter, ctx)).length === v.n,
    oppCharCountExactly: v => O.chars.filter(u => matchFilter(G, db, u, v.filter, ctx)).length === v.n,
    ifPrevDone: () => ctx.prevDone !== false,
    leaderName: v => L.name === v || L.name.includes(v),
    leaderColor: v => L.colors.includes(v),
    leaderMulticolor: () => L.colors.length > 1,
    trashAtLeast: v => P.trash.length >= v, deckAtMost: v => P.deck.length <= v,
    charCountAtLeast: v => P.chars.filter(u => matchFilter(G, db, u, v.filter, ctx)).length >= v.n,
    charCountAtMost: v => P.chars.filter(u => matchFilter(G, db, u, v.filter, ctx)).length <= v.n,
    oppCharCountAtLeast: v => O.chars.filter(u => matchFilter(G, db, u, v.filter, ctx)).length >= v.n,
    oppCharCountAtMost: v => O.chars.filter(u => matchFilter(G, db, u, v.filter, ctx)).length <= v.n,
    thisRested: () => G.cards[ctx.src]?.rested === true,
    thisActive: () => G.cards[ctx.src]?.rested === false,
    yourTurn: () => G.active === ctx.p, oppTurn: () => G.active !== ctx.p,
    leaderRested: () => G.cards[P.leader].rested,
    lifeLessThanOpp: () => P.life.length < O.life.length,
    leaderPowerAtLeast: v => power(G, db, P.leader) >= v,
  };
  let result = true, known = false;
  for (const k of Object.keys(c)) {
    if (k === 'raw') continue;
    if (checks[k]) { known = true; if (!checks[k](c[k])) result = false; }
  }
  if (!known) return 'unknown';
  return result;
}

// ---------- 효과 실행 큐 ----------
// queue 항목: {a: Action, ctx:{p, src, ab, abText}} 또는 {sys: '...'}
function pushFront(G, items) { G.queue.unshift(...items); }
export function fireAbility(G, db, uid, ab, p, extra = {}) {
  const c = G.cards[uid];
  if (isNegated(G, uid) && ab.timing !== 'counter' && ab.timing !== 'main') return false;
  const ctx = { p, src: uid, abText: ab.src, no: c.no, ...extra };
  const items = [{ sys: 'abilityStart', ab, ctx }];
  pushFront(G, items);
  return true;
}
// 상황 유발 효과: 현재 처리 중인 액션이 끝난 뒤 실행되도록 G.trig 에 모음
const KNOWN_T = new Set(['onPlay', 'activateMain', 'main', 'counter', 'trigger', 'whenAttacking', 'onKO', 'onBlock', 'endOfYourTurn', 'endOfOppTurn', 'onOppAttack', 'static', 'onEvent', 'onKOByOppEffect', 'onCharKO', 'onDonReturned', 'onEventCardUsed', 'onDonAttached', 'onBattleKO', 'onDamageDealt', 'onCharPlayed', 'onLifeToHand', 'onBlockerUsed', 'onRested', 'onHandDiscardedByEffect']);
export function isManualEventTiming(t) { return t === 'onEvent' || !KNOWN_T.has(t); }
function fireEvt(G, db, timing, pred) {
  for (let p = 0; p < 2; p++) for (const u of fieldUids(G, p)) {
    if (isNegated(G, u)) continue;
    for (const ab of effectsOf(db, G.cards[u].no).abilities) {
      if (ab.timing !== timing) continue;
      const e = ab.event || {};
      if (!pred(e, u, p, ab)) continue;
      (G.trig = G.trig || []).push({ sys: 'abilityStart', ab, ctx: { p, src: u, abText: ab.src, no: G.cards[u].no } });
    }
  }
}
const sideOk = (e, owner, subject) => !e.side || e.side === 'both' || e.side === 'any' || (e.side === 'self' ? owner === subject : owner !== subject);
function abilityKey(uid, ab) { return uid + '|' + (ab.src || '').slice(0, 40); }

function startAbility(G, db, item) {
  const { ab, ctx } = item;
  const key = abilityKey(ctx.src, ab);
  if (ab.oncePerTurn && G.used[key] === G.turn) return;
  if (ab.donReq && (G.cards[ctx.src]?.don || 0) < ab.donReq && ab.timing !== 'activateMain') return;
  // 조건
  if (ab.condition) {
    const v = evalCond(G, db, ab.condition, ctx);
    if (v === false) { log(G, `${nm(G, db, ctx.src)} 효과 조건 불충족`, ctx.p); return; }
    if (v === 'unknown' && !item.condOk) {
      if (G.ai[ctx.p]) { /* AI는 만족으로 간주 */ }
      else { item.condOk = true; pushFront(G, [item]); G.pending = { type: 'yesno', p: ctx.p, text: `조건 확인: "${ab.condition.raw || '조건'}" 을(를) 만족하나요?`, key: 'cond', src: ctx.src }; return 'wait'; }
    }
    if (item.condAnswer === false) return;
  }
  // 선택 효과
  if (ab.optional && !item.optDone) {
    if (G.ai[ctx.p]) item.optAnswer = true;
    else if (item.optAnswer === undefined) { item.optDone = true; pushFront(G, [item]); G.pending = { type: 'yesno', p: ctx.p, text: `${nm(G, db, ctx.src)} 효과를 사용할까요?\n${ab.src || ''}`, key: 'opt', src: ctx.src }; return 'wait'; }
  }
  if (ab.optional && item.optAnswer === false) { log(G, `${nm(G, db, ctx.src)} 효과 사용 안 함`, ctx.p); return; }
  // 비용 지불 가능 확인
  if (ab.cost && ab.cost.length && !canPay(G, db, ab.cost, ctx)) { log(G, `${nm(G, db, ctx.src)} 효과: 비용을 낼 수 없어요`, ctx.p); return; }
  if (ab.oncePerTurn) G.used[key] = G.turn;
  ev(G, { t: 'ability', uid: ctx.src, no: ctx.no, p: ctx.p, timing: ab.timing, src: ab.src });
  log(G, `${nm(G, db, ctx.src)} 효과 발동`, ctx.p);
  const steps = [...(ab.cost || []).map(a => ({ a, ctx, isCost: true })), ...(ab.steps || []).map(a => ({ a, ctx }))];
  pushFront(G, steps);
}
function canPay(G, db, cost, ctx) {
  const P = G.players[ctx.p];
  for (const a of cost) {
    if (a.do === 'restDon' && P.donActive < (a.n || 1)) return false;
    if (a.do === 'returnDon') { const tot = P.donActive + P.donRested + fieldUids(G, ctx.p).reduce((s, u) => s + G.cards[u].don, 0); if (tot < (a.n || 1)) return false; }
    if (a.do === 'discard' && P.hand.filter(u => matchFilter(G, db, u, a.filter, ctx)).length < (a.n || 1)) return false;
    if (a.do === 'rest' && a.target?.thisCard && G.cards[ctx.src].rested) return false;
    if (a.do === 'trashLife' && P.life.length < (a.n || 1)) return false;
    if (a.do === 'lifeToHand' && P.life.length < (a.n || 1)) return false;
  }
  return true;
}

export function runQueue(G, db) {
  let guard = 0;
  const flush = () => { if (G.trig && G.trig.length) { pushFront(G, G.trig); G.trig = []; } };
  flush();
  while (!G.pending && G.queue.length && G.winner === null && guard++ < 500) {
    const item = G.queue.shift();
    let r;
    if (item.sys) r = sysStep(G, db, item);
    else { G._src = item.ctx?.src || null; r = execAction(G, db, item); G._src = null; }
    if (r === 'wait') return;
    flush();
  }
  checkRules(G);
  if (!G.pending && !G.queue.length && G.winner === null) afterQueueEmpty(G, db);
}
function checkRules(G) {
  if (G.phase === 'mulligan' || G.winner !== null) return;
  for (let p = 0; p < 2; p++) if (!G.players[p].deck.length) { lose(G, p, '덱이 0장이 되었어요'); return; }
}
function afterQueueEmpty(G, db) {
  if (G.phase === 'endPending') { finishTurn(G, db); }
}

function sysStep(G, db, item) {
  switch (item.sys) {
    case 'abilityStart': return startAbility(G, db, item);
    case 'blockStep': return blockStep(G, db);
    case 'counterStep': return counterStep(G, db);
    case 'damageStep': return damageStep(G, db);
    case 'battleEnd': return battleEnd(G, db);
    case 'damageLeader': return damageLeader(G, db, item);
    case 'trashCard': if (zoneOf(G, item.uid) === 'hand' || zoneOf(G, item.uid) === 'life') moveCard(G, db, item.uid, 'trash'); return;
    case 'playChar': return playCharFinish(G, db, item);
    case 'log': log(G, item.text, item.p); return;
    case 'trashLimbo': {
      const c = G.cards[item.uid];
      if (c.zone === 'limbo') { c.zone = 'trash'; G.players[c.owner].trash.push(item.uid); ev(G, { t: 'move', uid: item.uid, no: c.no, owner: c.owner, from: 'life', to: 'trash' }); }
      return;
    }
  }
}

// 대상 선택이 필요한 액션 처리
function resolveTargets(G, db, item) {
  const { a, ctx } = item;
  if (item.sel) return item.sel;
  const t = a.target; if (!t) return [];
  const cands = targetCandidates(G, db, t, ctx);
  const n = t.count || 1;
  if (t.thisCard) return item.sel = cands;
  if (t.all) return item.sel = cands;
  if (!cands.length) { item.sel = []; return []; }
  const min = t.upTo ? 0 : Math.min(n, cands.length);
  const chooser = t.chooser === 'opp' ? opp(ctx.p) : ctx.p;
  if (!t.upTo && cands.length <= n) return item.sel = cands;
  if (G.ai[chooser]) { item.sel = aiPickTargets(G, db, a, cands, n, ctx, chooser); return item.sel; }
  pushFront(G, [item]);
  G.pending = { type: 'target', p: chooser, options: cands, min, max: Math.min(n, cands.length), text: actionPrompt(G, db, a), src: ctx.src };
  return 'wait';
}
function actionPrompt(G, db, a) {
  const map = { power: (a.amount > 0 ? `파워 +${a.amount} 할` : `파워 ${a.amount} 할`), ko: 'KO 시킬', rest: '레스트로 할', setActive: '액티브로 할', bounce: '패로 되돌릴', toDeckBottom: '덱 아래로 보낼', toDeckTop: '덱 위로 보낼', toTrash: '트래시로 보낼', attachDon: '두웅!!을 붙일', grant: '효과를 줄', costMod: '코스트를 바꿀', negate: '효과를 무효로 할', setBasePower: '원래 파워를 바꿀' };
  return `${map[a.do] || '대상으로 할'} 카드를 고르세요`;
}
export function aiPickTargets(G, db, a, cands, n, ctx, chooser) {
  const mine = u => G.cards[u].owner === chooser;
  const score = u => { const c = def(G, db, u); return (c.cost || 0) * 10 + power(G, db, u) / 1000 + (c.type === 'leader' ? 5 : 0); };
  const good = ['power', 'setActive', 'grant', 'attachDon'].includes(a.do) && (a.amount == null || a.amount > 0);
  let list = [...cands];
  if (a.do === 'power' && a.amount < 0) list = list.filter(u => !mine(u));
  if (['ko', 'rest', 'bounce', 'toDeckBottom', 'toTrash', 'negate'].includes(a.do) && a.target?.side !== 'self') list = list.filter(u => !mine(u));
  if (good) list = list.filter(u => mine(u));
  if (!list.length) list = cands;
  list.sort((x, y) => score(y) - score(x));
  if (a.do === 'discard') list.sort((x, y) => score(x) - score(y));
  return list.slice(0, n);
}

function execAction(G, db, item) {
  const { a, ctx } = item;
  const P = G.players[ctx.p];
  if (a.condition && !item.condChecked) {
    const v = evalCond(G, db, a.condition, ctx);
    if (v === false) return;
    if (v === 'unknown' && !G.ai[ctx.p]) { item.condChecked = true; pushFront(G, [item]); G.pending = { type: 'yesno', p: ctx.p, text: `조건 확인: "${a.condition.raw || '조건'}" 을(를) 만족하나요?`, key: 'stepCond', src: ctx.src }; return 'wait'; }
    item.condChecked = true;
  }
  if (item.condAnswer === false) return;
  if (a.optional && item.optAnswer === undefined && !item.isCost) {
    if (G.ai[ctx.p]) item.optAnswer = true;
    else { pushFront(G, [item]); G.pending = { type: 'yesno', p: ctx.p, text: `이 단계를 실행할까요?\n${a.src || ''}`, key: 'stepOpt', src: ctx.src }; return 'wait'; }
  }
  if (item.optAnswer === false) { ctx.prevDone = false; return; }
  if (a.at === 'endOfThisTurn' && !item.delayedNow) { (G.delayed = G.delayed || []).push({ ...item, delayedNow: true }); log(G, '이번 턴 종료 시 처리할 효과 예약', ctx.p); return; }
  ctx.prevDone = true;
  const tgt = () => resolveTargets(G, db, item);
  const each = (fn) => { const s = tgt(); if (s === 'wait') return 'wait'; if (!s.length) ctx.prevDone = false; for (const u of s) fn(u); };
  const pickFrom = (pool, n, text, upTo = true, chooser = ctx.p) => {
    if (item.sel) return item.sel;
    if (!pool.length) { ctx.prevDone = false; return item.sel = []; }
    if (G.ai[chooser]) return item.sel = aiPickTargets(G, db, a, pool, n, ctx, chooser);
    pushFront(G, [item]); G.pending = { type: 'target', p: chooser, options: pool, min: upTo ? 0 : Math.min(n, pool.length), max: Math.min(n, pool.length), text }; return 'wait';
  };
  switch (a.do) {
    case 'thisToHand': if (zoneOf(G, ctx.src) !== 'hand') moveCard(G, db, ctx.src, 'hand'); return;
    case 'trashToHand': { const s = pickFrom(P.trash.filter(u => matchFilter(G, db, u, a.filter, ctx)), a.n || 1, `트래시에서 패에 더할 카드를 고르세요`, a.upTo !== false); if (s === 'wait') return s; s.forEach(u => moveCard(G, db, u, 'hand')); return; }
    case 'trashToDeck': { const s = pickFrom(P.trash.filter(u => matchFilter(G, db, u, a.filter, ctx)), a.n || 1, `트래시에서 덱으로 돌릴 카드를 고르세요`, a.upTo !== false); if (s === 'wait') return s; s.forEach(u => moveCard(G, db, u, 'deck', { bottom: a.pos !== 'top' })); return; }
    case 'handToDeck': { const s = pickFrom(P.hand.filter(u => matchFilter(G, db, u, a.filter, ctx)), a.n || 1, `패에서 덱 아래로 돌릴 카드를 고르세요`, !!a.upTo); if (s === 'wait') return s; s.forEach(u => moveCard(G, db, u, 'deck', { bottom: a.pos !== 'top' })); return; }
    case 'revealFromHand': { const s = pickFrom(P.hand.filter(u => matchFilter(G, db, u, a.filter, ctx)), a.n || 1, `패에서 공개할 카드를 고르세요`, false); if (s === 'wait') return s; s.forEach(u => ev(G, { t: 'reveal', uid: u })); return; }
    case 'lifeFace': { const n = a.all ? P.life.length : (a.n || 1); for (let k = 0; k < n && k < P.life.length; k++) P.life[P.life.length - 1 - k].faceUp = !!a.faceUp; ev(G, { t: 'lifeFace', p: ctx.p }); return; }
    case 'setPower': return each(u => { addMod(G, { kind: 'setBase', target: u, value: a.value, duration: a.duration }, ctx.p); ev(G, { t: 'power', uid: u, set: a.value, now: power(G, db, u) }); });
    case 'aliasName': return;
    case 'extraTurn': G.extraTurn = ctx.p; log(G, '추가 턴을 얻음', ctx.p); return;
    case 'shuffle': shuffle(G, P.deck); log(G, '덱을 섞음', ctx.p); return;
    case 'choose': {
      if (item.choice === undefined) {
        if (G.ai[ctx.p]) item.choice = 0;
        else { pushFront(G, [item]); G.pending = { type: 'option', p: ctx.p, options: a.options, text: '아래에서 하나를 고르세요' }; return 'wait'; }
      }
      pushFront(G, (a.options[item.choice] || []).map(s => ({ a: s, ctx })));
      return;
    }
    case 'activateAbilityOf': {
      const e = effectsOf(db, G.cards[ctx.src].no);
      const m = e.abilities.find(x => x.timing === (a.timing || 'main'));
      if (m) pushFront(G, [...(m.cost || []).map(s => ({ a: s, ctx, isCost: true })), ...(m.steps || []).map(s => ({ a: s, ctx }))]);
      return;
    }
    case 'draw': drawN(G, db, a.side === 'opp' ? opp(ctx.p) : ctx.p, a.n || 1); return;
    case 'power': return each(u => { addMod(G, { kind: 'power', target: u, value: a.amount, duration: a.duration }, ctx.p); ev(G, { t: 'power', uid: u, amount: a.amount, now: power(G, db, u) }); });
    case 'setBasePower': return each(u => { addMod(G, { kind: 'setBase', target: u, value: a.value, duration: a.duration }, ctx.p); ev(G, { t: 'power', uid: u, set: a.value, now: power(G, db, u) }); });
    case 'costMod': return each(u => { addMod(G, { kind: 'costMod', target: u, value: a.amount, duration: a.duration }, ctx.p); ev(G, { t: 'cost', uid: u, amount: a.amount }); });
    case 'grant': return each(u => { addMod(G, { kind: 'grant', target: u, value: a.keyword, duration: a.duration }, ctx.p); ev(G, { t: 'grant', uid: u, keyword: a.keyword }); });
    case 'negate': return each(u => { addMod(G, { kind: 'negate', target: u, duration: a.duration }, ctx.p); ev(G, { t: 'negate', uid: u }); });
    case 'ko': return each(u => koCard(G, db, u, 'effect', ctx.p));
    case 'rest': return each(u => { G.cards[u].rested = true; ev(G, { t: 'rest', uid: u }); fireEvt(G, db, 'onRested', (e, x) => x === u); });
    case 'setActive': return each(u => { G.cards[u].rested = false; ev(G, { t: 'active', uid: u }); });
    case 'bounce': return each(u => moveCard(G, db, u, 'hand'));
    case 'toDeckBottom': return each(u => moveCard(G, db, u, 'deck', { bottom: true }));
    case 'toDeckTop': return each(u => moveCard(G, db, u, 'deck'));
    case 'toTrash': return each(u => moveCard(G, db, u, 'trash'));
    case 'toLife': return each(u => moveCard(G, db, u, 'life', { faceUp: !!a.faceUp }));
    case 'discard': {
      const n = a.n || 1;
      const who = a.side === 'opp' ? opp(ctx.p) : ctx.p;
      const cands = G.players[who].hand.filter(u => matchFilter(G, db, u, a.filter, ctx));
      if (!cands.length) { ctx.prevDone = false; return; }
      if (!item.sel) {
        if (G.ai[who] || (cands.length <= n && !a.upTo)) item.sel = G.ai[who] ? aiPickTargets(G, db, { do: 'discard' }, cands, n, ctx, who) : cands.slice(0, n);
        else { pushFront(G, [item]); G.pending = { type: 'target', p: who, options: cands, min: a.upTo ? 0 : Math.min(n, cands.length), max: Math.min(n, cands.length), text: `패에서 버릴 카드 ${n}장을 고르세요` }; return 'wait'; }
      }
      if (!item.sel.length) ctx.prevDone = false;
      for (const u of item.sel) moveCard(G, db, u, 'trash');
      if (item.sel.length) fireEvt(G, db, 'onHandDiscardedByEffect', (e, x, o) => sideOk(e, o, who));
      return;
    }
    case 'trashFromDeckTop': for (let i = 0; i < (a.n || 1) && P.deck.length; i++) moveCard(G, db, P.deck[0], 'trash'); return;
    case 'addDon': {
      const tp = a.side === 'opp' ? G.players[opp(ctx.p)] : P;
      const k = Math.min(a.n || 1, tp.donDeck); tp.donDeck -= k;
      if (a.state === 'rested') tp.donRested += k; else tp.donActive += k;
      ev(G, { t: 'don', p: a.side === 'opp' ? opp(ctx.p) : ctx.p, add: k, state: a.state || 'active' }); return;
    }
    case 'restDon': { const pi = a.side === 'opp' ? opp(ctx.p) : ctx.p; const tp = G.players[pi]; const k = Math.min(a.n || 1, tp.donActive); tp.donActive -= k; tp.donRested += k; ev(G, { t: 'don', p: pi, rest: k }); return; }
    case 'setDonActive': { const pi = a.side === 'opp' ? opp(ctx.p) : ctx.p; const tp = G.players[pi]; const k = Math.min(a.n || 1, tp.donRested); tp.donRested -= k; tp.donActive += k; ev(G, { t: 'don', p: pi, activate: k }); return; }
    case 'returnDon': {
      const tp = a.side === 'opp' ? G.players[opp(ctx.p)] : P; const pi = a.side === 'opp' ? opp(ctx.p) : ctx.p;
      let k = a.n || 1, back = 0;
      while (k > 0 && tp.donRested > 0) { tp.donRested--; k--; back++; }
      while (k > 0 && tp.donActive > 0) { tp.donActive--; k--; back++; }
      for (const u of fieldUids(G, pi)) while (k > 0 && G.cards[u].don > 0) { G.cards[u].don--; k--; back++; }
      tp.donDeck += back; ev(G, { t: 'don', p: pi, ret: back });
      if (back) fireEvt(G, db, 'onDonReturned', (e, x, o) => sideOk(e, o, pi) && back >= (e.min || 1) && (!e.byOwnEffect || ctx.p === pi));
      return;
    }
    case 'attachDon': {
      const s = tgt(); if (s === 'wait') return 'wait';
      for (const u of s) {
        let k = a.n || 1;
        const fromRested = a.state !== 'active';
        while (k > 0 && (fromRested ? P.donRested : P.donActive) > 0) { fromRested ? P.donRested-- : P.donActive--; G.cards[u].don++; k--; }
        while (k > 0 && (fromRested ? P.donActive : P.donRested) > 0) { fromRested ? P.donActive-- : P.donRested--; G.cards[u].don++; k--; }
        ev(G, { t: 'attach', uid: u, don: G.cards[u].don });
      }
      return;
    }
    case 'search': {
      if (!item.looked) item.looked = P.deck.slice(0, a.look || 1);
      const looked = item.looked.filter(u => P.deck.includes(u));
      const cands = a.take === 0 ? [] : looked.filter(u => matchFilter(G, db, u, a.filter, ctx));
      if (a.take === 0) { ev(G, { t: 'look', p: ctx.p, uids: looked }); log(G, `덱 위 ${looked.length}장을 확인함`, ctx.p); if (a.rest === 'bottom') looked.forEach(u => moveCard(G, db, u, 'deck', { bottom: true })); return; }
      if (!item.sel) {
        if (G.ai[ctx.p]) item.sel = aiPickTargets(G, db, { do: 'search' }, cands, a.take || 1, ctx, ctx.p);
        else { pushFront(G, [item]); G.pending = { type: 'search', p: ctx.p, looked, options: cands, min: 0, max: Math.min(a.take || 1, cands.length), text: `덱 위 ${looked.length}장 중 가져올 카드를 고르세요 (최대 ${a.take || 1}장)` }; ev(G, { t: 'look', p: ctx.p, uids: looked }); return 'wait'; }
      }
      for (const u of item.sel) {
        if (a.dest === 'play') { moveCard(G, db, u, 'chars'); onCharEnter(G, db, u, ctx.p); }
        else { moveCard(G, db, u, 'hand'); ev(G, { t: 'reveal', uid: u }); }
      }
      const rest = looked.filter(u => !item.sel.includes(u) && P.deck.includes(u));
      for (const u of rest) {
        if (a.rest === 'trash') moveCard(G, db, u, 'trash');
        else if (a.rest === 'top') { /* 그대로 */ }
        else moveCard(G, db, u, 'deck', { bottom: true });
      }
      log(G, `덱 위 ${looked.length}장을 보고 ${item.sel.length}장을 가져옴`, ctx.p);
      return;
    }
    case 'lifeToHand': {
      const pi = a.side === 'opp' ? opp(ctx.p) : ctx.p; const tp = G.players[pi];
      if (!tp.life.length) ctx.prevDone = false;
      for (let i = 0; i < (a.n || 1) && tp.life.length; i++) { const l = a.from === 'bottom' ? tp.life[0] : tp.life[tp.life.length - 1]; moveCard(G, db, l.uid, 'hand'); ev(G, { t: 'life', p: pi, delta: -1 }); }
      return;
    }
    case 'trashLife': {
      const pi = a.side === 'opp' ? opp(ctx.p) : ctx.p; const tp = G.players[pi];
      for (let i = 0; i < (a.n || 1) && tp.life.length; i++) { const l = tp.life[tp.life.length - 1]; moveCard(G, db, l.uid, 'trash'); ev(G, { t: 'life', p: pi, delta: -1 }); }
      return;
    }
    case 'addLife': {
      if (a.from === 'field') return each(u => { moveCard(G, db, u, 'life', { faceUp: !!a.faceUp }); ev(G, { t: 'life', p: G.cards[u].owner, delta: +1 }); });
      for (let i = 0; i < (a.n || 1); i++) {
        if (a.from === 'hand') {
          if (!P.hand.length) break;
          let u = item.sel?.[i];
          if (!u) { if (G.ai[ctx.p]) u = aiPickTargets(G, db, { do: 'discard' }, P.hand, 1, ctx, ctx.p)[0]; else { pushFront(G, [item]); G.pending = { type: 'target', p: ctx.p, options: [...P.hand], min: 1, max: a.n || 1, text: '라이프에 추가할 패의 카드를 고르세요' }; return 'wait'; } }
          moveCard(G, db, u, 'life', { faceUp: !!a.faceUp });
        } else { if (!P.deck.length) break; moveCard(G, db, P.deck[0], 'life', { faceUp: !!a.faceUp }); }
        ev(G, { t: 'life', p: ctx.p, delta: +1 });
      }
      return;
    }
    case 'lookLife': ev(G, { t: 'lookLife', p: a.side === 'opp' ? opp(ctx.p) : ctx.p }); log(G, '라이프를 확인함', ctx.p); return;
    case 'play': {
      if (a.from === 'this' || a.card === 'this' || a.target?.thisCard) {
        const u = ctx.src; const c = def(G, db, u);
        if (c.type === 'stage') { if (P.stage) moveCard(G, db, P.stage, 'trash'); moveCard(G, db, u, 'stage'); }
        else { if (P.chars.length >= MAX_CHARS) moveCard(G, db, weakestChar(G, db, ctx.p), 'trash'); moveCard(G, db, u, 'chars', { rested: a.state === 'rested' }); onCharEnter(G, db, u, ctx.p); }
        return;
      }
      const from = a.from || 'hand';
      const pool = from === 'trash' ? P.trash : from === 'deckTop' ? P.deck.slice(0, a.look || 1) : P.hand;
      const f = { ...(a.filter || {}) }; if (!f.typeAny && !f.type) f.type = 'character';
      const cands = pool.filter(u => matchFilter(G, db, u, f, ctx));
      if (!cands.length) return;
      if (!item.sel) {
        const n = a.n || 1;
        if (G.ai[ctx.p]) item.sel = aiPickTargets(G, db, { do: 'play' }, cands, n, ctx, ctx.p);
        else { pushFront(G, [item]); G.pending = { type: 'target', p: ctx.p, options: cands, min: 0, max: Math.min(n, cands.length), text: `등장시킬 카드를 고르세요 (${from === 'trash' ? '트래시' : from === 'deckTop' ? '덱 위' : '패'})` }; return 'wait'; }
      }
      for (const u of item.sel) {
        const c = def(G, db, u);
        if (c.type === 'stage') { if (P.stage) moveCard(G, db, P.stage, 'trash'); moveCard(G, db, u, 'stage', { rested: a.state === 'rested' }); }
        else {
          if (P.chars.length >= MAX_CHARS) { const victim = G.ai[ctx.p] ? weakestChar(G, db, ctx.p) : P.chars[0]; moveCard(G, db, victim, 'trash'); }
          moveCard(G, db, u, 'chars', { rested: a.state === 'rested' }); onCharEnter(G, db, u, ctx.p);
        }
      }
      return;
    }
    case 'activateMainOf': {
      const e = effectsOf(db, G.cards[ctx.src].no);
      const m = e.abilities.find(x => x.timing === 'main');
      if (m) pushFront(G, (m.steps || []).map(s => ({ a: s, ctx })));
      return;
    }
    case 'manual': {
      if (G.ai[ctx.p]) { log(G, `AI: 자동 처리 안 되는 효과는 건너뜀 - "${(a.text || '').slice(0, 60)}"`, ctx.p); return; }
      G.pending = { type: 'manual', p: ctx.p, text: a.text || ctx.abText, src: ctx.src };
      ev(G, { t: 'manual', p: ctx.p, uid: ctx.src, text: a.text });
      return 'wait';
    }
    default:
      if (!G.ai[ctx.p]) { G.pending = { type: 'manual', p: ctx.p, text: a.src || a.text || ctx.abText || JSON.stringify(a), src: ctx.src }; return 'wait'; }
      return;
  }
}
function weakestChar(G, db, p) {
  const P = G.players[p];
  return [...P.chars].sort((a, b) => (costOf(G, db, a) - costOf(G, db, b)) || (power(G, db, a) - power(G, db, b)))[0];
}

// ---------- 등장 / KO ----------
function onCharEnter(G, db, uid, p) {
  ev(G, { t: 'enter', uid, p });
  fireEvt(G, db, 'onCharPlayed', (e, u, owner) => u !== uid && sideOk(e, owner, p));
  const e = effectsOf(db, G.cards[uid].no);
  const abs = e.abilities.filter(ab => ab.timing === 'onPlay');
  for (let i = abs.length - 1; i >= 0; i--) fireAbility(G, db, uid, abs[i], p);
}
export function koCard(G, db, uid, why, byP = null) {
  if (zoneOf(G, uid) !== 'chars') return;
  if (hasKw(G, db, uid, 'cannotBeKOd') || (why === 'battle' && hasKw(G, db, uid, 'cannotBeKOdInBattle')) || (why === 'effect' && hasKw(G, db, uid, 'cannotBeKOdByEffect')) || (why === 'effect' && byP != null && byP !== G.cards[uid].owner && hasKw(G, db, uid, 'cannotBeKOdByOppEffect'))) { log(G, `${nm(G, db, uid)}은(는) KO 되지 않아요`); return; }
  const owner = G.cards[uid].owner;
  const e = effectsOf(db, G.cards[uid].no);
  const onKO = isNegated(G, uid) ? [] : e.abilities.filter(ab => ab.timing === 'onKO');
  const koByOpp = why === 'effect' && byP != null && byP !== owner;
  const extra = koByOpp && !isNegated(G, uid) ? e.abilities.filter(ab => ab.timing === 'onKOByOppEffect') : [];
  moveCard(G, db, uid, 'trash');
  ev(G, { t: 'ko', uid, owner });
  for (const ab of extra) pushFront(G, [{ sys: 'abilityStart', ab, ctx: { p: owner, src: uid, abText: ab.src, no: G.cards[uid].no } }]);
  fireEvt(G, db, 'onCharKO', (ev2, u, o) => sideOk(ev2, o, owner));
  if (why === 'battle' && G.battle) fireEvt(G, db, 'onBattleKO', (ev2, u) => u === G.battle.attacker);
  log(G, `${nm(G, db, uid)} KO`, owner);
  for (let i = onKO.length - 1; i >= 0; i--) pushFront(G, [{ sys: 'abilityStart', ab: onKO[i], ctx: { p: owner, src: uid, abText: onKO[i].src, no: G.cards[uid].no } }]);
}

// ---------- 턴 진행 ----------
function startTurn(G, db) {
  G.turn++;
  const p = G.active; const P = G.players[p];
  G.phase = 'refresh';
  // 리프레시: 붙은 두웅!! 회수 후 전부 액티브
  for (const u of fieldUids(G, p)) { P.donRested += G.cards[u].don; G.cards[u].don = 0; if (!G.mods.some(m => m.target === u && m.kind === 'grant' && m.value === 'skipNextRefresh')) G.cards[u].rested = false; }
  expireMods(G, 'turnStart');
  P.donActive += P.donRested; P.donRested = 0;
  ev(G, { t: 'turn', p, turn: G.turn });
  log(G, `── ${G.turn}턴: ${P.name}의 차례 ──`, p);
  G.phase = 'draw';
  if (G.turn > 1) drawN(G, db, p, 1);
  if (G.winner !== null) return;
  G.phase = 'don';
  const k = Math.min(G.turn === 1 ? 1 : 2, P.donDeck); P.donDeck -= k; P.donActive += k;
  ev(G, { t: 'don', p, add: k, state: 'active' });
  G.phase = 'main';
}
function endTurn(G, db) {
  const p = G.active;
  G.phase = 'endPending';
  // 턴 종료 시 효과
  const items = [...(G.delayed || [])]; G.delayed = [];
  for (const u of fieldUids(G, p)) for (const ab of effectsOf(db, G.cards[u].no).abilities) if (ab.timing === 'endOfYourTurn') items.push({ sys: 'abilityStart', ab, ctx: { p, src: u, abText: ab.src, no: G.cards[u].no } });
  for (const u of fieldUids(G, opp(p))) for (const ab of effectsOf(db, G.cards[u].no).abilities) if (ab.timing === 'endOfOppTurn') items.push({ sys: 'abilityStart', ab, ctx: { p: opp(p), src: u, abText: ab.src, no: G.cards[u].no } });
  G.queue.push(...items);
  runQueue(G, db);
}
function finishTurn(G, db) {
  expireMods(G, 'turnEnd');
  if (G.extraTurn === G.active) G.extraTurn = null; else G.active = opp(G.active);
  startTurn(G, db);
}
function placeLife(G, db) {
  for (let p = 0; p < 2; p++) {
    const P = G.players[p]; const n = def(G, db, P.leader).life || 5;
    const top = P.deck.splice(0, n);
    // 덱 맨 위 카드가 라이프 맨 아래
    for (const u of top) { G.cards[u].zone = 'life'; P.life.push({ uid: u, faceUp: false }); }
    ev(G, { t: 'life', p, delta: n });
  }
}

// ---------- 배틀 ----------
export function canAttack(G, db, uid) {
  const c = G.cards[uid]; const p = c.owner;
  if (G.phase !== 'main' || G.active !== p || G.pending || G.queue.length || G.battle) return false;
  if (G.turn <= 2) return false;
  if (c.rested) return false;
  const z = zoneOf(G, uid);
  if (z !== 'leader' && z !== 'chars') return false;
  if (hasKw(G, db, uid, 'cannotAttack')) return false;
  if (z === 'chars' && c.playedTurn === G.turn && !hasKw(G, db, uid, 'rush') && !hasKw(G, db, uid, 'rushCharacter')) return false;
  return true;
}
export function attackTargets(G, db, uid) {
  const c = G.cards[uid]; const O = G.players[opp(c.owner)];
  const onlyChars = c.playedTurn === G.turn && zoneOf(G, uid) === 'chars' && !hasKw(G, db, uid, 'rush') && hasKw(G, db, uid, 'rushCharacter');
  const list = onlyChars ? [] : [O.leader];
  for (const u of O.chars) if (G.cards[u].rested || hasKw(G, db, uid, 'canAttackActive')) list.push(u);
  return list;
}
function declareAttack(G, db, attacker, target) {
  const c = G.cards[attacker]; const p = c.owner;
  c.rested = true;
  G.battle = { attacker, target, p, counterPower: 0 };
  fireEvt(G, db, 'onRested', (e, x) => x === attacker);
  ev(G, { t: 'attack', attacker, target, p });
  log(G, `${nm(G, db, attacker)} → ${nm(G, db, target)} 어택!`, p);
  const items = [];
  for (const ab of effectsOf(db, c.no).abilities) if (ab.timing === 'whenAttacking' && !isNegated(G, attacker)) items.push({ sys: 'abilityStart', ab, ctx: { p, src: attacker, abText: ab.src, no: c.no } });
  for (const u of fieldUids(G, opp(p))) for (const ab of effectsOf(db, G.cards[u].no).abilities) if (ab.timing === 'onOppAttack') items.push({ sys: 'abilityStart', ab, ctx: { p: opp(p), src: u, abText: ab.src, no: G.cards[u].no } });
  items.push({ sys: 'blockStep' }, { sys: 'counterStep' }, { sys: 'damageStep' }, { sys: 'battleEnd' });
  G.queue.push(...items);
}
function blockers(G, db) {
  const B = G.battle; const d = opp(B.p);
  if (hasKw(G, db, B.attacker, 'unblockable')) return [];
  if (hasKw(G, db, B.attacker, 'blockerDisabled')) return [];
  return G.players[d].chars.filter(u => u !== B.target && !G.cards[u].rested && hasKw(G, db, u, 'blocker') && !hasKw(G, db, u, 'cannotBlock') && !hasKw(G, db, u, 'blockerDisabled'));
}
function blockStep(G, db) {
  const B = G.battle; if (!B || zoneOf(G, B.attacker) == null || !['leader', 'chars'].includes(zoneOf(G, B.attacker))) return;
  const opts = blockers(G, db);
  if (!opts.length) return;
  const d = opp(B.p);
  if (G.ai[d]) { const u = aiBlock(G, db, opts); if (u) doBlock(G, db, u); return; }
  G.pending = { type: 'block', p: d, options: opts, text: `블로커로 막을까요? (${nm(G, db, B.attacker)} 파워 ${power(G, db, B.attacker)})` };
  return 'wait';
}
function doBlock(G, db, u) {
  const B = G.battle; G.cards[u].rested = true; B.target = u; B.blocked = true;
  fireEvt(G, db, 'onBlockerUsed', (e, x, o) => sideOk(e, o, G.cards[u].owner));
  fireEvt(G, db, 'onRested', (e, x) => x === u);
  ev(G, { t: 'block', uid: u, attacker: B.attacker });
  log(G, `${nm(G, db, u)}(으)로 블록!`, G.cards[u].owner);
  const abs = effectsOf(db, G.cards[u].no).abilities.filter(ab => ab.timing === 'onBlock');
  for (const ab of abs.reverse()) fireAbility(G, db, u, ab, G.cards[u].owner);
}
function counterStep(G, db) {
  const B = G.battle; if (!B || !inBattle(G)) return;
  const d = opp(B.p);
  if (G.ai[d]) { aiCounter(G, db); return; }
  const P = G.players[d];
  const usable = P.hand.filter(u => { const c = def(G, db, u); return (c.type === 'character' && c.counter > 0) || (c.type === 'event' && hasTiming(db, c.no, 'counter') && costOf(G, db, u) <= P.donActive); });
  if (!usable.length) return;
  G.pending = { type: 'counter', p: d, options: usable, text: `카운터 스텝: ${nm(G, db, B.attacker)} ${power(G, db, B.attacker)} vs ${nm(G, db, B.target)} ${power(G, db, B.target)}` };
  return 'wait';
}
function hasTiming(db, no, t) { return effectsOf(db, no).abilities.some(a => a.timing === t); }
function inBattle(G) { const B = G.battle; return B && ['leader', 'chars'].includes(zoneOf(G, B.attacker)) && ['leader', 'chars'].includes(zoneOf(G, B.target)); }
function useCounter(G, db, d, u, target) {
  const P = G.players[d]; const c = def(G, db, u);
  const B = G.battle; target = target || B.target;
  if (c.type === 'character') {
    moveCard(G, db, u, 'trash');
    addMod(G, { kind: 'power', target, value: c.counter, duration: 'battle' });
    ev(G, { t: 'counter', uid: u, target, amount: c.counter, now: power(G, db, target) });
    log(G, `카운터 ${nm(G, db, u)} +${c.counter}`, d);
  } else {
    const k = costOf(G, db, u); P.donActive -= k; P.donRested += k;
    moveCard(G, db, u, 'trash');
    ev(G, { t: 'event', uid: u, p: d });
    fireEvt(G, db, 'onEventCardUsed', (e, x, o) => sideOk(e, o, d));
    for (const ab of effectsOf(db, c.no).abilities.filter(a => a.timing === 'counter').reverse()) fireAbility(G, db, u, ab, d);
  }
}
function damageStep(G, db) {
  const B = G.battle; if (!B || !inBattle(G)) { log(G, '배틀이 중단됨'); return; }
  const ap = power(G, db, B.attacker), tp = power(G, db, B.target);
  ev(G, { t: 'clash', attacker: B.attacker, target: B.target, ap, tp, win: ap >= tp });
  if (ap < tp) { log(G, `파워 ${ap} < ${tp}: 어택 실패`); return; }
  if (zoneOf(G, B.target) === 'leader') {
    const n = hasKw(G, db, B.attacker, 'doubleAttack') ? 2 : 1;
    const items = []; for (let i = 0; i < n; i++) items.push({ sys: 'damageLeader', p: opp(B.p), banish: hasKw(G, db, B.attacker, 'banish') });
    pushFront(G, items);
  } else koCard(G, db, B.target, 'battle', B.p);
}
function damageLeader(G, db, item) {
  const P = G.players[item.p];
  if (!P.life.length) { lose(G, item.p, '라이프 0장에서 리더가 대미지를 받았어요'); return; }
  const l = P.life[P.life.length - 1];
  ev(G, { t: 'damage', p: item.p });
  if (item.banish) { moveCard(G, db, l.uid, 'trash'); ev(G, { t: 'life', p: item.p, delta: -1 }); log(G, '배니시: 라이프가 트래시로', item.p); return; }
  const c = def(G, db, l.uid);
  const trig = effectsOf(db, c.no).abilities.filter(a => a.timing === 'trigger');
  if (c.trigger && trig.length) {
    if (item.answer === undefined) {
      if (G.ai[item.p]) item.answer = true;
      else { pushFront(G, [item]); G.pending = { type: 'trigger', p: item.p, uid: l.uid, text: `라이프에서 【트리거】 카드가 나왔어요: ${c.name}\n${c.trigger}\n발동할까요?` }; ev(G, { t: 'reveal', uid: l.uid }); return 'wait'; }
    }
    if (item.answer) {
      removeFromZone(G, l.uid); G.cards[l.uid].zone = 'limbo';
      ev(G, { t: 'life', p: item.p, delta: -1 }); ev(G, { t: 'trigger', uid: l.uid, p: item.p });
      log(G, `【트리거】 ${c.name} 발동`, item.p);
      const items = trig.map(ab => ({ sys: 'abilityStart', ab, ctx: { p: item.p, src: l.uid, abText: ab.src, no: c.no } }));
      items.push({ sys: 'trashLimbo', uid: l.uid });
      pushFront(G, items);
      return;
    }
  }
  moveCard(G, db, l.uid, 'hand'); ev(G, { t: 'life', p: item.p, delta: -1 });
  log(G, `${P.name}: 라이프 1장을 패로`, item.p);
  fireEvt(G, db, 'onLifeToHand', (e, u, o) => sideOk(e, o, item.p));
  const atk = G.battle?.attacker;
  fireEvt(G, db, 'onDamageDealt', (e, u, o) => o !== item.p && (e.who === 'this' ? u === atk : true));
}
function battleEnd(G, db) {
  expireMods(G, 'battle');
  ev(G, { t: 'battleEnd' });
  G.battle = null;
}

// ---------- 플레이어 액션 ----------
export function legalMain(G, db, p) {
  const out = { play: [], attack: [], activate: [], attachDon: G.players[p].donActive > 0 };
  if (G.phase !== 'main' || G.active !== p || G.pending || G.queue.length || G.battle) return out;
  const P = G.players[p];
  for (const u of P.hand) {
    const c = def(G, db, u);
    if (costOf(G, db, u) > P.donActive) continue;
    if (c.type === 'event' && !hasTiming(db, c.no, 'main')) continue;
    out.play.push(u);
  }
  for (const u of fieldUids(G, p)) {
    if (canAttack(G, db, u)) out.attack.push(u);
    effectsOf(db, G.cards[u].no).abilities.forEach((ab, i) => { if ((ab.timing === 'activateMain' || isManualEventTiming(ab.timing)) && canActivate(G, db, u, ab, p)) out.activate.push({ uid: u, i, event: ab.timing !== 'activateMain' }); });
  }
  return out;
}
function canActivate(G, db, uid, ab, p) {
  if (isNegated(G, uid)) return false;
  if (ab.oncePerTurn && G.used[abilityKey(uid, ab)] === G.turn) return false;
  if (ab.donReq && G.cards[uid].don < ab.donReq) return false;
  if (ab.cost && !canPay(G, db, ab.cost, { p, src: uid })) return false;
  if (ab.condition && evalCond(G, db, ab.condition, { p, src: uid }) === false) return false;
  return true;
}

export function apply(G, db, p, action) {
  G.events = [];
  if (G.winner !== null) return G;
  const P = G.players[p];
  const pend = G.pending;
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  switch (action.type) {
    case 'mulligan': {
      need(pend && pend.type === 'mulligan' && pend.p === p, '지금은 멀리건 차례가 아니에요');
      if (action.redraw) { for (const u of [...P.hand]) moveCard(G, db, u, 'deck'); shuffle(G, P.deck); drawN(G, db, p, 5, true); log(G, `${P.name}: 멀리건`, p); }
      P.mull = true; G.pending = null;
      const other = opp(p);
      if (!G.players[other].mull) { G.pending = { type: 'mulligan', p: other, text: '첫 패 5장을 다시 뽑을까요? (한 번만 가능)' }; }
      else { placeLife(G, db); G.active = G.first; startTurn(G, db); }
      break;
    }
    case 'play': {
      need(legalMain(G, db, p).play.includes(action.uid), '지금 낼 수 없는 카드예요');
      const c = def(G, db, action.uid); const k = costOf(G, db, action.uid);
      P.donActive -= k; P.donRested += k;
      if (c.type === 'character') {
        if (P.chars.length >= MAX_CHARS) {
          if (action.replace) moveCard(G, db, action.replace, 'trash');
          else if (G.ai[p]) moveCard(G, db, weakestChar(G, db, p), 'trash');
          else { P.donActive += k; P.donRested -= k; throw new Error('캐릭터는 5장까지예요. 트래시로 보낼 캐릭터를 replace 로 지정하세요'); }
        }
        moveCard(G, db, action.uid, 'chars');
        log(G, `${nm(G, db, action.uid)} 등장 (코스트 ${k})`, p);
        onCharEnter(G, db, action.uid, p);
      } else if (c.type === 'stage') {
        if (P.stage) moveCard(G, db, P.stage, 'trash');
        moveCard(G, db, action.uid, 'stage'); log(G, `스테이지 ${nm(G, db, action.uid)} 등장`, p);
        for (const ab of effectsOf(db, c.no).abilities.filter(a => a.timing === 'onPlay').reverse()) fireAbility(G, db, action.uid, ab, p);
      } else if (c.type === 'event') {
        moveCard(G, db, action.uid, 'trash');
        ev(G, { t: 'event', uid: action.uid, p });
        log(G, `이벤트 ${nm(G, db, action.uid)} 사용`, p);
        fireEvt(G, db, 'onEventCardUsed', (e, x, o) => sideOk(e, o, p));
        for (const ab of effectsOf(db, c.no).abilities.filter(a => a.timing === 'main').reverse()) fireAbility(G, db, action.uid, ab, p);
      }
      break;
    }
    case 'attachDon': {
      need(G.phase === 'main' && G.active === p && !pend && !G.battle, '지금은 두웅!!을 붙일 수 없어요');
      need(P.donActive > 0, '액티브 두웅!!이 없어요');
      need([P.leader, ...P.chars].includes(action.uid), '내 리더/캐릭터에만 붙일 수 있어요');
      const n = Math.min(action.n || 1, P.donActive);
      P.donActive -= n; G.cards[action.uid].don += n;
      ev(G, { t: 'attach', uid: action.uid, don: G.cards[action.uid].don, now: power(G, db, action.uid) });
      fireEvt(G, db, 'onDonAttached', (e, x, o) => o === p);
      break;
    }
    case 'activate': {
      const ab = effectsOf(db, G.cards[action.uid].no).abilities[action.i];
      need(ab && legalMain(G, db, p).activate.some(x => x.uid === action.uid && x.i === action.i), '지금 발동할 수 없어요');
      fireAbility(G, db, action.uid, ab, p);
      break;
    }
    case 'attack': {
      need(canAttack(G, db, action.uid) && G.cards[action.uid].owner === p, '어택할 수 없어요');
      need(attackTargets(G, db, action.uid).includes(action.target), '그 대상은 어택할 수 없어요 (상대 리더 또는 레스트 상태 캐릭터만)');
      declareAttack(G, db, action.uid, action.target);
      break;
    }
    case 'endTurn': {
      need(G.phase === 'main' && G.active === p && !pend && !G.queue.length && !G.battle, '지금은 턴을 끝낼 수 없어요');
      log(G, `${P.name}: 턴 종료`, p);
      endTurn(G, db);
      return G;
    }
    case 'block': {
      need(pend && pend.type === 'block' && pend.p === p, '블록 차례가 아니에요');
      G.pending = null;
      if (action.uid) { need(pend.options.includes(action.uid), '블록할 수 없는 카드'); doBlock(G, db, action.uid); }
      break;
    }
    case 'counter': {
      need(pend && pend.type === 'counter' && pend.p === p, '카운터 차례가 아니에요');
      if (!action.uid) { G.pending = null; break; }
      need(pend.options.includes(action.uid), '사용할 수 없는 카드');
      G.pending = null;
      G.queue.unshift({ sys: 'counterStep' });
      useCounter(G, db, p, action.uid, action.target);
      break;
    }
    case 'trigger': {
      need(pend && pend.type === 'trigger' && pend.p === p, '트리거 선택 차례가 아니에요');
      G.pending = null; G.queue[0].answer = !!action.use;
      break;
    }
    case 'yesno': {
      need(pend && pend.type === 'yesno' && pend.p === p, '질문이 없어요');
      G.pending = null;
      const it = G.queue[0];
      if (pend.key === 'opt') it.optAnswer = !!action.yes;
      else if (pend.key === 'stepOpt') it.optAnswer = !!action.yes;
      else if (pend.key === 'cond') it.condAnswer = !!action.yes;
      else if (pend.key === 'stepCond') it.condAnswer = !!action.yes;
      break;
    }
    case 'option': {
      need(pend && pend.type === 'option' && pend.p === p, '고를 차례가 아니에요');
      G.pending = null; G.queue[0].choice = Math.max(0, Math.min(pend.options.length - 1, action.index | 0));
      break;
    }
    case 'choose': {
      need(pend && ['target', 'search'].includes(pend.type) && pend.p === p, '고를 차례가 아니에요');
      const sel = (action.uids || []).filter(u => pend.options.includes(u));
      need(sel.length >= (pend.min || 0) && sel.length <= pend.max, `${pend.min}~${pend.max}장 골라야 해요`);
      G.pending = null; G.queue[0].sel = sel;
      break;
    }
    case 'manualDone': {
      need(pend && pend.type === 'manual' && pend.p === p, '수동 처리 중이 아니에요');
      G.pending = null; log(G, '수동 처리 완료', p);
      break;
    }
    case 'manual': {
      need(G.sandbox || (pend && pend.type === 'manual' && pend.p === p), '수동 도구는 효과 처리 중에만 쓸 수 있어요');
      manualOp(G, db, p, action);
      break;
    }
    case 'concede': lose(G, p, '항복'); return G;
    default: throw new Error('알 수 없는 액션 ' + action.type);
  }
  runQueue(G, db);
  return G;
}

// 수동 도구: 자동 처리 안 된 효과를 플레이어가 직접 처리
export const MANUAL_OPS = {
  draw: '덱에서 1장 드로우', ko: 'KO (트래시로)', trash: '트래시로 보내기', bounce: '패로 되돌리기', deckBottom: '덱 아래로', deckTop: '덱 위로',
  rest: '레스트로', activeSet: '액티브로', powerUp: '파워 +1000 (이번 턴)', powerDown: '파워 -1000 (이번 턴)',
  addDon: '두웅!! 1장 추가(액티브)', addDonRested: '두웅!! 1장 추가(레스트)', returnDon: '두웅!! 1장 되돌리기', attachDon: '레스트 두웅!! 1장 붙이기',
  lifeToHand: '라이프 1장 패로', deckTopToLife: '덱 위 1장 라이프로', handToLife: '패에서 라이프로', play: '등장시키기(코스트 없이)', handToTrash: '패에서 버리기', trashToHand: '트래시에서 패로',
};
function manualOp(G, db, p, a) {
  const P = G.players[p];
  const u = a.uid; const who = u ? G.cards[u].owner : p; const W = G.players[who];
  switch (a.op) {
    case 'draw': drawN(G, db, p, 1); break;
    case 'ko': koCard(G, db, u, 'effect'); break;
    case 'trash': case 'handToTrash': moveCard(G, db, u, 'trash'); break;
    case 'bounce': case 'trashToHand': moveCard(G, db, u, 'hand'); break;
    case 'deckBottom': moveCard(G, db, u, 'deck', { bottom: true }); break;
    case 'deckTop': moveCard(G, db, u, 'deck'); break;
    case 'rest': G.cards[u].rested = true; ev(G, { t: 'rest', uid: u }); break;
    case 'activeSet': G.cards[u].rested = false; ev(G, { t: 'active', uid: u }); break;
    case 'powerUp': case 'powerDown': { const v = a.op === 'powerUp' ? 1000 : -1000; addMod(G, { kind: 'power', target: u, value: v, duration: G.battle ? 'battle' : 'turn' }); ev(G, { t: 'power', uid: u, amount: v, now: power(G, db, u) }); break; }
    case 'addDon': case 'addDonRested': { const tp = G.players[a.side === 'opp' ? opp(p) : p]; if (tp.donDeck) { tp.donDeck--; a.op === 'addDon' ? tp.donActive++ : tp.donRested++; } break; }
    case 'returnDon': { const tp = G.players[a.side === 'opp' ? opp(p) : p]; if (tp.donRested) { tp.donRested--; tp.donDeck++; } else if (tp.donActive) { tp.donActive--; tp.donDeck++; } break; }
    case 'attachDon': if (P.donRested) { P.donRested--; G.cards[u].don++; } else if (P.donActive) { P.donActive--; G.cards[u].don++; } ev(G, { t: 'attach', uid: u, don: G.cards[u].don }); break;
    case 'lifeToHand': if (W.life.length) { moveCard(G, db, W.life[W.life.length - 1].uid, 'hand'); ev(G, { t: 'life', p: who, delta: -1 }); } break;
    case 'deckTopToLife': if (P.deck.length) { moveCard(G, db, P.deck[0], 'life'); ev(G, { t: 'life', p, delta: 1 }); } break;
    case 'handToLife': moveCard(G, db, u, 'life'); ev(G, { t: 'life', p: who, delta: 1 }); break;
    case 'play': { const c = def(G, db, u); if (c.type === 'stage') { if (W.stage) moveCard(G, db, W.stage, 'trash'); moveCard(G, db, u, 'stage'); } else if (c.type === 'character') { if (W.chars.length >= MAX_CHARS) moveCard(G, db, weakestChar(G, db, who), 'trash'); moveCard(G, db, u, 'chars'); onCharEnter(G, db, u, who); } break; }
  }
  log(G, `[수동] ${MANUAL_OPS[a.op] || a.op}${u ? ' ' + nm(G, db, u) : ''}`, p);
}


// ---------- 공개 뷰 (온라인 대전용: 상대 비공개 정보 숨김) ----------
export function viewFor(G, p) {
  const V = JSON.parse(JSON.stringify(G));
  const o = opp(p);
  V.players[o].hand = V.players[o].hand.map(() => 'hidden');
  V.players[o].deck = V.players[o].deck.map(() => 'hidden');
  V.players[p].deck = V.players[p].deck.map(() => 'hidden');
  for (const P of V.players) P.life = P.life.map(l => l.faceUp ? l : { uid: 'hidden', faceUp: false });
  for (const uid of Object.keys(V.cards)) {
    const c = V.cards[uid];
    const visible = ['chars', 'stage', 'trash', 'leader'].includes(c.zone) || (c.zone === 'hand' && c.owner === p) || G.players[c.owner].leader === uid;
    if (!visible) V.cards[uid] = { uid, owner: c.owner, zone: c.zone, hidden: true };
  }
  V.rngState = 0; V.queue = V.queue.length ? [{ hidden: true }] : [];
  if (V.pending && V.pending.type === 'search' && V.pending.p !== p) V.pending = { type: V.pending.type, p: V.pending.p, text: '상대가 선택 중' };
  return V;
}

// ---------- 간단 AI ----------
function aiBlock(G, db, opts) {
  const B = G.battle; const d = opp(B.p); const ap = power(G, db, B.attacker);
  if (zoneOf(G, B.target) !== 'leader') return null;
  const life = G.players[d].life.length;
  if (life > 2 && ap < power(G, db, B.target) + 2000) return null;
  const sorted = [...opts].sort((a, b) => costOf(G, db, a) - costOf(G, db, b));
  return life <= 2 || ap >= power(G, db, B.target) ? sorted[0] : null;
}
function aiCounter(G, db) {
  const B = G.battle; const d = opp(B.p); const P = G.players[d];
  const isLeader = zoneOf(G, B.target) === 'leader';
  const need = power(G, db, B.attacker) - power(G, db, B.target) + 1;
  if (need <= 0) return;
  const life = P.life.length;
  const worth = isLeader ? life <= 2 || (life <= 3 && P.hand.length >= 5) : costOf(G, db, B.target) >= 5;
  if (!worth) return;
  const cs = P.hand.filter(u => def(G, db, u).type === 'character' && def(G, db, u).counter > 0).sort((a, b) => def(G, db, a).counter - def(G, db, b).counter);
  let sum = 0; const use = [];
  for (const u of cs) { if (sum >= need) break; use.push(u); sum += def(G, db, u).counter; }
  if (sum < need) return;
  for (const u of use) useCounter(G, db, d, u, B.target);
}
export function aiTurnActions(G, db, p) {
  // 메인 페이즈에서 한 번에 하나의 액션 제안
  const P = G.players[p]; const L = legalMain(G, db, p);
  // 1) 캐릭터/스테이지/이벤트 내기 (비싼 것부터, 5장 꽉 차면 약한 것 교체 고려)
  const playable = L.play.filter(u => { const c = def(G, db, u); if (c.type === 'character' && P.chars.length >= MAX_CHARS) return costOf(G, db, u) > costOf(G, db, weakestChar(G, db, p)) + 1; if (c.type === 'stage' && P.stage) return false; return true; })
    .sort((a, b) => costOf(G, db, b) - costOf(G, db, a));
  // 이벤트는 대상이 있을 때만 (단순화: 상대 캐릭터 있거나 드로우/서치류)
  for (const u of playable) {
    const c = def(G, db, u);
    if (c.type === 'event') { const ab = effectsOf(db, c.no).abilities.find(a => a.timing === 'main'); if (!ab || (ab.steps || []).every(s => s.do === 'manual')) continue; if ((ab.steps || []).some(s => ['ko', 'rest', 'bounce', 'toDeckBottom'].includes(s.do)) && !G.players[opp(p)].chars.length) continue; }
    // 공격용 두웅!! 남기기: 코스트 낼 수 있으면 그냥 냄
    return { type: 'play', uid: u };
  }
  // 2) 기동 메인
  G.aiAct = G.aiAct || {};
  for (const x of L.activate) {
    if (x.event) continue;
    const ab = effectsOf(db, G.cards[x.uid].no).abilities[x.i];
    const key = x.uid + '|' + x.i + '|' + G.turn;
    if (G.aiAct[key]) continue;
    if ((ab.cost || []).some(s => s.do === 'manual')) continue;
    if ((ab.steps || []).some(s => s.do !== 'manual')) { G.aiAct[key] = 1; return { type: 'activate', uid: x.uid, i: x.i }; }
  }
  // 3) 두웅!! 붙이기: 리더 우선, 상대 리더 파워 넘기기
  if (P.donActive > 0 && G.turn > 2) {
    const O = G.players[opp(p)]; const olp = power(G, db, O.leader) ;
    const attackers = [P.leader, ...P.chars].filter(u => canAttack(G, db, u));
    for (const u of attackers.sort((a, b) => power(G, db, b) - power(G, db, a))) {
      const pw = power(G, db, u);
      const target = olp + 1000 * Math.min(2, Math.floor(O.hand.length / 2));
      if (pw < target) { const need = Math.ceil((target - pw) / 1000); return { type: 'attachDon', uid: u, n: Math.min(need, P.donActive) }; }
    }
    if (attackers.includes(P.leader)) return { type: 'attachDon', uid: P.leader, n: P.donActive };
  }
  // 4) 어택
  const atk = L.attack.sort((a, b) => power(G, db, b) - power(G, db, a));
  for (const u of atk) {
    const ts = attackTargets(G, db, u); const pw = power(G, db, u);
    const O = G.players[opp(p)];
    const koable = ts.filter(t => t !== O.leader && power(G, db, t) <= pw).sort((a, b) => costOf(G, db, b) - costOf(G, db, a));
    if (koable.length && costOf(G, db, koable[0]) >= 4) return { type: 'attack', uid: u, target: koable[0] };
    if (ts.includes(O.leader) && pw >= power(G, db, O.leader)) return { type: 'attack', uid: u, target: O.leader };
    if (koable.length) return { type: 'attack', uid: u, target: koable[0] };
  }
  return { type: 'endTurn' };
}
export function aiRespond(G, db, p) {
  const pend = G.pending; if (!pend || pend.p !== p) return null;
  switch (pend.type) {
    case 'mulligan': { const h = G.players[p].hand.map(u => def(G, db, u)); const low = h.filter(c => (c.cost || 0) <= 3 && c.type === 'character').length; return { type: 'mulligan', redraw: low < 2 }; }
    case 'block': { const u = aiBlock(G, db, pend.options); return { type: 'block', uid: u }; }
    case 'counter': return { type: 'counter', uid: null };
    case 'trigger': return { type: 'trigger', use: true };
    case 'yesno': return { type: 'yesno', yes: true };
    case 'target': case 'search': { const it = G.queue[0]; const sel = aiPickTargets(G, db, it?.a || { do: 'x' }, pend.options, pend.max, it?.ctx || { p }, p); return { type: 'choose', uids: sel.slice(0, Math.max(pend.min || 0, Math.min(pend.max, sel.length))) }; }
    case 'manual': return { type: 'manualDone' };
    case 'option': return { type: 'option', index: 0 };
  }
  return null;
}
// AI 한 수: 반응 or 메인 액션
export function aiStep(G, db, p) {
  if (G.winner !== null) return null;
  if (G.pending) return G.pending.p === p ? aiRespond(G, db, p) : null;
  if (G.active === p && G.phase === 'main' && !G.queue.length && !G.battle) return aiTurnActions(G, db, p);
  return null;
}
