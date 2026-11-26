// 앱: 라우터 + 카드 사전 + 덱 + 연습 대전 + 효과 시연 + 튜토리얼 + 온라인 대전
import * as E from '../engine/core.js?v=202611261856';
import { practiceStep } from '../engine/practice-ai.js?v=202611261856';
import { newOpening, applyOpening, openingView, HANDS } from '../engine/opening.js?v=202611261856';
import { drawOpening } from './opening.js?v=202611261856';
import { explainCard } from '../engine/explain.js?v=202611261856';
import { validateDeck } from '../engine/rules.js?v=202611261856';
import { Board, LocalMatch, imgSrc, imgBig } from './board.js?v=202611261856';
import { easySentence, glossify, tipsFor } from './easy.js?v=202611261856';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const leaderLabels = nos => (nos || []).map(no=>{const c=db.cards.get(no); return c ? `${c.name} (${c.no})` : '리더';});
const COLOR_KO = { red: '적', green: '녹', blue: '청', purple: '자', black: '흑', yellow: '황' };
const TYPE_KO = { leader: '리더', character: '캐릭터', event: '이벤트', stage: '스테이지' };
const dots = cs => cs.map(c => `<span class="dot c-${c}"></span>`).join('');
const getJSON = async (u, d) => { try { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw 0; return await r.json(); } catch { return d; } };

const db = { cards: new Map(), effects: {}, decks: [], glossary: {}, reg: {}, lessons: [] };
let current = null; // 현재 화면 정리 함수

async function boot() {
  const [cards, effects, decks, glossary, reg, lessons] = await Promise.all([
    getJSON('data/cards.json?v=202611261856', []), getJSON('data/effects.json?v=202611261856', {}), getJSON('data/decks.json?v=202611261856', []), getJSON('data/glossary.json?v=202611261856', {}), getJSON('data/regulation.json?v=202611261856', {}), getJSON('data/lessons.json?v=202611261856', []),
  ]);
  const ord = c => { const m = c.no.match(/^([A-Z]+)(\d+)-(\d+)/); if (!m) return [9, 0, 0]; const t = { OP: 0, EB: 1, ST: 2, PRB: 3, P: 4 }[m[1]] ?? 5; return [t, -(+m[2]), +m[3]]; };
  cards.sort((a, b) => { const x = ord(a), y = ord(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.no.localeCompare(b.no); });
  db.list = cards; db.cards = new Map(cards.map(c => [c.no, c])); db.effects = effects; db.decks = decks; db.glossary = glossary; db.reg = reg; db.lessons = lessons;
  db.bases = cards.filter(c => !c.parallel);
  const sz0 = localStorage.getItem('cardsize') || 'l'; if (sz0 !== 'm') document.body.classList.add('sz-' + sz0);
  // 용어/배지 툴팁: data-tip 속성에 마우스를 올리거나 탭하면 설명
  const tip = document.createElement('div'); tip.className = 'tipbox'; tip.style.display = 'none'; document.body.appendChild(tip);
  const showTip = (n, x, y) => { tip.textContent = n.dataset.tip; tip.style.display = ''; tip.style.left = Math.min(window.innerWidth - 300, x + 12) + 'px'; tip.style.top = (y + 16) + 'px'; };
  document.addEventListener('mouseover', e => { const n = e.target.closest('[data-tip]'); if (n && n.dataset.tip) showTip(n, e.clientX, e.clientY); else tip.style.display = 'none'; });
  document.addEventListener('touchstart', e => { const n = e.target.closest('[data-tip]'); if (n && n.dataset.tip) { const t = e.touches[0]; showTip(n, t.clientX, t.clientY); setTimeout(() => tip.style.display = 'none', 2500); } }, { passive: true });
  window.addEventListener('hashchange', route);
  route();
}

function setNav(key) { document.querySelectorAll('.top nav a').forEach(a => a.classList.toggle('on', a.dataset.k === key)); }
function route() {
  if (current && current.cleanup) current.cleanup(); current = null;
  document.querySelectorAll('.coach,.menu,.modal-bg,.flyer,.float,svg.arrow').forEach(n => n.remove());
  const h = location.hash.slice(2) || 'home';
  const [page, ...rest] = h.split('/');
  const arg = decodeURIComponent(rest.join('/'));
  const main = $('main');
  window.scrollTo(0, 0);
  ({ home: pageHome, cards: pageCards, decks: pageDecks, deck: pageDeck, play: pagePlay, learn: pageLearn, lesson: pageLesson, online: pageOnline, rules: pageRules }[page] || pageHome)(main, arg);
}

// ---------------- 홈 ----------------
function pageHome(main) {
  setNav('home');
  const covs = Object.values(db.effects).map(e => e.coverage ?? 0);
  const full = covs.filter(x => x >= 0.999).length;
  main.innerHTML = `
    <h1>원피스 카드게임 한글판 아카데미</h1>
    <p class="mut">한글 카드 문장을 쉬운 말과 그래픽으로 풀어 보면서, 모의 게임으로 직접 배워요. 오들리즈 내부용.</p>
    <div class="tiles" style="margin:18px 0">
      <a class="tile" href="#/learn"><h3>1. 튜토리얼</h3><div class="mut">규칙 기초부터 상황 퍼즐까지 단계별 레슨</div></a>
      <a class="tile" href="#/cards"><h3>2. 카드 사전</h3><div class="mut">한글판 ${db.list.length.toLocaleString()}장 · 효과 풀이 · 효과 시연</div></a>
      <a class="tile" href="#/decks"><h3>3. 덱</h3><div class="mut">공식 추천 덱 · 대회 덱 · 스타트 덱 ${db.decks.length}개</div></a>
      <a class="tile" href="#/play"><h3>4. 연습 대전</h3><div class="mut">AI와 실전처럼. 효과가 나올 때마다 해설</div></a>
      <a class="tile" href="#/online"><h3>5. 사람 vs 사람</h3><div class="mut">방 코드로 직원끼리 온라인 대전</div></a>
      <a class="tile" href="#/rules"><h3>규칙 · 용어</h3><div class="mut">한국 시즌 레귤레이션, 용어 사전</div></a>
    </div>
    <h2>데이터 현황</h2>
    <table class="simple" style="max-width:640px">
      <tr><td>한글판 카드</td><td>${db.list.length.toLocaleString()}장 (기본 ${db.bases.length.toLocaleString()}종 + 패러렐)</td></tr>
      <tr><td>효과 구조화</td><td>${Object.keys(db.effects).length.toLocaleString()}종 · 완전 자동 처리 ${full.toLocaleString()}종 (미지원 효과는 적용하지 않음)</td></tr>
      <tr><td>덱</td><td>${db.decks.length}개</td></tr>
      <tr><td>레귤레이션</td><td>${esc(db.reg.name || '')} · 금지 ${db.reg.banned?.length || 0}종 · 금지 페어 ${db.reg.pairs?.length || 0}쌍</td></tr>
    </table>`;
}

// ---------------- 카드 사전 ----------------
const cardState = { q: '', color: '', type: '', cost: '', set: '', page: 0, auto: '', base: '1' };
function pageCards(main, arg) {
  setNav('cards');
  const sets = [...new Set(db.list.map(c => c.set))];
  main.innerHTML = `<h1>카드 사전</h1>
    <div class="filters">
      <input id="q" placeholder="이름, 번호, 특징, 효과 문장 검색" style="flex:1 1 260px" value="${esc(cardState.q)}">
      <select id="color"><option value="">모든 색</option>${Object.entries(COLOR_KO).map(([k, v]) => `<option value="${k}">${v}색</option>`).join('')}</select>
      <select id="type"><option value="">모든 종류</option>${Object.entries(TYPE_KO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select id="cost"><option value="">코스트</option>${[...Array(11).keys()].map(i => `<option>${i}</option>`).join('')}</select>
      <select id="set" style="max-width:240px"><option value="">모든 상품</option>${sets.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <select id="auto"><option value="">자동 처리 전체</option><option value="full">완전 자동</option><option value="part">미지원 부분 있음</option></select>
      <select id="base"><option value="1">기본 카드만</option><option value="">패러렐 포함</option></select>
    </div>
    <div class="mut" id="cnt"></div><div class="grid" id="grid" style="margin-top:10px"></div><div class="pager" id="pager"></div>`;
  for (const k of ['color', 'type', 'cost', 'set', 'auto', 'base']) { $('#' + k).value = cardState[k]; $('#' + k).onchange = e => { cardState[k] = e.target.value; cardState.page = 0; draw(); }; }
  let t; $('#q').oninput = e => { clearTimeout(t); t = setTimeout(() => { cardState.q = e.target.value.trim(); cardState.page = 0; draw(); }, 200); };
  function draw() {
    const q = cardState.q.toLowerCase();
    const list = db.list.filter(c => {
      if (cardState.base && c.parallel) return false;
      if (cardState.color && !c.colors.includes(cardState.color)) return false;
      if (cardState.type && c.type !== cardState.type) return false;
      if (cardState.cost !== '' && String(c.cost) !== cardState.cost) return false;
      if (cardState.set && c.set !== cardState.set) return false;
      if (cardState.auto) { const cov = E.effectsOf(db, c.no).coverage ?? 0; if (cardState.auto === 'full' ? cov < 0.999 : cov >= 0.999) return false; }
      if (q && !(c.name.toLowerCase().includes(q) || c.no.toLowerCase().includes(q) || c.traits.join(' ').includes(q) || c.text.includes(q) || (c.trigger || '').includes(q))) return false;
      return true;
    });
    const per = 60, pages = Math.ceil(list.length / per);
    $('#cnt').textContent = `${list.length.toLocaleString()}장`;
    $('#grid').innerHTML = list.slice(cardState.page * per, (cardState.page + 1) * per).map(c => {
      const cov = E.effectsOf(db, c.no).coverage ?? 0;
      return `<div class="cthumb" data-no="${c.no}"><img loading="lazy" src="${imgSrc(c)}" data-src2="${c.src}"><div class="cov" style="color:${cov >= .999 ? 'var(--good)' : 'var(--acc)'}">${cov >= .999 ? '자동' : '미지원 부분 있음'}</div><div class="lab">${dots(c.colors)}${esc(c.name)}<br><span class="mut">${c.no}</span></div></div>`;
    }).join('');
    $('#grid').querySelectorAll('img[data-src2]').forEach(im => im.onerror = () => { im.onerror = null; im.src = im.dataset.src2; });
    $('#pager').innerHTML = pages > 1 ? `<button ${cardState.page ? '' : 'disabled'} id="pv">이전</button><span class="mut" style="align-self:center">${cardState.page + 1} / ${pages}</span><button ${cardState.page < pages - 1 ? '' : 'disabled'} id="nx">다음</button>` : '';
    if ($('#pv')) $('#pv').onclick = () => { cardState.page--; draw(); window.scrollTo(0, 0); };
    if ($('#nx')) $('#nx').onclick = () => { cardState.page++; draw(); window.scrollTo(0, 0); };
  }
  $('#grid').onclick = e => { const n = e.target.closest('[data-no]'); if (n) showCard(n.dataset.no); };
  draw();
  if (arg) showCard(arg);
}

function highlightText(t) {
  return esc(t).replace(/【[^】]+】/g, m => `<span class="kwh">${m}</span>`).replace(/《[^》]+》/g, m => `<b style="color:#9fd3ff">${m}</b>`).replace(/「[^」]+」/g, m => `<b style="color:#ffd59f">${m}</b>`);
}
const GLOSS_KEYS = ['두웅!!', '레스트', '액티브', '카운터', '트리거', '블로커', '속공', '더블 어택', '배니시', 'KO', '라이프', '리더', '스테이지', '특징', '등장 시', '기동: 메인', '어택 시', '턴 1회', 'KO 시', '블록 시', '트래시', '패', '코스트', '파워'];
export function showCard(no) {
  const c = db.cards.get(no); if (!c) return;
  let ex; try { ex = explainCard(no, db.effects, db.list); } catch (e) { ex = { keywords: [], abilities: [], unparsed: [] }; }
  const txt = c.text + (c.trigger ? '\n' + c.trigger : '');
  const gl = GLOSS_KEYS.filter(k => txt.includes(k) || (k === '두웅!!' && /두웅/.test(txt))).filter(k => db.glossary[k]);
  const decks = db.decks.filter(d => d.leader === c.base || d.cards.some(x => x.no === c.base)).slice(0, 8);
  const banned = db.reg.banned?.includes(c.base);
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><button class="x ghost">닫기</button>
    <div class="detail"><div><img class="big" src="${imgBig(c)}" data-src2="${c.src}"><div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="pri demo">효과 시연 보기</button></div></div>
    <div><h1 style="margin-bottom:4px">${esc(c.name)} ${banned ? '<span class="badge no">한국 금지 카드</span>' : ''}</h1><div class="mut">${c.no} · ${esc(c.set)}</div>
      <div class="kv"><div>종류</div><div>${TYPE_KO[c.type]} ${dots(c.colors)}</div>${c.type === 'leader' ? `<div>라이프</div><div>${c.life}</div>` : `<div>코스트</div><div>${c.cost ?? '-'}</div>`}<div>파워</div><div>${c.power ?? '-'}</div><div>카운터</div><div>${c.counter ? '+' + c.counter : '없음'}</div><div>특징</div><div>${c.traits.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div><div>속성</div><div>${esc(c.attr.join(', ') || '-')}</div></div>
      <h2>카드 원문</h2><div class="orig">${txt.trim() ? highlightText(txt) : '<span class="mut">효과 없음 (바닐라 카드)</span>'}</div>
      ${ex.keywords?.length ? `<h2>키워드</h2>${ex.keywords.map(k => `<div class="ab"><b class="kwh">【${esc(String(k.name).replace(/[【】\[\]]/g, ''))}】</b> ${esc(k.text)}</div>`).join('')}` : ''}
      ${ex.abilities?.length ? `<h2>쉽게 풀어보기</h2>${ex.abilities.map((a, k) => `<div class="ab"><div class="sent">${glossify(easySentence(a.sentence), db.glossary)}</div>${a.steps.map(s => `<div class="step"><div class="l">${esc(s.label)}</div><div>${glossify(easySentence(s.text), db.glossary)}</div></div>`).join('')}${a.manual ? '<div class="warn">이 부분은 자동 판정을 지원하지 않아 대전에서 적용되지 않을 수 있어요</div>' : ''}</div>`).join('')}` : ''}
      ${(() => { const e2 = E.effectsOf(db, no); const tips = [...new Set(e2.abilities.flatMap(a => tipsFor(a, [])).concat(tipsFor(null, e2.keywords || [])))]; return tips.length ? `<h2>왜 중요해요?</h2>${tips.map(t => `<div class="step"><div class="l">팁</div><div>${esc(t)}</div></div>`).join('')}` : ''; })()}
      ${ex.unparsed?.length ? `<div class="warn">자동 해석 안 된 문장: ${ex.unparsed.map(esc).join(' / ')}</div>` : ''}
      ${gl.length ? `<h2>나오는 용어</h2>${gl.map(k => `<div class="step"><div class="l">${esc(k)}</div><div>${esc(db.glossary[k])}</div></div>`).join('')}` : ''}
      ${decks.length ? `<h2>이 카드가 들어간 덱</h2>${decks.map(d => `<a class="chip" href="#/deck/${encodeURIComponent(d.id)}">${esc(d.name)}</a>`).join('')}` : ''}
    </div></div></div>`;
  bg.querySelector('img[data-src2]').onerror = function () { this.onerror = null; this.src = this.dataset.src2; };
  bg.onclick = e => { if (e.target === bg || e.target.closest('.x')) bg.remove(); if (e.target.closest('a')) bg.remove(); };
  bg.querySelector('.demo').onclick = () => { bg.remove(); runDemo(no); };
  document.body.appendChild(bg);
}

// ---------------- 효과 시연 ----------------
function vanilla(costs, colorPref) {
  const out = [];
  for (const k of costs) {
    const c = db.bases.find(x => x.type === 'character' && !x.text && x.cost === k && (!colorPref || x.colors.includes(colorPref))) || db.bases.find(x => x.type === 'character' && !x.text && x.cost === k) || db.bases.find(x => x.type === 'character' && x.cost === k);
    if (c) out.push(c.no);
  }
  return out;
}
function sameTrait(c, n, type = 'character', exclude) {
  const tr = c.traits[0];
  const pool = db.bases.filter(x => x.type === type && x.no !== exclude && x.traits.includes(tr) && x.colors.some(k => c.colors.includes(k)));
  const out = []; for (let i = 0; i < n && pool.length; i++) out.push(pool[i % pool.length].no); return out;
}
function leaderFor(c) {
  if (c.type === 'leader') return c.no;
  const L = db.bases.filter(x => x.type === 'leader' && c.colors.some(k => x.colors.includes(k)));
  return (L.find(x => x.traits.some(t => c.traits.includes(t))) || L[0] || db.bases.find(x => x.type === 'leader')).no;
}
export function buildDemo(no) {
  const c = db.cards.get(no); const eff = E.effectsOf(db, no);
  const timings = eff.abilities.map(a => a.timing);
  const has = t => timings.includes(t);
  const ab = i => eff.abilities[i];
  const color = c.colors[0];
  const myChars = sameTrait(c, 2, 'character', c.base).map(n => ({ no: n }));
  const deck = [...sameTrait(c, 10, 'character', c.base), ...vanilla([1, 2, 3, 4, 5], color)];
  while (deck.length < 20) deck.push(...vanilla([2, 3, 4], color));
  const oppChars = vanilla([2, 4, 6], null).map((n, k) => ({ no: n, rested: k !== 1 }));
  const me = { leader: leaderFor(c), chars: myChars, hand: vanilla([2, 4], color), deck, life: 4, trash: sameTrait(c, 3, 'character', c.base), donActive: 6, donRested: 0, donDeck: 4 };
  const op = { leader: db.bases.find(x => x.type === 'leader' && !x.colors.includes(color))?.no || 'ST01-001', chars: oppChars, hand: vanilla([1, 2, 3, 4], null), life: 4, donActive: 4, donDeck: 6 };
  const script = []; let active = 0; let note = '';
  const idx = t => timings.indexOf(t);
  if (c.type === 'leader') {
    me.leader = c.no;
    if (has('activateMain')) { me.leaderDon = ab(idx('activateMain')).donReq || 0; script.push({ p: 0, a: 'activate', i: idx('activateMain'), who: 'leader' }); note = '리더의 기동 효과를 발동해요'; }
    else if (has('whenAttacking')) { me.leaderDon = ab(idx('whenAttacking')).donReq || 0; script.push({ p: 0, a: 'attackLeader', who: 'leader' }); note = '리더로 어택하면 효과가 발동해요'; }
    else if (has('onOppAttack') || has('static')) { active = 1; op.leaderDon = 2; script.push({ p: 1, a: 'oppAttackLeader' }); note = '상대 턴에 상대가 어택해 올 때를 보여줘요'; }
    else if (has('endOfYourTurn')) { script.push({ p: 0, a: 'endTurn' }); note = '내 턴이 끝날 때 효과가 발동해요'; }
    else { script.push({ p: 0, a: 'attackLeader', who: 'leader' }); }
  } else if (c.type === 'event') {
    if (has('counter') && !has('main')) { active = 1; op.leaderDon = 2; me.hand.unshift(c.no); script.push({ p: 1, a: 'oppAttackLeader' }, { p: 0, a: 'counterWith', no: c.no }); note = '상대 어택을 막기 위해 카운터 이벤트를 써요'; }
    else { me.hand.unshift(c.no); script.push({ p: 0, a: 'play', no: c.no }); note = '이벤트를 패에서 사용해요'; }
  } else if (has('trigger') && !has('onPlay') && !has('activateMain')) {
    active = 1; op.leaderDon = 2; me.life = [...Array(3).fill(vanilla([2], color)[0]), c.no];
    script.push({ p: 1, a: 'oppAttackLeader' }); note = '대미지를 받아 라이프에서 이 카드가 나오면 【트리거】를 발동할 수 있어요';
  } else if (has('onPlay') || c.type === 'stage') {
    me.hand.unshift(c.no); script.push({ p: 0, a: 'play', no: c.no }); note = '패에서 내면(등장) 효과가 발동해요';
    if (has('activateMain')) script.push({ p: 0, a: 'activate', i: idx('activateMain'), who: c.no });
  } else if (has('activateMain')) {
    me.chars.unshift({ no: c.no, don: ab(idx('activateMain')).donReq || 0 }); script.push({ p: 0, a: 'activate', i: idx('activateMain'), who: c.no }); note = '필드에 있는 이 카드의 기동 효과를 직접 발동해요';
  } else if (has('whenAttacking')) {
    me.chars.unshift({ no: c.no, don: ab(idx('whenAttacking')).donReq || 0 }); script.push({ p: 0, a: 'attackLeader', who: c.no }); note = '이 캐릭터로 어택하면 효과가 발동해요';
  } else if (has('onRested') || has('onDamageDealt')) {
    me.chars.unshift({ no: c.no }); script.push({ p: 0, a: 'attackLeader', who: c.no }); note = has('onRested') ? '이 캐릭터가 레스트되면(어택하면) 효과가 발동해요' : '이 캐릭터의 어택으로 상대 라이프에 대미지를 주면 효과가 발동해요';
  } else if (has('onBattleKO')) {
    me.chars.unshift({ no: c.no, don: 2 }); script.push({ p: 0, a: 'attackChar', who: c.no }); note = '이 캐릭터가 배틀로 상대 캐릭터를 KO 시키면 효과가 발동해요';
  } else if (has('onKO') || has('onKOByOppEffect')) {
    me.chars.unshift({ no: c.no, rested: true }); active = 1; op.leaderDon = 3; script.push({ p: 1, a: 'oppAttackChar', no: c.no }); note = '상대가 이 캐릭터를 KO 시키면 효과가 발동해요';
  } else if (has('onBlock') || (eff.keywords || []).includes('blocker')) {
    me.chars.unshift({ no: c.no }); active = 1; op.leaderDon = 2; script.push({ p: 1, a: 'oppAttackLeader' }, { p: 0, a: 'blockWith', no: c.no }); note = '상대 어택을 이 캐릭터로 막아요 (블로커)';
  } else if (has('onOppAttack')) {
    me.chars.unshift({ no: c.no }); active = 1; op.leaderDon = 2; script.push({ p: 1, a: 'oppAttackLeader' }); note = '상대가 어택할 때 효과가 발동해요';
  } else if (has('endOfYourTurn')) {
    me.chars.unshift({ no: c.no }); script.push({ p: 0, a: 'endTurn' }); note = '내 턴이 끝날 때 효과가 발동해요';
  } else if ((eff.keywords || []).includes('rush')) {
    me.hand.unshift(c.no); script.push({ p: 0, a: 'play', no: c.no }, { p: 0, a: 'attackLeader', who: c.no }); note = '【속공】이라 나온 턴에 바로 어택할 수 있어요';
  } else {
    me.hand.unshift(c.no); script.push({ p: 0, a: 'play', no: c.no }); note = c.text ? '필드에 있는 동안 계속 적용되는 효과예요. 파워/키워드 표시를 확인해 보세요' : '효과 없는 카드예요. 파워와 코스트로 싸워요';
  }
  const G = E.createScenario({ players: [me, op], active, turn: active ? 4 : 3, ai: [false, false], sandbox: false }, db);
  // 리더 두웅!! 반영
  if (me.leaderDon) G.cards[G.players[0].leader].don = me.leaderDon;
  if (op.leaderDon) G.cards[G.players[1].leader].don = op.leaderDon;
  return { G, script, note };
}
async function runDemo(no) {
  const c = db.cards.get(no);
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" style="max-width:1400px"><button class="x ghost">닫기</button><h2 style="margin-top:0">효과 시연: ${esc(c.name)} <span class="mut" style="font-size:13px">${c.no}</span></h2><div class="mut nt"></div><div class="bd" style="margin-top:10px"></div><div style="margin-top:10px;display:flex;gap:8px"><button class="pri again">다시 보기</button><button class="info">카드 설명</button></div></div>`;
  document.body.appendChild(bg);
  let stop = false; let board;
  const close = () => { stop = true; board && board.destroy(); bg.remove(); };
  bg.onclick = e => { if (e.target === bg || e.target.closest('.x')) close(); };
  bg.querySelector('.info').onclick = () => { close(); showCard(no); };
  const play = async () => {
    stop = false;
    const { G, script, note } = buildDemo(no);
    bg.querySelector('.nt').textContent = note;
    board && board.destroy();
    board = new Board(bg.querySelector('.bd'), db, { me: 0, mode:'demo', onCardInfo: n => { close(); showCard(n); }, send: async () => { } });
    board.o.slow = true;
    await board.update(G, []);
    const step = async (p, a) => { if (stop) return; try { E.apply(G, db, p, a); } catch (e) { board.toast(e.message); } const ev = G.events; G.events = []; await board.update(G, ev); };
    const settle = async () => { // 남은 선택은 AI 판단으로 자동 진행
      for (let k = 0; k < 30 && G.pending && !stop; k++) { const p = G.pending.p; const a = E.aiRespond(G, db, p); if (!a) break; await new Promise(r => setTimeout(r, 500)); await step(p, a); }
    };
    const uidOf = (no2, p = 0) => { if (no2 === 'leader') return G.players[p].leader; return Object.values(G.cards).find(x => x.owner === p && x.no === no2 && x.zone !== 'deck' && x.zone !== 'life')?.uid; };
    for (const s of script) {
      if (stop) return;
      await new Promise(r => setTimeout(r, 700));
      if (s.a === 'play') await step(0, { type: 'play', uid: uidOf(s.no) });
      else if (s.a === 'activate') await step(0, { type: 'activate', uid: uidOf(s.who), i: s.i });
      else if (s.a === 'attackLeader') await step(0, { type: 'attack', uid: uidOf(s.who), target: G.players[1].leader });
      else if (s.a === 'endTurn') await step(0, { type: 'endTurn' });
      else if (s.a === 'attackChar') { const t = G.players[1].chars.find(u => G.cards[u].rested); if (t) await step(0, { type: 'attack', uid: uidOf(s.who), target: t }); }
      else if (s.a === 'oppAttackLeader') { await step(1, { type: 'attack', uid: G.players[1].leader, target: G.players[0].leader }); }
      else if (s.a === 'oppAttackChar') await step(1, { type: 'attack', uid: G.players[1].leader, target: uidOf(s.no) });
      else if (s.a === 'counterWith') { if (G.pending?.type === 'block') await step(0, { type: 'block', uid: null }); if (G.pending?.type === 'counter') await step(0, { type: 'counter', uid: uidOf(s.no) }); }
      else if (s.a === 'blockWith') { if (G.pending?.type === 'block') await step(0, { type: 'block', uid: uidOf(s.no) }); }
      await settle();
    }
    await settle();
  };
  bg.querySelector('.again').onclick = play;
  play();
}

// ---------------- 덱 ----------------
const deckState = { cat: '' };
function deckLegal(d) { return d.krLegal !== false; }
function pageDecks(main) {
  setNav('decks');
  const cats = { recommended: '공식 추천', tournament: '대회 입상', starter: '스타트 덱' };
  main.innerHTML = `<h1>덱</h1><div class="filters">${['', ...Object.keys(cats)].map(k => `<button class="${deckState.cat === k ? 'pri' : ''}" data-c="${k}">${k ? cats[k] : '전체'}</button>`).join('')}<label class="mut"><input type="checkbox" id="lg" ${deckState.legal ? 'checked' : ''}> 한글판으로 짤 수 있는 덱만</label></div><div class="tiles" id="dl"></div>`;
  main.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { deckState.cat = b.dataset.c; pageDecks(main); });
  $('#lg').onchange = e => { deckState.legal = e.target.checked; pageDecks(main); };
  const list = db.decks.filter(d => (!deckState.cat || d.category === deckState.cat) && (!deckState.legal || deckLegal(d)));
  $('#dl').innerHTML = list.map(d => { const L = db.cards.get(d.leader); return `<a class="tile" href="#/deck/${encodeURIComponent(d.id)}" style="display:flex;gap:12px"><img src="${L ? imgSrc(L) : ''}" style="width:70px;border-radius:6px"><div><h3>${esc(d.name)}</h3><div class="mut" style="font-size:12px">${cats[d.category] || ''}${d.category === 'tournament' ? ' · ' + esc(d.event || '') : ''} ${d.date ? '· ' + esc(d.date) : ''}</div><div style="margin-top:6px">${L ? dots(L.colors) : ''} <span class="badge ${deckLegal(d) ? 'ok' : 'no'}">${deckLegal(d) ? '한글판 가능' : '한글판 미발매 포함'}</span> ${d.placing ? `<span class="badge">${esc(d.placing)}</span>` : ''}</div></div></a>`; }).join('') || '<p class="mut">덱 데이터를 불러오는 중이거나 없어요.</p>';
}
function pageDeck(main, id) {
  setNav('decks');
  const d = db.decks.find(x => x.id === id); if (!d) { main.innerHTML = '<p>덱을 찾을 수 없어요</p>'; return; }
  const L = db.cards.get(d.leader);
  const rows = d.cards.map(x => ({ ...x, c: db.cards.get(x.no) })).filter(x => x.c);
  const curve = Array(11).fill(0); rows.forEach(x => { if (x.c.cost != null) curve[Math.min(10, x.c.cost)] += x.count; });
  const mx = Math.max(...curve, 1);
  const grp = t => rows.filter(x => x.c.type === t).sort((a, b) => (a.c.cost ?? 0) - (b.c.cost ?? 0));
  main.innerHTML = `<a href="#/decks" class="mut">← 덱 목록</a><h1>${esc(d.name)}</h1>
    <div class="detail"><div><img class="big" src="${L ? imgBig(L) : ''}"><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a href="#/play/${encodeURIComponent(d.id)}"><button class="pri">이 덱으로 연습 대전</button></a></div></div>
    <div><div class="mut">${esc(d.event || d.source || '')} ${d.placing ? '· ' + esc(d.placing) : ''} ${d.date ? '· ' + esc(d.date) : ''} ${d.url ? `· <a href="${esc(d.url)}" target="_blank">출처</a>` : ''}</div>
      <span class="badge ${deckLegal(d) ? 'ok' : 'no'}">${deckLegal(d) ? '한글판으로 구성 가능' : '한글판 미발매: ' + esc((d.missingInKR || []).join(', '))}</span>
      ${d.concept ? `<h2>덱 컨셉</h2><p>${esc(d.concept)}</p>` : ''}
      ${d.mulligan ? `<h2>첫 패 팁</h2><p>${esc(d.mulligan)}</p>` : ''}
      ${d.keyCards?.length ? `<h2>핵심 카드</h2><div class="decklist">${d.keyCards.map(n => { const c = db.cards.get(n); return c ? `<div class="cthumb" data-no="${n}"><img src="${imgSrc(c)}"><div class="lab">${esc(c.name)}</div></div>` : ''; }).join('')}</div>` : ''}
      <h2>코스트 분포</h2><div style="display:flex;gap:6px;align-items:flex-end;height:90px">${curve.map((v, k) => `<div style="flex:1;text-align:center;font-size:11px"><div style="height:${v / mx * 64}px;background:var(--acc2);border-radius:4px 4px 0 0;opacity:${v ? 1 : .2}"></div>${k}<div class="mut">${v || ''}</div></div>`).join('')}</div>
    </div></div>
    ${['character', 'event', 'stage'].map(t => grp(t).length ? `<h2>${TYPE_KO[t]} (${grp(t).reduce((s, x) => s + x.count, 0)})</h2><div class="decklist">${grp(t).map(x => `<div class="cthumb" data-no="${x.no}"><img loading="lazy" src="${imgSrc(x.c)}"><div class="n">×${x.count}</div><div class="lab">${esc(x.c.name)}</div></div>`).join('')}</div>` : '').join('')}`;
  main.onclick = e => { const n = e.target.closest('[data-no]'); if (n) showCard(n.dataset.no); };
}

// ---------------- 자동 덱 (리더 기준) ----------------
export function autoDeck(leaderNo, seed = 1) {
  const L = db.cards.get(leaderNo);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const banned = new Set(db.reg.banned || []);
  const pool = db.bases.filter(c => c.type !== 'leader' && !(L.base==='OP13-079' && c.type==='event' && c.cost>=2) && !banned.has(c.no) && c.colors.length && c.colors.every(k => L.colors.includes(k)));
  const score = c => (c.traits.some(t => L.traits.includes(t)) ? 3 : 0) + (c.counter ? 1 : 0) + (E.effectsOf(db, c.no).coverage ?? 0) + rnd();
  const want = { 1: 2, 2: 3, 3: 2, 4: 2, 5: 2, 6: 1, 7: 1, 8: 0, 9: 0, 10: 0 };
  const picked = [];
  for (const [cost, n] of Object.entries(want)) picked.push(...pool.filter(c => c.type === 'character' && c.cost === +cost).sort((a, b) => score(b) - score(a)).slice(0, n));
  picked.push(...pool.filter(c => c.type === 'event').sort((a, b) => score(b) - score(a)).slice(0, 2));
  const cards = []; let total = 0;
  for (const c of picked) { if (total >= 50) break; const k = Math.min(4, 50 - total); cards.push({ no: c.no, count: k }); total += k; }
  const rest = pool.filter(c => c.type === 'character' && !picked.includes(c)).sort((a, b) => score(b) - score(a));
  while (total < 50 && rest.length) { const c = rest.shift(); const k = Math.min(4, 50 - total); cards.push({ no: c.no, count: k }); total += k; }
  return { id: 'auto-' + leaderNo, name: `${L.name} (자동 구성)`, leader: leaderNo, cards, category: 'auto' };
}

// ---------------- 연습 대전 ----------------
function deckOptions(sel) {
  const groups = { recommended: '공식 추천', tournament: '대회 입상', starter: '스타트 덱' };
  let h = '';
  for (const [k, v] of Object.entries(groups)) { const ds = db.decks.filter(d => d.category === k && deckLegal(d)); if (ds.length) h += `<optgroup label="${v}">${ds.map(d => `<option value="${esc(d.id)}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</optgroup>`; }
  const leaders = db.bases.filter(c => c.type === 'leader');
  h += `<optgroup label="리더 골라서 자동 구성">${leaders.map(c => `<option value="auto:${c.no}">${esc(c.name)} ${c.colors.map(k => COLOR_KO[k]).join('')} (${c.no})</option>`).join('')}</optgroup>`;
  return h;
}
export function getDeck(v) { if (!v) return null; if (v.startsWith('auto:')) return autoDeck(v.slice(5), 7); return db.decks.find(d => d.id === v); }
function defaultDeckId(i = 0) { const ds = db.decks.filter(d => deckLegal(d)); return ds.length ? ds[i % ds.length].id : 'auto:' + (db.bases.filter(c => c.type === 'leader')[i]?.no); }
function pagePlay(main, arg) {
  setNav('play');
  main.innerHTML = `<h1>연습 대전 (AI)</h1><div class="filters">
    <label>내 덱 <select id="d0" style="max-width:300px">${deckOptions(arg || defaultDeckId(0))}</select></label>
    <label>AI 덱 <select id="d1" style="max-width:300px">${deckOptions(defaultDeckId(1))}</select></label>
    <label>상대 난이도 <select id="opponent-level"><option value="tactical">실전 AI</option><option value="basic">입문 AI</option></select></label>
    <button class="pri" id="go">가위바위보로 시작</button></div>
    <div id="order-note" role="status"></div><div id="bd"><section class="intro"><h2>첫 턴은 이렇게 시작해</h2>
    <p>가위바위보에서 이긴 사람이 선공이나 후공을 골라. 그다음 첫 패 5장을 보고, 그대로 시작하거나 딱 한 번 전부 바꿀 수 있어.</p>
    <p>턴 드로우와 두웅!!은 게임이 알아서 처리해. 선공 첫 턴에는 카드를 뽑지 않고 두웅!! 1장만 받아. 낼 카드가 없으면 <b>턴 종료</b>를 눌러. 양쪽 모두 자기 첫 턴에는 어택할 수 없어.</p><p><b>AI 효과는 읽고 넘어가.</b> 상대 카드가 효과를 쓰면 해설에서 무엇이 바뀌는지 확인하고 <b>읽었어 · 계속</b>을 눌러.</p><a href="#/lesson/l2-turn">두웅!!으로 카드 내기부터 연습하기</a></section></div>`;
  const level=$('#opponent-level'); level.value=localStorage.getItem('practice-level')==='basic'?'basic':'tactical';
  level.onchange=()=>localStorage.setItem('practice-level',level.value);
  if (!arg) $('#d1').selectedIndex = Math.min(1, $('#d1').options.length - 1);
  let match, board;
  const start = () => {
    match?.stop(); board?.destroy(); match = board = null;
    const setup = newOpening(), root = $('#bd'), ui = $('#go').closest('.filters');
    const tactical = level.value === 'tactical';
    const ds = [getDeck($('#d0').value),getDeck($('#d1').value)];
    ui.hidden = true; ui.style.display='none'; $('#order-note').textContent='';
    const again = () => { match?.stop(); board?.destroy(); pagePlay(main,arg); };
    const launch = () => {
      const first = setup.first;
      $('#order-note').textContent = (setup.winner===0 ? '내가 이겼어. ' : 'AI가 이겼어. ') + (first===0 ? '내가 선공, AI가 후공이야.' : 'AI가 선공, 내가 후공이야.');
      const G = E.createGame({decks:ds,names:['나','AI'],first,orderChooser:setup.winner,ai:[false,!tactical],sandbox:false},db);
      $('#order-note').textContent += tactical ? ' · 실전 AI' : ' · 입문 AI';
      board = new Board(root,db,{me:0,mode:'practice',opponentStep:tactical?practiceStep:E.aiStep,onCardInfo:showCard,onRestart:again});
      match = new LocalMatch(board,db,G,{}); match.start();
    };
    const draw = () => {
      // AI는 사람의 선택 전에 손을 확정한다.
      if(setup.winner===null && setup.hands[1]===null) applyOpening(setup,1,{kind:'throw',round:setup.round,hand:HANDS[Math.floor(Math.random()*3)]});
      drawOpening(root,{...openingView(setup,0),leaders:leaderLabels(ds.map(d=>d.leader))},0,a=>{
        applyOpening(setup,0,a);
        if(setup.winner===1) applyOpening(setup,1,{kind:'order',round:setup.round,first:Math.random()<0.5?0:1});
        if(setup.first!==null) launch(); else draw();
      });
    }; draw();
  };
  $('#go').onclick=start;
  current={cleanup:()=>{match?.stop();board?.destroy();}};
}

// ---------------- 규칙/용어 ----------------
function pageRules(main) {
  setNav('rules');
  const r = db.reg;
  main.innerHTML = `<h1>규칙 · 용어</h1>
    <h2>한국 시즌 레귤레이션</h2><p>${esc(r.name || '')} 기준 <span class="mut">(${esc(r.source || '')})</span></p>
    <ul><li>리더 1장 + 메인 덱 50장 + 두웅!! 덱 10장</li><li>리더 색에 포함된 색 카드만, 같은 카드 번호 4장까지</li><li>블록 로테이션 없음 (한글판 발매 카드 전부 사용 가능)</li><li>발매 7일이 안 된 새 카드 번호는 사용 불가</li></ul>
    <h3>금지 카드</h3><div>${(r.banned || []).map(n => { const c = db.cards.get(n); return `<span class="chip" data-no="${n}" style="cursor:pointer">${n} ${esc(c?.name || '')}</span>`; }).join('')}</div>
    <h3>금지 페어 (같은 덱에 같이 못 넣음)</h3><div>${(r.pairs || []).map(([a, b]) => `<div class="chip">${a} ${esc(db.cards.get(a)?.name || '')} ✕ ${b} ${esc(db.cards.get(b)?.name || '')}</div>`).join('')}</div>
    <h2>게임 흐름 한눈에</h2><p><a href="https://onepiece-cardgame.kr/image/rule_manual.pdf" target="_blank" rel="noopener">한국 공식 룰 매뉴얼 7~11쪽</a></p><p>양쪽 리더를 공개하고 가위바위보 승자가 선후공을 정해요. 첫 패 5장을 받고, 선공부터 한 번씩 전부 다시 뽑을지 결정해요. 이후 리더의 라이프 수만큼 덱 위에서 라이프를 놓고 시작해요.</p>
    <table class="simple"><tr><th>페이즈</th><th>하는 일</th></tr>
      <tr><td>리프레시</td><td>내 카드와 두웅!!을 전부 일으켜요(액티브). 붙어 있던 두웅!!은 코스트 에리어로 돌아와요.</td></tr>
      <tr><td>드로우</td><td>1장 뽑아요. (선공 첫 턴은 안 뽑아요)</td></tr>
      <tr><td>두웅!!</td><td>두웅!! 덱에서 2장 가져와요. (선공 첫 턴은 1장)</td></tr>
      <tr><td>메인</td><td>카드 내기, 두웅!! 붙이기, 효과 발동, 어택. 순서 자유. (양쪽 모두 자기 첫 턴에는 어택 불가)</td></tr>
      <tr><td>엔드</td><td>턴 종료 시 효과 처리 후 상대 턴으로</td></tr></table>
    <h2>배틀 순서</h2>
    <table class="simple"><tr><td>1. 어택 선언</td><td>공격할 리더/캐릭터를 레스트. 대상은 상대 리더 또는 레스트 상태 캐릭터</td></tr>
      <tr><td>2. 블록</td><td>상대는 액티브 【블로커】를 레스트해서 대신 맞게 할 수 있어요</td></tr>
      <tr><td>3. 카운터</td><td>상대는 패의 캐릭터 카운터 값(+1000/+2000)이나 【카운터】 이벤트로 파워를 올려요</td></tr>
      <tr><td>4. 대미지</td><td>공격 파워 ≥ 방어 파워면 성공. 리더면 라이프 1장이 패로(【트리거】면 발동 가능), 캐릭터면 KO</td></tr></table>
    <p>승리: 상대 라이프가 0장일 때 리더에게 대미지를 주거나, 상대 덱이 0장이 되면 승리.</p>
    <h2>용어 사전</h2>${Object.entries(db.glossary).map(([k, v]) => `<div class="step"><div class="l">${esc(k)}</div><div>${esc(v)}</div></div>`).join('')}`;
  main.onclick = e => { const n = e.target.closest('[data-no]'); if (n) showCard(n.dataset.no); };
}

// ---------------- 튜토리얼 ----------------
function pageLearn(main) {
  setNav('learn');
  const done = JSON.parse(localStorage.getItem('lessonsDone') || '{}');
  main.innerHTML = `<h1>튜토리얼</h1><p class="mut">순서대로 하면 기초 규칙 → 카드 효과 읽는 법 → 실전 판단까지 익힐 수 있어요.</p>
    <div class="tiles lessons">${db.lessons.map((l, k) => `<a class="tile" href="#/lesson/${encodeURIComponent(l.id)}"><div class="no">레슨 ${k + 1} ${done[l.id] ? '· 완료' : ''}</div><h3>${esc(l.title)}</h3><div class="mut">${esc(l.summary || '')}</div></a>`).join('') || '<p class="mut">레슨 준비 중</p>'}</div>`;
}
function pageLesson(main, id) {
  setNav('learn');
  const L = db.lessons.find(x => x.id === id); if (!L) { main.innerHTML = '레슨 없음'; return; }
  const k = db.lessons.indexOf(L);
  main.innerHTML = `<a href="#/learn" class="mut">← 레슨 목록</a><h1>레슨 ${k + 1}. ${esc(L.title)}</h1><div id="bd"></div>`;
  let si = -1, board, match, coach, G, advancing = false, closed = false, advanceTimer;
  const say = (step) => {
    coach && coach.remove();
    coach = document.createElement('div'); coach.className = 'coach lesson-guide';
    const last = si === L.steps.length - 1;
    const waiting = step.wait && step.wait !== 'next';
    coach.innerHTML = `<div class="who">코치 · ${si + 1}/${L.steps.length}</div><div>${esc(step.say).replace(/\n/g, '<br>')}</div><div class="bt"><button class="ghost rs">이 장면 다시 시작</button>${waiting ? '<span class="mut" style="font-size:12px">직접 해보세요</span>' : ''}${step.wait === 'next' || !step.wait ? `<button class="pri nx">${last ? '레슨 완료' : '다음'}</button>` : ''}</div>`;
    const q=step.check;
    if(q) {
      const choices=document.createElement('div'); choices.className='filters'; choices.setAttribute('aria-label','예상 장수');
      const feedback=document.createElement('div'); feedback.setAttribute('aria-live','polite');
      const nextButton=coach.querySelector('.nx'); nextButton.textContent='예측 건너뛰기';
      for(const [i,text] of q.options.entries()) {const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{feedback.textContent=i===q.answer?q.why:q.hint;
        if(i===q.answer){choices.querySelectorAll('button').forEach(x=>x.disabled=true);nextButton.textContent='직접 해보기';}else b.disabled=true;};choices.append(b);}
      const controls=coach.querySelector('.bt');coach.insertBefore(choices,controls);coach.insertBefore(feedback,controls);
    }
    main.insertBefore(coach,main.querySelector('#bd'));
    const nx = coach.querySelector('.nx'); if (nx) nx.onclick = () => next();
    coach.querySelector('.rs').onclick = () => { let k2 = si; while (k2 > 0 && !(L.steps[k2].scenario || L.steps[k2].game)) k2--; si = k2 - 1; advancing = false; next(); };
  };
  const applyHL = () => {
    document.querySelectorAll('.hl').forEach(n => n.classList.remove('hl'));
    const st = L.steps[si]; if (!st || !st.highlight || !G) return;
    const hs = Array.isArray(st.highlight) ? st.highlight : [st.highlight];
    for (const h of hs) {
      if (h === 'leader') { const n = document.querySelector(`[data-uid="${G.players[0].leader}"]`); n && n.classList.add('hl'); continue; }
      if (typeof h === 'string' && !/^(?:[A-Z]{1,3}\d{0,2}-\d{3})/.test(h)) { document.querySelectorAll(h).forEach(n => n.classList.add('hl')); continue; }
      const no = typeof h === 'string' ? h : h.no; const side = typeof h === 'object' && h.side === 'opp' ? 1 : 0;
      for (const c of Object.values(G.cards)) if (c.no === no && c.owner === side && ['hand', 'chars', 'stage', 'leader'].includes(c.zone)) { const n = document.querySelector(`[data-uid="${c.uid}"]`); n && n.classList.add('hl'); }
      if (h === 'leader' || h?.leader) { const n = document.querySelector(`[data-uid="${G.players[side].leader}"]`); n && n.classList.add('hl'); }
    }
  };
  const matches = (w, a, evs, p) => {
    if (!w || w === 'next') return false;
    if (w.event) return evs.some(e => e.t === w.event);
    if (p !== 0) return false;
    if (w.action && w.action !== a.type) return false;
    const uid = a.uid; const no = uid && G.cards[uid] ? G.cards[uid].no : null;
    if (w.no && no !== w.no) return false;
    if (w.target === 'leader' && a.target !== G.players[1].leader) return false;
    if (w.targetNo && G.cards[a.target]?.no !== w.targetNo) return false;
    return true;
  };
  const next = async () => {
    if(closed) return; clearTimeout(advanceTimer); si++;
    if (si >= L.steps.length) { const d = JSON.parse(localStorage.getItem('lessonsDone') || '{}'); d[L.id] = 1; localStorage.setItem('lessonsDone', JSON.stringify(d)); coach && coach.remove(); const nl = db.lessons[k + 1]; main.insertAdjacentHTML('beforeend', `<div class="tile" style="margin-top:12px"><h3>레슨 완료!</h3>${nl ? `<a href="#/lesson/${encodeURIComponent(nl.id)}"><button class="pri">다음 레슨: ${esc(nl.title)}</button></a>` : '<a href="#/play"><button class="pri">연습 대전 하러 가기</button></a>'}</div>`); return; }
    const st = L.steps[si];
    if (st.scenario || st.game) {
      match && match.stop(); board && board.destroy();
      if (st.game) { const d0 = getDeck(st.game.myDeck || defaultDeckId(0)), d1 = getDeck(st.game.aiDeck || defaultDeckId(1)); G = E.createGame({ decks: [d0, d1], names: ['나', 'AI'], first: st.game.first ?? 0, ai: [false, true], sandbox: false }, db); }
      else G = E.createScenario({ ai: [false, true], ...st.scenario, sandbox: false }, db);
      board = new Board($('#bd'), db, { me: 0, mode:'lesson', coach:false, assist:false, onCardInfo: showCard, onRestart: () => { si--; next(); } });
      const orig = board.render.bind(board); board.render = () => { orig(); applyHL(); };
      match = new LocalMatch(board, db, G, { onEvents: (a, evs, p) => { if (advancing) return; const w = L.steps[si]?.wait; if (matches(w, a, evs, p)) { advancing = true; const mm = match; mm.hold = true; advanceTimer=setTimeout(() => { advancing = false; mm.hold = false; if(!closed && mm===match) next(); }, 900); } } });
      // Keep the opening cost exercise recoverable: a wrong legal move must not strand the learner.
      if(L.id==='l2-turn') {
        const send=board.o.send;
        board.o.send=a=>{const step=L.steps[si], w=step?.wait;
          if(!G.pending && G.active===0 && (w==='next' || (w?.action && (a.type!==w.action || (w.no && G.cards[a.uid]?.no!==w.no))))) {
            board.toast(w==='next'?'먼저 레슨 안내에서 다음 단계로 넘어가요.':step.say.split('\n').at(-1));return;
          }
          return send(a);
        };
      }
      await match.start();
    }
    if(!closed){say(st); applyHL();}
  };
  current = { cleanup: () => { closed=true; clearTimeout(advanceTimer); match && match.stop(); board && board.destroy(); coach && coach.remove(); } };
  next();
}

// ---------------- 온라인 대전 ----------------
// 두 가지 방식: (1) 인터넷 P2P: 방장 브라우저가 규칙 판정(엔진), 상대는 화면/액션만 주고받음 (PeerJS)
//              (2) 사내 서버: node server/server.mjs 의 WebSocket (서버가 판정)
const PEER_PREFIX = 'oddlys-opcg-rps1-';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] };
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'ui/peerjs.min.js?v=202611261856'; s.onload = res; s.onerror = () => rej(new Error('PeerJS 로드 실패')); document.head.appendChild(s); });
}
function pageOnline(main) {
  setNav('online');
  const localServer = location.port === '8787';
  const defUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + (localServer ? location.host : location.hostname + ':8787');
  main.innerHTML = `<h1>사람 vs 사람</h1>
    <p class="mut">한 명이 <b>방 만들기</b>를 누르고 나온 코드를 알려주면, 다른 사람이 코드를 넣고 <b>참가</b>를 눌러요. 인터넷만 되면 어디서든 가능해요. (방장 화면을 닫으면 게임이 끝나요)</p>
    <div class="filters"><label>방식 <select id="mode"><option value="p2p">인터넷 (P2P)</option><option value="ws" ${localServer ? 'selected' : ''}>사내 서버</option></select></label>
    <label id="urlw" style="display:${localServer ? '' : 'none'}">서버 <input id="url" value="${defUrl}" style="width:220px"></label>
    <label>이름 <input id="nm" value="${esc(localStorage.getItem('nm') || '플레이어')}" style="width:120px"></label>
    <label>내 덱 <select id="dk" style="max-width:280px">${deckOptions(defaultDeckId(0))}</select></label></div>
    <div class="filters"><button class="pri" id="mk">방 만들기</button><input id="code" placeholder="방 코드" style="width:120px;text-transform:uppercase"><button id="jn">참가</button><span class="mut" id="st"></span></div><div id="bd"></div>`;
  $('#mode').onchange = e => { $('#urlw').style.display = e.target.value === 'ws' ? '' : 'none'; };
  let ws, board, peer, conn, G;
  const openingPanel = (m,send) => { st(`방 ${m.code} · 대전 준비`); drawOpening($('#bd'),{...m.view,leaders:leaderLabels(m.leaders)},m.you,send); };
  const st = t => { $('#st').textContent = t; };
  const cleanup = () => { try { ws && ws.close(); } catch { } try { conn && conn.close(); } catch { } try { peer && peer.destroy(); } catch { } board && board.destroy(); board = null; };
  const showState = async (you, names, state, events, code) => {
    st(`방 ${code} · ${names.join(' vs ')}`);
    if (!board) board = new Board($('#bd'), db, { me: you, coach: false, onCardInfo: showCard, send: a => sendAction(a) });
    board.o.me = you;
    await board.update(state, events || []);
  };
  let sendAction = async () => { };

  // ---- 사내 서버 (WebSocket) ----
  const wsConnect = (mode) => {
    ws = new WebSocket($('#url').value);
    let pendingResolve = null;
    sendAction = a => new Promise(r => { pendingResolve = r; ws.send(JSON.stringify({ t: 'act', action: a })); });
    ws.onopen = () => ws.send(JSON.stringify({ t: mode, code: $('#code').value.trim().toUpperCase(), name: $('#nm').value, deck: getDeck($('#dk').value) }));
    ws.onerror = () => st('서버 연결 실패: 서버가 켜져 있는지 확인해 주세요');
    ws.onmessage = async (m) => {
      const msg = JSON.parse(m.data);
      if (msg.t === 'opening') openingPanel(msg, action=>ws.send(JSON.stringify({t:'opening',action})));
      if (msg.t === 'room') { $('#code').value = msg.code; st(`방 코드 ${msg.code} · 상대를 기다리는 중`); }
      if (msg.t === 'error') { st(msg.message); board && board.toast(msg.message); }
      if (msg.t === 'state') await showState(msg.you, msg.names, msg.state, msg.events, msg.code);
      if (pendingResolve && (msg.t === 'state' || msg.t === 'error')) { pendingResolve(); pendingResolve = null; }
    };
  };

  // ---- 인터넷 P2P ----
  const p2pHost = async () => {
    await loadPeer();
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    const myDeck = getDeck($('#dk').value); const myName = $('#nm').value;
    const err0 = validateDeck(db, db.reg, myDeck); if (err0) { st('덱 오류: ' + err0); return; }
    peer = new window.Peer(PEER_PREFIX + code, { config: ICE, debug: 0 });
    peer.on('open', () => { $('#code').value = code; st(`방 코드 ${code} · 상대를 기다리는 중 (이 화면을 열어 두세요)`); });
    peer.on('error', e => st('연결 오류: ' + (e.type === 'unavailable-id' ? '코드가 겹쳤어요. 다시 만들어 주세요' : e.message || e.type)));
    peer.on('connection', c => {
      if (conn && conn.open) { c.on('open', () => { c.send({ t: 'error', message: '방이 꽉 찼어요' }); setTimeout(() => c.close(), 500); }); return; }
      conn = c;
      let names, otherDeck, opening; G=null;
      const push = async (events) => {
        const ev = events || [];
        conn.open && conn.send({ t: 'state', you: 1, names, code, state: E.viewFor(G, 1), events: ev });
        await showState(0, names, G, ev, code);
      };
      const act = async (p, a) => {
        try { E.apply(G, db, p, a); } catch (e) { if (p === 1) conn.send({ t: 'error', message: e.message }); else board && board.toast(e.message); return; }
        const ev = G.events; G.events = []; await push(ev);
      };
      const updateOpening = () => {
        const leaders=[myDeck.leader,otherDeck.leader];
        c.send({t:'opening',you:1,code,leaders,view:openingView(opening,1)});
        openingPanel({you:0,code,leaders,view:openingView(opening,0)}, a=>step(0,a));
      };
      const step = async (p,a) => {
        if (!opening || G) return;
        try { applyOpening(opening,p,a); } catch(e) { if(p===1)c.send({t:'error',message:e.message}); return; }
        if(opening.first===null){updateOpening();return;}
        G=E.createGame({decks:[myDeck,otherDeck],names,first:opening.first,orderChooser:opening.winner,ai:[false,false],sandbox:false},db);
        const ev=G.events; G.events=[]; await push(ev);
      };
      sendAction = a => act(0, a);
      c.on('data', async (m) => {
        if (m.t === 'join' && !opening && !G) {
          const err = validateDeck(db, db.reg, m.deck); if (err) { c.send({ t: 'error', message: '덱 오류: ' + err }); return; }
          names = [myName, m.name || '상대'];
          otherDeck=m.deck; opening=newOpening(); updateOpening();
        }
        if (m.t === 'opening') await step(1,m.action);
        if (m.t === 'act' && G) await act(1, m.action);
      });
      c.on('close', () => { st('상대 연결이 끊겼어요'); board && board.toast('상대 연결이 끊겼어요'); });
    });
  };
  const p2pJoin = async () => {
    await loadPeer();
    const code = $('#code').value.trim().toUpperCase(); if (!code) { st('방 코드를 넣어 주세요'); return; }
    const deck = getDeck($('#dk').value);
    const err0 = validateDeck(db, db.reg, deck); if (err0) { st('덱 오류: ' + err0); return; }
    peer = new window.Peer(undefined, { config: ICE, debug: 0 });
    peer.on('error', e => st('연결 오류: ' + (e.type === 'peer-unavailable' ? '그 코드의 방이 없어요 (방장 화면이 열려 있는지 확인)' : e.message || e.type)));
    peer.on('open', () => {
      st('연결 중…');
      conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      let pendingResolve = null;
      sendAction = a => new Promise(r => { pendingResolve = r; conn.send({ t: 'act', action: a }); setTimeout(() => { if (pendingResolve === r) { r(); pendingResolve = null; } }, 8000); });
      conn.on('open', () => { st('연결됨 · 게임 준비 중'); conn.send({ t: 'join', name: $('#nm').value, deck }); });
      conn.on('data', async (m) => {
        if (m.t === 'error') { st(m.message); board && board.toast(m.message); }
        if (m.t === 'opening') openingPanel(m,action=>conn.send({t:'opening',action}));
        if (m.t === 'state') await showState(m.you, m.names, m.state, m.events, m.code);
        if (pendingResolve) { pendingResolve(); pendingResolve = null; }
      });
      conn.on('close', () => { st('방장 연결이 끊겼어요'); board && board.toast('방장 연결이 끊겼어요'); });
    });
  };

  $('#mk').onclick = () => { localStorage.setItem('nm', $('#nm').value); cleanup(); $('#mode').value === 'ws' ? wsConnect('create') : p2pHost().catch(e => st(e.message)); };
  $('#jn').onclick = () => { localStorage.setItem('nm', $('#nm').value); cleanup(); $('#mode').value === 'ws' ? wsConnect('join') : p2pJoin().catch(e => st(e.message)); };
  current = { cleanup };
}

boot();
window.__db = db; window.__E = E;
