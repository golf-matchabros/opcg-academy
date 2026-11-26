// 대전 보드 UI: 상태 렌더 + 클릭 조작 + 효과 연출(이동/파워/어택 화살표/효과 해설 배너)
import * as E from '../engine/core.js?v=202611261818';
import { explainAbility, actionText, explainCard } from '../engine/explain.js?v=202611261818';
import { easySentence, glossify, tipsFor } from './easy.js?v=202611261818';
import { evalPlay, roleOf } from './coach.js?v=202611261818';

const KW_LABEL = { blocker: '블로커', rush: '속공', rushCharacter: '속공(캐)', doubleAttack: '더블', banish: '배니시', unblockable: '블록불가' };
const KW_TIP = { blocker: '블로커: 상대가 어택하면 이 캐릭터를 눕혀서 대신 막을 수 있어요', rush: '속공: 나온 턴에 바로 어택할 수 있어요', rushCharacter: '속공(캐릭터): 나온 턴에 상대 캐릭터만 어택할 수 있어요', doubleAttack: '더블 어택: 리더를 맞히면 라이프 2장', banish: '배니시: 맞은 라이프가 트래시로 (트리거 불가)', unblockable: '블록 불가: 블로커로 막을 수 없어요' };
const PHASE = { mulligan: '멀리건', refresh: '리프레시', draw: '드로우', don: '두웅!!', main: '메인', endPending: '엔드', over: '게임 종료' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const IMGV = 'c2';
export function imgSrc(c) { return c ? `${c.thumb || c.img}?v=${IMGV}` : ''; }
export function imgBig(c) { return c ? `img/m/${c.no}.webp?v=${IMGV}` : ''; }
export function imgFallback(el, c) { el.onerror = () => { el.onerror = null; if (c && c.src) el.src = c.src; }; }

export class Board {
  // opts: { me, mode:'ai'|'demo'|'lesson'|'online'|'hotseat', send(action) -> Promise, onCardInfo(no), speed, panel:Element }
  constructor(root, db, opts) {
    this.root = root; this.db = db; this.o = Object.assign({ me: 0, speed: 1, slow: false }, opts);
    this.G = null; this.sel = null; this.picks = []; this.rects = {}; this.busy = false; this.lastAbility = null;
    if (this.o.assist === undefined) this.o.assist = localStorage.getItem('assist') !== '0';
    if (this.o.coach === undefined) this.o.coach = true;
    root.innerHTML = `<div class="play-wrap"><div class="board"></div><aside class="panel"><div class="assist"></div><div class="preview" style="display:none"></div><h3>효과 해설</h3><div class="explain mut">카드가 효과를 쓰면 여기서 단계별로 풀어 보여줘요. 카드에 마우스를 올리면 위에 쉬운 설명이 나와요.</div><div style="display:flex;gap:6px;flex-wrap:wrap"><div class="sizebar">카드 크기 <button data-sz="s">작게</button><button data-sz="m">보통</button><button data-sz="l">크게</button></div><div class="sizebar">확대 보기 <button class="zm">${localStorage.getItem('zoom') === '0' ? '꺼짐' : '켜짐'}</button></div><button class="ghost as">초보 도우미: ${this.o.assist ? '켜짐' : '꺼짐'}</button><button class="ghost sp">연출 속도: 보통</button><button class="ghost lg">로그 지우기</button></div><div class="log"></div></aside></div>`;
    this.el = root.querySelector('.board');
    this.asEl = root.querySelector('.assist'); this.pvEl = root.querySelector('.preview');
    root.querySelector('.as').onclick = (e) => { this.o.assist = !this.o.assist; localStorage.setItem('assist', this.o.assist ? '1' : '0'); e.target.textContent = '초보 도우미: ' + (this.o.assist ? '켜짐' : '꺼짐'); this.render(); };
    this.el.addEventListener('mouseover', e => { const n = e.target.closest('[data-uid]'); if (n && n.dataset.uid !== this._hov) { this._hov = n.dataset.uid; this.preview(n.dataset.uid); } });
    this.el.addEventListener('mouseleave', () => { this._hov = null; this.pvEl.style.display = 'none'; this.hideZoom(); });
    // 카드 크기
    const applySz = (v) => { document.body.classList.remove('sz-s', 'sz-l'); if (v !== 'm') document.body.classList.add('sz-' + v); localStorage.setItem('cardsize', v); root.querySelectorAll('[data-sz]').forEach(b => b.classList.toggle('on', b.dataset.sz === v)); };
    applySz(localStorage.getItem('cardsize') || 'l');
    root.querySelectorAll('[data-sz]').forEach(b => b.onclick = () => { applySz(b.dataset.sz); this.render(); });
    root.querySelector('.zm').onclick = (e) => { const on = localStorage.getItem('zoom') === '0'; localStorage.setItem('zoom', on ? '1' : '0'); e.target.textContent = on ? '켜짐' : '꺼짐'; if (!on) this.hideZoom(); };
    // 확대 보기: 카드에 마우스를 올리면 크게
    this.el.addEventListener('mousemove', e => {
      if (localStorage.getItem('zoom') === '0') return;
      const n = e.target.closest('[data-uid]'); const c = n && n.dataset.uid && this.cardOf(n.dataset.uid);
      if (!c) { this.hideZoom(); return; }
      if (!this.zoomEl) { this.zoomEl = document.createElement('div'); this.zoomEl.className = 'zoom'; this.zoomEl.innerHTML = '<img>'; document.body.appendChild(this.zoomEl); }
      const im = this.zoomEl.querySelector('img');
      if (this.zoomEl.dataset.no !== c.no) { this.zoomEl.dataset.no = c.no; im.src = imgSrc(c); const big = new Image(); big.onload = () => { if (this.zoomEl && this.zoomEl.dataset.no === c.no) im.src = big.src; }; big.src = imgBig(c); }
      this.zoomEl.style.display = '';
      const w = this.zoomEl.offsetWidth || 320, h = this.zoomEl.offsetHeight || 450;
      let x = e.clientX + 24; if (x + w > window.innerWidth - 8) x = e.clientX - w - 24;
      let y = e.clientY - h / 2; y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
      this.zoomEl.style.left = x + 'px'; this.zoomEl.style.top = y + 'px';
    });
    this.el = root.querySelector('.board');
    this.exEl = root.querySelector('.explain');
    this.logEl = root.querySelector('.log');
    root.querySelector('.sp').onclick = (e) => { const s = [1, 1.8, 0.5]; const n = ['보통', '천천히', '빠르게']; this.spi = ((this.spi || 0) + 1) % 3; this.o.speed = s[this.spi]; e.target.textContent = '연출 속도: ' + n[this.spi]; };
    root.querySelector('.lg').onclick = () => { this.logEl.innerHTML = ''; };
    this.el.addEventListener('click', e => this.onClick(e));
    document.addEventListener('click', this._docClick = (e) => { if (this.menu && !this.menu.contains(e.target)) this.closeMenu(); }, true);
  }
  hideZoom() { if (this.zoomEl) this.zoomEl.style.display = 'none'; }
  destroy() { document.removeEventListener('click', this._docClick, true); this.closeMenu(); if (this.zoomEl) { this.zoomEl.remove(); this.zoomEl = null; } }
  get me() { return this.o.me; }
  C(no) { return this.db.cards.get(no); }
  cardOf(uid) { const i = this.G.cards[uid]; return i && !i.hidden ? this.C(i.no) : null; }

  // ---------- 렌더 ----------
  captureRects() {
    this.rects = {};
    this.el.querySelectorAll('[data-uid]').forEach(n => { this.rects[n.dataset.uid] = n.getBoundingClientRect(); });
    this.pileRects = {};
    this.el.querySelectorAll('[data-pile]').forEach(n => { this.pileRects[n.dataset.pile] = n.getBoundingClientRect(); });
  }
  render() {
    const G = this.G; if (!G) return;
    const me = this.me, op = 1 - me;
    const legal = this.isMyMain() ? E.legalMain(G, this.db, me) : { play: [], attack: [], activate: [] };
    this.legal = legal;
    const pend = G.pending && G.pending.p === me ? G.pending : null;
    const optSet = new Set(pend?.options || []);
    if (this.o.coach && this.o.assist && this.isMyMain()) this.computePlan(); else this.plan = null;
    this.computeAssist(pend);
    const atkTargets = this.sel?.mode === 'attack' ? new Set(E.attackTargets(G, this.db, this.sel.uid)) : new Set();
    const cardHtml = (uid, extra = '') => {
      const i = G.cards[uid];
      if (!i || i.hidden) return `<div class="card back" data-uid="${uid}"></div>`;
      const c = this.C(i.no);
      const onField = ['leader', 'chars', 'stage'].includes(i.zone) || G.players[i.owner].leader === uid;
      let cls = 'card';
      if (i.rested && onField) cls += ' rested';
      if (legal.play.includes(uid) || legal.attack.includes(uid) || legal.activate.some(x => x.uid === uid)) cls += ' can';
      if (optSet.has(uid)) cls += ' opt';
      if (this.picks.includes(uid)) cls += ' picked';
      if (atkTargets.has(uid)) cls += ' opt atk';
      let badges = '';
      if (i.zone === 'hand' && pend && pend.type === 'counter' && optSet.has(uid)) badges += `<div class="cb">${c.type === 'event' ? '이벤트' : '+' + c.counter}</div>`;
      if (this.rec && this.rec.includes(uid)) cls += ' rec';
      if (onField && c.type !== 'stage') {
        const pw = E.power(G, this.db, uid), bp = c.power || 0;
        badges += `<div class="pw ${pw > bp ? 'up' : pw < bp ? 'down' : ''}">${pw}</div>`;
        if (i.don) badges += `<div class="dn">+${i.don}</div>`;
        const kws = Object.keys(KW_LABEL).filter(k => E.hasKw(G, this.db, uid, k));
        if (kws.length) badges += `<div class="kw">${kws.map(k => `<span data-tip="${esc(KW_TIP[k] || '')}">${KW_LABEL[k]}</span>`).join('')}</div>`;
      }
      return `<div class="${cls}" data-uid="${uid}" title="${esc(c.name)}"><img src="${imgSrc(c)}" data-src2="${c.src}" loading="lazy">${badges}${this.coachTags(uid)}${extra}</div>`;
    };
    const lifeHtml = (P, p) => `<div class="life" data-pile="life${p}" data-tip="라이프: 리더가 맞으면 1장씩 손패로 가요. 0장일 때 한 번 더 맞으면 패배!"><div class="stack">${P.life.map((l, k) => `<div class="lc" style="top:${k * 8}px" data-life="${p}"></div>`).join('')}</div><div class="num">${P.life.length}</div><div class="zlabel">라이프</div></div>`;
    const donHtml = (P, p) => `<div class="don" data-pile="don${p}" data-tip="두웅!!: 밝은 건 쓸 수 있는 것(액티브), 어두운 건 이미 쓴 것(레스트). 카드를 낼 때 코스트만큼 눕혀요"><div class="tokens">${'<div class="t"></div>'.repeat(P.donActive)}${'<div class="t r"></div>'.repeat(P.donRested)}</div><div>두웅!! <b style="color:var(--acc)">${P.donActive}</b>/${P.donActive + P.donRested} · 덱 ${P.donDeck}</div></div>`;
    const pileHtml = (P, p) => {
      const top = P.trash[P.trash.length - 1]; const tc = top && G.cards[top] && !G.cards[top].hidden ? this.C(G.cards[top].no) : null;
      return `<div class="zone"><div><div class="pile" data-pile="deck${p}"><b>${P.deck.length}</b>덱</div></div><div><div class="pile trash" data-pile="trash${p}" data-trash="${p}">${tc ? `<img src="${imgSrc(tc)}">` : ''}<b>${P.trash.length}</b></div><div class="zlabel">트래시</div></div></div>`;
    };
    const fieldRow = (p) => {
      const P = G.players[p];
      return `<div class="frow">${lifeHtml(P, p)}<div><div class="slot">${cardHtml(P.leader)}</div><div class="zlabel">리더</div></div>
        <div><div class="slot">${P.stage ? cardHtml(P.stage) : '<div class="pile">스테이지</div>'}</div></div>
        <div class="zone" style="flex:1;flex-wrap:wrap">${P.chars.map(u => `<div class="slot">${cardHtml(u)}</div>`).join('') || '<span class="mut" style="font-size:12px">캐릭터 없음</span>'}</div>
        ${pileHtml(P, p)}${donHtml(P, p)}</div>`;
    };
    const P = G.players[me], O = G.players[op];
    const turnTxt = G.winner !== null ? '게임 종료' : `${G.turn}턴 · <b>${esc(G.players[G.active].name)}</b>의 ${PHASE[G.phase] || G.phase} 페이즈`;
    this.el.innerHTML = `
      <div class="side opp">${fieldRow(op)}<div class="hand" data-pile="hand${op}">${O.hand.map(u => `<div class="card back" data-uid="${u === 'hidden' ? '' : u}"></div>`).join('')}<span class="mut" style="align-self:center;font-size:12px">상대 패 ${O.hand.length}장</span></div></div>
      <div class="mid"><div class="phase">${turnTxt}${G.battle ? ` · <span style="color:var(--bad)">배틀 중</span>` : ''}</div><div class="ctrl"></div></div>
      <div class="side me">${fieldRow(me)}<div class="hand" data-pile="hand${me}">${P.hand.map(u => cardHtml(u)).join('')}</div></div>`;
    this.el.querySelectorAll('img[data-src2]').forEach(im => { im.onerror = () => { im.onerror = null; im.src = im.dataset.src2; }; });
    this.renderCtrl(pend);
    try { this.drawCallout(); } catch (e) { console.warn(e); }
    if (G.winner !== null) {
      const w = document.createElement('div'); w.className = 'winbox';
      w.innerHTML = `<div><h1>${G.winner === me ? '승리!' : '패배'}</h1><p class="mut">${esc(G.loseReason || '')}</p><button class="pri again">다시 하기</button></div>`;
      w.querySelector('.again').onclick = () => this.o.onRestart && this.o.onRestart();
      this.el.appendChild(w);
    }
  }
  computePlan() {
    // 이번 턴 추천 순서: 상태 복제본에서 AI 판단을 내 편으로 돌려 몇 단계 미리 실행
    const G = this.G, db = this.db, me = this.me;
    const key = G.turn + ':' + G.evSeq + ':' + G.players[me].hand.length + ':' + G.players[me].donActive;
    if (this._planKey === key) return this.plan;
    this._planKey = key; this.plan = [];
    try {
      const C = JSON.parse(JSON.stringify(G)); C.ai = [true, true]; C.events = [];
      const nm = u => { const i = G.cards[u]; const c = i && !i.hidden ? this.C(i.no) : null; return c ? c.name : '카드'; };
      for (let k = 0; k < 8; k++) {
        let a = E.aiTurnActions(C, db, me);
        if (a.type === 'play') {
          // 효과가 헛도는 카드보다 지금 효과가 나는 카드를 먼저 추천
          const g = u => { try { return evalPlay(C, db, u, me).grade; } catch { return 'ok'; } };
          if (g(a.uid) === 'meh') {
            const L2 = E.legalMain(C, db, me);
            const alt = L2.play.filter(u => u !== a.uid && g(u) === 'good').sort((x, y) => E.costOf(C, db, y) - E.costOf(C, db, x))[0];
            if (alt) a = { type: 'play', uid: alt };
          }
        }
        if (a.type === 'endTurn') { this.plan.push({ a, text: '턴 종료' }); break; }
        let text = '';
        if (a.type === 'play') text = `「${nm(a.uid)}」 내기 (코스트 ${E.costOf(C, db, a.uid)})`;
        else if (a.type === 'attachDon') text = `「${nm(a.uid)}」에 두웅!! ${a.n}장 붙이기`;
        else if (a.type === 'attack') text = `「${nm(a.uid)}」로 ${a.target === C.players[1 - me].leader ? '상대 리더' : '「' + nm(a.target) + '」'} 어택`;
        else if (a.type === 'activate') text = `「${nm(a.uid)}」 효과 발동`;
        const prev = this.plan[this.plan.length - 1];
        if (prev && a.type === 'attachDon' && prev.a.type === 'attachDon' && prev.uid === a.uid) { prev.n = (prev.n || prev.a.n) + a.n; prev.text = `「${nm(a.uid)}」에 두웅!! ${prev.n}장 붙이기`; }
        else this.plan.push({ a, text, uid: a.uid, target: a.target });
        try { E.apply(C, db, me, a); } catch { break; }
        for (let j = 0; j < 20 && C.pending; j++) { const r = E.aiRespond(C, db, C.pending.p); if (!r) break; try { E.apply(C, db, C.pending.p, r); } catch { break; } }
        if (C.winner !== null) { this.plan.push({ a: { type: 'win' }, text: '이번 턴에 이길 수 있어요!' }); break; }
      }
    } catch (e) { console.warn('plan', e); }
    return this.plan;
  }
  evalOf(uid) {
    const key = this._planKey + '|' + uid;
    this._evc = this._evc || {};
    if (!this._evc[key]) { try { this._evc[key] = evalPlay(this.G, this.db, uid, this.me); } catch (e) { this._evc[key] = { grade: 'ok', good: [], bad: [], info: [] }; } }
    return this._evc[key];
  }
  coachTags(uid) {
    // 카드 위에 붙는 감독 표시 (연습 모드에서만)
    if (!this.o.coach || !this.o.assist || !this.isMyMain()) return '';
    const G = this.G, i = G.cards[uid]; if (!i || i.owner !== this.me) return '';
    const c = this.C(i.no); const L = this.legal; const P = G.players[this.me];
    const steps = (this.plan || []).map((p, k) => (p.uid === uid ? k + 1 : null)).filter(Boolean);
    const num = steps.length ? `<div class="cnum">${steps.map(n => '①②③④⑤⑥⑦⑧'[n - 1]).join('')}</div>` : '';
    let tag = '';
    if (i.zone === 'hand') {
      if (L.play.includes(uid)) {
        const ev = this.evalOf(uid);
        tag = ev.grade === 'good' ? `<div class="ctag ok">추천 · 효과 OK</div>` : ev.grade === 'meh' ? `<div class="ctag meh">낼 순 있지만 지금은 별로</div>` : `<div class="ctag ok">낼 수 있어</div>`;
      }
      else if (c.type === 'event' && !E.effectsOf(this.db, c.no).abilities.some(a => a.timing === 'main')) tag = `<div class="ctag no">상대 턴에 써요</div>`;
      else if (E.costOf(G, this.db, uid) > P.donActive) tag = `<div class="ctag no">두웅!! ${E.costOf(G, this.db, uid) - P.donActive} 부족</div>`;
    } else {
      const parts = [];
      if (L.attack.includes(uid)) parts.push('어택 가능');
      if (L.activate.some(x => x.uid === uid && !x.event)) parts.push('효과 사용 가능');
      if (parts.length) tag = `<div class="ctag ok">${parts.join(' · ')}</div>`;
    }
    return tag + num;
  }
  drawCallout() {
    this.el.querySelectorAll('.callout').forEach(n => n.remove());
    if (!this.o.coach || !this.o.assist || !this.isMyMain() || !this.plan || !this.plan.length) return;
    const step = this.plan[0];
    let node = step.uid ? this.el.querySelector(`[data-uid="${step.uid}"]`) : this.el.querySelector('.ctrl button.pri');
    if (!node) return;
    const br = this.el.getBoundingClientRect(), r = node.getBoundingClientRect();
    const verb = { play: '이걸 내봐!', attachDon: '여기에 두웅!!을 붙여봐!', attack: '이걸로 어택해봐!', activate: '이 효과를 써봐!', endTurn: '이제 턴을 끝내도 돼!', win: '이번 턴에 이길 수 있어!' }[step.a.type] || '';
    const d = document.createElement('div'); d.className = 'callout';
    let why = '';
    if (step.a.type === 'play') { const ev = this.evalOf(step.uid); why = (ev.good[0] || ev.info[0] || ''); if (ev.grade === 'meh') why = (ev.bad[0] || '') + (ev.info.find(x => x.includes('의미')) ? ' · ' + ev.info.find(x => x.includes('의미')) : ''); }
    d.innerHTML = `<b>① ${verb}</b><div>${esc(step.text)}</div>${why ? `<div class="cwhy">${esc(why)}</div>` : ''}${step.a.type !== 'endTurn' ? '<div class="mut" style="font-size:11px">카드를 눌러서 메뉴에서 고르면 돼요</div>' : ''}`;
    this.el.appendChild(d);
    const w = d.offsetWidth, h = d.offsetHeight;
    let left = r.left - br.left + r.width / 2 - w / 2; left = Math.max(6, Math.min(br.width - w - 6, left));
    let top = r.top - br.top - h - 18; let below = false;
    if (top < 4) { top = r.bottom - br.top + 18; below = true; }
    d.style.left = left + 'px'; d.style.top = top + 'px'; d.classList.toggle('below', below);
    d.style.setProperty('--ax', (r.left - br.left + r.width / 2 - left) + 'px');
  }
  computeAssist(pend) {
    const G = this.G, db = this.db, me = this.me; this.rec = null;
    if (!this.asEl) return;
    if (!this.o.assist || G.winner !== null) { this.asEl.innerHTML = ''; return; }
    const nm = u => { const c = this.cardOf(u); return c ? `「${c.name}」` : '카드'; };
    const P = G.players[me], O = G.players[1 - me];
    let h = '';
    try {
      if (pend && G.battle && (pend.type === 'block' || pend.type === 'counter')) {
        const B = G.battle; const ap = E.power(G, db, B.attacker), tp = E.power(G, db, B.target);
        const leaderHit = G.players[me].leader === B.target;
        const need = ap - tp + 1;
        h += `<b>지금 상황</b><div>${nm(B.attacker)} 파워 <b>${ap}</b> → ${leaderHit ? '내 리더' : nm(B.target)} 파워 <b>${tp}</b></div>`;
        if (need <= 0) h += `<div class="good">이미 막혔어요! 내 쪽 파워가 같거나 높아서 공격이 실패해요. 그냥 넘어가도 돼요</div>`;
        else if (leaderHit) h += `<div>이대로면 <b>라이프 1장${E.hasKw(G, db, B.attacker, 'doubleAttack') ? '(더블 어택이라 2장)' : ''}</b>이 손패로 와요 (지금 라이프 ${P.life.length}장${P.life.length === 0 ? ', <b class="bad">맞으면 패배!</b>' : ''})</div>`;
        else h += `<div>이대로면 ${nm(B.target)}이(가) <b>KO</b> 돼요</div>`;
        if (pend.type === 'block') h += `<div class="mut">블로커로 막으면 블로커가 대신 싸워요. 블로커 파워가 낮으면 블로커가 KO 될 수 있어요 (대신 라이프는 지켜요)</div>`;
        if (pend.type === 'counter' && need > 0) {
          const cs = P.hand.filter(u => pend.options.includes(u)).map(u => this.cardOf(u)).filter(c => c.type === 'character').map(c => c.counter).sort((a, b) => b - a);
          let sum = 0, k = 0; for (const v of cs) { if (sum >= need) break; sum += v; k++; }
          h += `<div>막으려면 파워 <b>+${Math.ceil(need / 1000) * 1000}</b> 더 필요해요. ${sum >= need ? `패의 카운터 카드 <b>${k}장</b>이면 막을 수 있어요 (노란 숫자 = 올려주는 파워)` : '패의 카운터로는 부족해요'}</div>`;
          if (P.life.length >= 3 && leaderHit) h += `<div class="mut">팁: 라이프가 넉넉하면 일부러 맞고 패를 아끼는 것도 방법이에요</div>`;
        }
      } else if (pend && pend.type === 'trigger') {
        const c = this.cardOf(pend.uid); const ab = c && E.effectsOf(db, c.no).abilities.find(a => a.timing === 'trigger');
        h += `<b>【트리거】란?</b><div>맞아서 라이프에서 나온 카드에 【트리거】가 있으면, 손으로 가져가는 대신 <b>공짜로 효과</b>를 쓸 수 있어요.</div>${ab ? `<div>이 카드의 트리거: ${esc(easySentence(explainAbility(ab, c).sentence))}</div>` : ''}<div class="mut">발동하면 이 카드는 트래시로 가요 (손패에는 안 들어와요)</div>`;
      } else if (pend && (pend.type === 'target' || pend.type === 'search')) {
        h += `<b>고르기</b><div>${esc(pend.text || '')}</div><div class="mut">주황색으로 깜빡이는 카드만 고를 수 있어요. 다 고르면 '확인'</div>`;
      } else if (pend && pend.type === 'mulligan') {
        const low = P.hand.map(u => this.cardOf(u)).filter(c => c.type === 'character' && (c.cost ?? 9) <= 3).length;
        h += `<b>첫 손패 확인</b><div>초반에 낼 수 있는 2~3코스트 캐릭터가 <b>${low}장</b> 있어요. ${low >= 2 ? '이대로 시작해도 좋아요' : '적으면 다시 뽑는 것도 좋아요'}</div>`;
      } else if (pend && pend.type === 'manual') {
        h += `<b>직접 처리하기</b><div>이 효과는 자동으로 안 돼요. 효과 해설을 보고, 대상 카드를 눌러 '수동 조작' 메뉴로 처리한 뒤 '처리 완료'를 눌러요.</div>`;
      } else if (this.isMyMain()) {
        const L = this.legal;
        h += `<b>할 수 있는 것</b><div>두웅!! <b>${P.donActive}</b>장 남음 · 낼 수 있는 카드 <b>${L.play.length}</b>장 · 어택 가능 <b>${L.attack.length}</b>장${G.turn <= 2 ? ' (첫 턴엔 어택 불가)' : ''}</div>`;
        const clone = JSON.parse(JSON.stringify(G));
        const a = (this.plan && this.plan[0] && this.plan[0].a.type !== 'win') ? this.plan[0].a : E.aiTurnActions(clone, db, me);
        let why = '';
        if (a.type === 'play') { const c = this.cardOf(a.uid); this.rec = [a.uid]; why = `${nm(a.uid)}를(을) 내보세요 (코스트 ${E.costOf(G, db, a.uid)}). ${c.type === 'character' ? '필드에 캐릭터가 있어야 어택·블록을 할 수 있어요' : '이벤트 효과로 유리하게 만들어요'}`; }
        else if (a.type === 'attachDon') { this.rec = [a.uid]; why = `${nm(a.uid)}에 두웅!! ${a.n}장을 붙여 파워를 올려요 (상대 리더 파워 ${E.power(G, db, O.leader)} 이상이면 어택이 성공해요)`; }
        else if (a.type === 'attack') { this.rec = [a.uid, a.target]; why = `${nm(a.uid)}(파워 ${E.power(G, db, a.uid)})로 ${a.target === O.leader ? '상대 리더' : nm(a.target)}(파워 ${E.power(G, db, a.target)})를 어택해 보세요`; }
        else if (a.type === 'activate') { this.rec = [a.uid]; why = `${nm(a.uid)}의 효과를 발동할 수 있어요`; }
        else why = '더 할 게 없으면 <b>턴 종료</b>를 눌러요';
        h += `<div class="recline">추천: ${why}</div>`;
        if (this.o.coach && this.plan && this.plan.length > 1) h += `<div class="plan"><b>이번 턴 추천 순서</b>${this.plan.map((p, k) => `<div>${'①②③④⑤⑥⑦⑧'[k]} ${esc(p.text)}</div>`).join('')}</div>`;
        if (this.o.coach) {
          const rows = P.hand.filter(u => L.play.includes(u)).map(u => { const ev = this.evalOf(u); const c = this.cardOf(u); const r = ev.grade === 'meh' ? ev.bad[0] : (ev.good[0] || ev.info[0] || roleOf(db, c).role); return `<div class="hrow ${ev.grade}"><span class="g">${ev.grade === 'good' ? '추천' : ev.grade === 'meh' ? '별로' : '가능'}</span> <b>${esc(c.name)}</b> <span class="mut">${esc(r || '')}</span></div>`; });
          if (rows.length) h += `<div class="plan"><b>지금 낼 수 있는 카드, 내면 어떨까?</b>${rows.join('')}</div>`;
        }
        h += `<div class="mut" style="font-size:11px">초록 = 추천/가능 · 노랑 = 낼 순 있지만 지금은 별로 · 빨강 = 못 내는 이유 · 숫자 = 추천 순서 · 카드에 마우스를 올리면 자세한 이유</div>`;
      }
    } catch (e) { console.warn(e); }
    this.asEl.innerHTML = h ? `<div class="assistbox">${h}</div>` : '';
  }
  preview(uid) {
    if (!this.o.assist) return;
    const c = this.cardOf(uid); if (!c) { this.pvEl.style.display = 'none'; return; }
    let ex; try { ex = explainCard(c.no, this.db.effects, this.db.list || [...this.db.cards.values()]); } catch { ex = null; }
    const eff = E.effectsOf(this.db, c.no);
    const tips = [...new Set(eff.abilities.flatMap(a => tipsFor(a, [])).concat(tipsFor(null, eff.keywords || [])))].slice(0, 3);
    const g = this.db.glossary || {};
    this.pvEl.style.display = '';
    this.pvEl.innerHTML = `<div class="pvh"><img src="${imgSrc(c)}"><div><b>${esc(c.name)}</b><div class="mut" style="font-size:11px">${c.type === 'leader' ? '리더' : c.type === 'event' ? '이벤트' : c.type === 'stage' ? '스테이지' : '캐릭터'} · ${c.cost != null ? '코스트 ' + c.cost + ' · ' : ''}파워 ${c.power ?? '-'}${c.counter ? ' · 카운터 +' + c.counter : ''}</div></div></div>
      ${(ex?.keywords || []).map(k => `<div class="pvl"><b class="kwh">【${esc(String(k.name).replace(/[【】\[\]]/g, ''))}】</b> ${esc(k.text)}</div>`).join('')}
      ${(ex?.abilities || []).map(a => `<div class="pvl">${glossify(easySentence(a.sentence), g)}</div>`).join('') || (c.text ? '' : '<div class="pvl mut">효과 없는 카드예요. 파워와 코스트로 싸워요</div>')}
      ${tips.length ? `<div class="pvtips">${tips.map(t => `<div>팁: ${esc(t)}</div>`).join('')}</div>` : ''}
      ${this.nowBox(uid, c)}`;
  }
  nowBox(uid, c) {
    const G = this.G, i = G.cards[uid];
    if (!this.o.coach || !i || i.owner !== this.me) return '';
    const r = roleOf(this.db, c);
    let h = `<div class="nowbox"><div class="mut">${esc(r.line)}</div>${r.role ? `<div>어떤 카드? ${esc(r.role)}</div>` : ''}`;
    if (i.zone === 'hand' && this.isMyMain()) {
      const L = this.legal || { play: [] };
      if (!L.play.includes(uid)) {
        const cost = E.costOf(G, this.db, uid), don = G.players[this.me].donActive;
        h += `<div class="nb bad">지금은 못 내요: ${c.type === 'event' && !E.effectsOf(this.db, c.no).abilities.some(a => a.timing === 'main') ? '상대가 공격할 때(카운터) 쓰는 카드예요' : cost > don ? `두웅!!이 ${cost - don}장 모자라요` : '조건이 안 돼요'}</div>`;
      } else {
        const ev = this.evalOf(uid);
        h += `<div class="nb ${ev.grade}">${ev.grade === 'good' ? '지금 내기 좋아요' : ev.grade === 'meh' ? '낼 순 있지만 지금은 별로예요' : '낼 수 있어요'}</div>`;
        h += [...ev.good.map(x => `<div class="nl good">+ ${esc(x)}</div>`), ...ev.bad.map(x => `<div class="nl bad">- ${esc(x)}</div>`), ...ev.info.map(x => `<div class="nl">· ${esc(x)}</div>`)].join('');
      }
    }
    return h + '</div>';
  }
  async pointer(fromUid, toUid, label, color, oldRect) {
    const na = this.el.querySelector(`[data-uid="${fromUid}"]`);
    const ra = na ? na.getBoundingClientRect() : this.rects[fromUid];
    const nb = this.el.querySelector(`[data-uid="${toUid}"]`);
    const rb = (nb && nb.offsetParent ? nb.getBoundingClientRect() : null) || oldRect || this.rects[toUid];
    if (!ra || !rb || fromUid === toUid) return false;
    if (!nb || !nb.offsetParent || !this.el.contains(nb)) {
      // 필드를 떠난 카드: 원래 자리에 반투명 잔상 + X 표시
      const c = this.cardOf(toUid);
      const gh = document.createElement('div'); gh.className = 'flyer';
      Object.assign(gh.style, { left: rb.left + 'px', top: rb.top + 'px', width: rb.width + 'px', height: rb.height + 'px', opacity: '.9', transition: 'opacity .6s' });
      gh.innerHTML = (c ? `<img src="${imgSrc(c)}">` : '') + `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:900;color:${color};text-shadow:0 2px 8px #000">✕</div>`;
      document.body.appendChild(gh);
      setTimeout(() => { gh.style.opacity = '0'; }, 1500 * this.o.speed); setTimeout(() => gh.remove(), 2200 * this.o.speed);
    }
    const x1 = ra.left + ra.width / 2, y1 = ra.top + ra.height / 2, x2 = rb.left + rb.width / 2, y2 = rb.top + rb.height / 2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'arrow');
    const len = Math.hypot(x2 - x1, y2 - y1);
    svg.innerHTML = `<defs><marker id="ph" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="${color}"/></marker></defs><circle cx="${x1}" cy="${y1}" r="8" fill="${color}" opacity=".85"/><path d="M${x1},${y1} Q${(x1 + x2) / 2 - 50},${(y1 + y2) / 2 - 30} ${x2},${y2}" stroke="${color}" stroke-width="4" fill="none" stroke-dasharray="10 6" marker-end="url(#ph)"><animate attributeName="stroke-dashoffset" from="${len}" to="0" dur="0.5s" fill="freeze"/></path><rect x="${x2 - 44}" y="${y2 - 46}" rx="6" width="88" height="22" fill="#0b1220" stroke="${color}"/><text x="${x2}" y="${y2 - 30}" fill="${color}" font-size="12" font-weight="800" text-anchor="middle">${esc(label)}</text>`;
    document.body.appendChild(svg);
    setTimeout(() => svg.remove(), 2200 * this.o.speed);
    await sleep(900 * this.o.speed);
    return true;
  }
  isMyMain() { const G = this.G; return G && G.winner === null && G.active === this.me && G.phase === 'main' && !G.pending && !G.queue.length && !G.battle && !this.busy; }
  renderCtrl(pend) {
    const box = this.el.querySelector('.ctrl'); const G = this.G;
    if (this.busy) { box.innerHTML = '<span class="mut">연출 중…</span>'; return; }
    if (pend) {
      const t = esc(pend.text || '');
      let btns = '';
      if (pend.type === 'mulligan') btns = `<button class="pri" data-a="keep">이대로 시작</button><button data-a="redraw">다시 뽑기</button>`;
      else if (pend.type === 'yesno') btns = `<button class="pri" data-a="yes">예</button><button data-a="no">아니오</button>`;
      else if (pend.type === 'trigger') btns = `<button class="pri" data-a="tyes">트리거 발동</button><button data-a="tno">패에 넣기</button>`;
      else if (pend.type === 'block') btns = `<span class="mut">빛나는 블로커를 누르면 막아요</span><button data-a="noblock">막지 않기</button>`;
      else if (pend.type === 'counter') btns = `<span class="mut">빛나는 패 카드를 누르면 카운터로 써요</span><button class="pri" data-a="nocounter">카운터 끝</button>`;
      else if (pend.type === 'target' || pend.type === 'search') btns = `<span class="mut">${this.picks.length}/${pend.max}장 선택${pend.min ? ` (최소 ${pend.min})` : ''}</span><button class="pri" data-a="choose" ${this.picks.length < (pend.min || 0) ? 'disabled' : ''}>확인</button>`;
      else if (pend.type === 'option') btns = pend.options.map((o, k) => `<button class="pri" data-opt="${k}">${esc(o.map(x => { try { return actionText(x); } catch { return x.do; } }).join(' → '))}</button>`).join('');
      else if (pend.type === 'manual') btns = `<span class="mut">카드를 눌러 '수동 조작'으로 처리한 뒤</span><button class="pri" data-a="mdone">처리 완료</button>`;
      box.innerHTML = `<div class="prompt"><div class="t">${t}</div>${btns}</div>`;
      if (pend.type === 'search') this.showSearch(pend);
    } else if (G.pending) {
      box.innerHTML = `<span class="mut">상대가 선택 중…</span>`;
    } else if (this.isMyMain()) {
      box.innerHTML = `${this.sel?.mode === 'attack' ? '<span class="mut">빨갛게 빛나는 대상을 누르세요</span><button data-a="cancel">취소</button>' : ''}<button class="pri" data-a="end">턴 종료</button>`;
    } else box.innerHTML = G.winner === null ? '<span class="mut">상대 차례…</span>' : '';
    box.querySelectorAll('button[data-a]').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.onCtrl(b.dataset.a); });
    box.querySelectorAll('button[data-opt]').forEach(b => b.onclick = (e) => { e.stopPropagation(); this.send({ type: 'option', index: +b.dataset.opt }); });
  }
  showSearch(pend) {
    // 덱 위 카드 보기 패널
    const wrap = document.createElement('div'); wrap.className = 'prompt'; wrap.style.marginTop = '6px';
    wrap.innerHTML = `<div class="t">덱 위에서 본 카드 (빛나는 카드만 가져올 수 있어요)</div><div class="zone" style="flex-wrap:wrap">${pend.looked.map(u => { const c = this.cardOf(u); return `<div class="card ${pend.options.includes(u) ? 'opt' : ''} ${this.picks.includes(u) ? 'picked' : ''}" data-uid="${u}" style="opacity:${pend.options.includes(u) ? 1 : .5}"><img src="${imgSrc(c)}"></div>`; }).join('')}</div>`;
    this.el.querySelector('.ctrl').appendChild(wrap);
  }

  // ---------- 상태 갱신 + 연출 ----------
  async update(G, events = []) {
    this.captureRects();
    const prev = this.G; this.G = G; this.picks = []; this.sel = null; this.closeMenu();
    this.busy = true; this.render();
    try { await this.animate(events, prev); } catch (e) { console.warn(e); }
    this.busy = false; this.render();
  }
  async animate(events, prev) {
    const sp = this.o.speed;
    // 1) 이동 (FLIP 고스트)
    const moves = events.filter(e => e.t === 'move' || e.t === 'draw');
    const ghosts = [];
    for (const e of moves) {
      const from = this.rects[e.uid] || this.pileRects[(e.t === 'draw' ? 'deck' : (e.from === 'deck' ? 'deck' : e.from === 'life' ? 'life' : e.from === 'trash' ? 'trash' : 'hand')) + (e.p ?? e.owner)];
      const toEl = this.el.querySelector(`[data-uid="${e.uid}"]`) || this.el.querySelector(`[data-pile="${({ trash: 'trash', deck: 'deck', life: 'life', hand: 'hand' })[e.to] || 'trash'}${e.owner ?? e.p}"]`);
      if (!from || !toEl) continue;
      const to = toEl.getBoundingClientRect();
      const c = this.cardOf(e.uid);
      const g = document.createElement('div'); g.className = 'flyer';
      Object.assign(g.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
      g.innerHTML = c ? `<img src="${imgSrc(c)}">` : '<div class="card back" style="width:100%;height:100%"></div>';
      document.body.appendChild(g); ghosts.push([g, to]);
      if (toEl.dataset.uid) toEl.style.visibility = 'hidden';
    }
    if (ghosts.length) {
      await sleep(30);
      ghosts.forEach(([g, to]) => Object.assign(g.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' }));
      await sleep(480 * sp);
      ghosts.forEach(([g]) => g.remove());
      this.el.querySelectorAll('[data-uid]').forEach(n => n.style.visibility = '');
    }
    // 2) 순차 연출
    const PT = { power: e => (e.amount ?? 0) >= 0 ? `파워 +${e.amount}` : `파워 ${e.amount}`, ko: () => 'KO!', rest: () => '레스트', active: () => '액티브', grant: e => ({ blocker: '블로커', rush: '속공', doubleAttack: '더블 어택', banish: '배니시', cannotAttack: '어택 불가', cannotBlock: '블록 불가', unblockable: '블록 불가' }[e.keyword] || '효과 부여'), cost: e => `코스트 ${e.amount > 0 ? '+' : ''}${e.amount}`, negate: () => '효과 무효', attach: () => '두웅!! 부여' };
    for (const e of events) {
      const dupKO = e.t === 'move' && events.some(x => x.t === 'ko' && x.uid === e.uid);
      if (this.o.assist && e.by && !dupKO && (PT[e.t] || (e.t === 'move' && ['chars', 'stage'].includes(e.from) && e.uid !== e.by))) {
        const label = PT[e.t] ? PT[e.t](e) : ({ hand: '패로', trash: '트래시로', deck: '덱으로', life: '라이프로' }[e.to] || '이동');
        const tgt = e.uid; if (tgt && tgt !== e.by) await this.pointer(e.by, tgt, label, e.t === 'power' && e.amount > 0 ? '#3ddc97' : e.t === 'attach' || e.t === 'grant' ? '#ffb020' : '#ff7ad1', this.rects[tgt]);
      }
      if (e.t === 'log') { this.addLog(e.text, e.p); continue; }
      if (e.t === 'ability') { await this.showAbility(e); continue; }
      if (e.t === 'attack') { await this.arrow(e.attacker, e.target, '#ff5d6c'); continue; }
      if (e.t === 'block') { await this.arrow(e.uid, e.attacker, '#3fb6ff', '블록!'); continue; }
      if (e.t === 'power' || e.t === 'counter') { this.floatAt(e.target || e.uid, (e.amount ?? 0) >= 0 ? `+${e.amount ?? ''}` : `${e.amount}`, (e.amount ?? 0) >= 0 ? 'var(--good)' : 'var(--bad)', e.set != null ? `원래 파워 ${e.set}` : null); this.stepHL('power'); await sleep(650 * sp); continue; }
      if (e.t === 'attach') { this.floatAt(e.uid, `두웅!! +1000`, 'var(--acc)'); await sleep(300 * sp); continue; }
      if (e.t === 'clash') { this.floatAt(e.target, `${e.ap} vs ${e.tp}`, e.win ? 'var(--bad)' : 'var(--good)'); await sleep(800 * sp); continue; }
      if (e.t === 'damage') { const n = this.el.querySelector(`[data-pile="life${e.p}"]`); if (n) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); } this.floatPile(`life${e.p}`, '대미지!', 'var(--bad)'); await sleep(600 * sp); continue; }
      if (e.t === 'ko') { this.floatPile(`trash${e.owner}`, 'KO', 'var(--bad)'); await sleep(350 * sp); continue; }
      if (e.t === 'trigger') { this.floatPile(`life${e.p}`, '트리거!', 'var(--acc)'); await sleep(500 * sp); continue; }
      if (e.t === 'rest') { this.floatAt(e.uid, '레스트', 'var(--mut)'); await sleep(300 * sp); continue; }
      if (e.t === 'active') { this.floatAt(e.uid, '액티브', 'var(--good)'); await sleep(300 * sp); continue; }
      if (e.t === 'grant') { this.floatAt(e.uid, ({ blocker: '블로커', rush: '속공', doubleAttack: '더블 어택', banish: '배니시', cannotAttack: '어택 불가', cannotBlock: '블록 불가', unblockable: '블록 불가 공격' })[e.keyword] || e.keyword, 'var(--acc)'); await sleep(450 * sp); continue; }
      if (e.t === 'cost') { this.floatAt(e.uid, `코스트 ${e.amount > 0 ? '+' : ''}${e.amount}`, 'var(--pur)'); await sleep(450 * sp); continue; }
      if (e.t === 'don' && (e.add || e.ret)) { this.floatPile(`don${e.p}`, e.add ? `두웅!! +${e.add}` : `두웅!! -${e.ret}`, 'var(--acc)'); await sleep(250 * sp); continue; }
      if (e.t === 'life' && e.delta > 0 && e.delta < 3) { this.floatPile(`life${e.p}`, `라이프 +${e.delta}`, 'var(--good)'); await sleep(350 * sp); continue; }
      if (e.t === 'turn') { this.toast(`${e.turn}턴 · ${this.G.players[e.p].name}`); await sleep(500 * sp); continue; }
      if (e.t === 'manual') { this.toast('자동 처리 안 되는 효과 → 수동 처리'); continue; }
      if (e.t === 'gameover') { continue; }
    }
  }
  addLog(text, p) {
    if (!text) return;
    const d = document.createElement('div'); d.className = p == null ? '' : 'p' + (p === this.me ? 0 : 1); d.textContent = text;
    this.logEl.appendChild(d); this.logEl.scrollTop = 1e9;
  }
  async showAbility(e) {
    const c = this.C(e.no); if (!c) return;
    const eff = E.effectsOf(this.db, e.no);
    const ab = eff.abilities.find(a => a.src === e.src) || eff.abilities[0];
    let ex = null; try { ex = ab ? explainAbility(ab, c) : null; } catch (err) { ex = null; }
    const who = e.p === this.me ? '내' : '상대';
    this.exEl.innerHTML = `<div class="head"><img src="${imgSrc(c)}"><div><div style="font-weight:700">${who} ${esc(c.name)}</div><div class="mut" style="font-size:12px">${esc(e.src || '')}</div></div></div>
      ${ex ? `<div style="margin-top:8px;font-weight:600;font-size:13px">${glossify(easySentence(ex.sentence), this.db.glossary)}</div>${ex.steps.map((s, k) => `<div class="stp step" data-k="${k}"><div class="l">${esc(s.label)}</div><div>${glossify(easySentence(s.text), this.db.glossary)}</div></div>`).join('')}${ex.manual ? '<div class="warn">일부는 자동 처리가 안 돼서 직접 처리해야 해요</div>' : ''}${this.o.assist ? tipsFor(ab, []).slice(0, 2).map(t => `<div class="pvtips" style="color:#ffd98a;font-size:12px;margin-top:4px">팁: ${esc(t)}</div>`).join('') : ''}` : ''}`;
    // 보드 중앙 배너
    const b = document.createElement('div'); b.className = 'banner';
    b.innerHTML = `<img src="${imgBig(c)}"><div><div class="tt">${who} 카드 효과 발동 · ${esc(ex?.when || '')}</div><div class="ss">${esc(ex ? easySentence(ex.sentence) : e.src)}</div><div class="st">${esc(e.src || '')}</div><div class="hint">클릭하면 넘어가요</div></div>`;
    this.el.appendChild(b);
    const steps = [...this.exEl.querySelectorAll('.stp')];
    const dur = (this.o.slow ? 3600 : 2100) * this.o.speed;
    let skip = false; b.onclick = () => { skip = true; };
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < dur && !skip) {
      steps.forEach((s, j) => s.classList.toggle('on', j === k));
      await sleep(Math.max(250, dur / Math.max(steps.length, 1)));
      k++; if (k >= steps.length) k = steps.length - 1;
    }
    steps.forEach(s => s.classList.add('on'));
    b.remove();
  }
  stepHL() { }
  floatAt(uid, text, color, sub) {
    const n = this.el.querySelector(`[data-uid="${uid}"]`); if (!n) return;
    const r = n.getBoundingClientRect(); this.float(r.left + r.width / 2, r.top + r.height / 3, text, color, sub);
  }
  floatPile(key, text, color) { const n = this.el.querySelector(`[data-pile="${key}"]`); if (!n) return; const r = n.getBoundingClientRect(); this.float(r.left + r.width / 2, r.top + r.height / 3, text, color); }
  float(x, y, text, color, sub) {
    const f = document.createElement('div'); f.className = 'float'; f.style.left = x + 'px'; f.style.top = y + 'px'; f.style.color = color;
    f.innerHTML = esc(text) + (sub ? `<div style="font-size:12px">${esc(sub)}</div>` : ''); document.body.appendChild(f); setTimeout(() => f.remove(), 1300);
  }
  toast(text) { const r = this.el.getBoundingClientRect(); this.float(r.left + r.width / 2, r.top + r.height / 2, text, 'var(--fg)'); }
  async arrow(a, b, color, label) {
    const na = this.el.querySelector(`[data-uid="${a}"]`), nb = this.el.querySelector(`[data-uid="${b}"]`); if (!na || !nb) return;
    const ra = na.getBoundingClientRect(), rb = nb.getBoundingClientRect();
    const x1 = ra.left + ra.width / 2, y1 = ra.top + ra.height / 2, x2 = rb.left + rb.width / 2, y2 = rb.top + rb.height / 2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'arrow');
    const len = Math.hypot(x2 - x1, y2 - y1);
    svg.innerHTML = `<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="${color}"/></marker></defs><path d="M${x1},${y1} Q${(x1 + x2) / 2 + 40},${(y1 + y2) / 2} ${x2},${y2}" stroke="${color}" stroke-width="5" fill="none" marker-end="url(#ah)" stroke-dasharray="${len * 1.3}" stroke-dashoffset="${len * 1.3}"><animate attributeName="stroke-dashoffset" to="0" dur="0.35s" fill="freeze"/></path>`;
    document.body.appendChild(svg);
    if (label) this.float(x2, y2, label, color);
    await sleep(900 * this.o.speed); svg.remove();
  }

  // ---------- 입력 ----------
  async send(action) {
    try { await this.o.send(action); }
    catch (e) { this.float(window.innerWidth / 2, window.innerHeight / 2, e.message || String(e), 'var(--bad)'); }
  }
  onCtrl(a) {
    const pend = this.G.pending;
    const m = {
      keep: { type: 'mulligan', redraw: false }, redraw: { type: 'mulligan', redraw: true }, yes: { type: 'yesno', yes: true }, no: { type: 'yesno', yes: false },
      tyes: { type: 'trigger', use: true }, tno: { type: 'trigger', use: false }, noblock: { type: 'block', uid: null }, nocounter: { type: 'counter', uid: null },
      choose: { type: 'choose', uids: this.picks }, mdone: { type: 'manualDone' }, end: { type: 'endTurn' },
    };
    if (a === 'cancel') { this.sel = null; this.render(); return; }
    if (m[a]) this.send(m[a]);
  }
  onClick(e) {
    this.hideZoom();
    const n = e.target.closest('[data-uid]');
    if (e.target.closest('.ctrl button')) return;
    if (!n || !n.dataset.uid || !this.G || this.busy) { if (e.target.closest('[data-trash]')) this.showTrash(+e.target.closest('[data-trash]').dataset.trash); return; }
    const uid = n.dataset.uid; const G = this.G; const me = this.me;
    const pend = G.pending && G.pending.p === me ? G.pending : null;
    if (pend) {
      if ((pend.type === 'target' || pend.type === 'search') && pend.options.includes(uid)) {
        if (this.picks.includes(uid)) this.picks = this.picks.filter(x => x !== uid);
        else if (this.picks.length < pend.max) this.picks.push(uid);
        else if (pend.max === 1) this.picks = [uid];
        this.render(); return;
      }
      if (pend.type === 'block' && pend.options.includes(uid)) { this.send({ type: 'block', uid }); return; }
      if (pend.type === 'counter' && pend.options.includes(uid)) { this.send({ type: 'counter', uid }); return; }
      if (pend.type === 'manual') { this.openMenu(n, uid, true); return; }
    }
    if (this.sel?.mode === 'attack') {
      if (E.attackTargets(G, this.db, this.sel.uid).includes(uid)) { const a = this.sel.uid; this.sel = null; this.send({ type: 'attack', uid: a, target: uid }); return; }
      this.sel = null; this.render();
    }
    this.openMenu(n, uid, false);
  }
  closeMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } }
  openMenu(node, uid, manualOnly) {
    this.closeMenu();
    const G = this.G, me = this.me, i = G.cards[uid]; if (!i || i.hidden) return;
    const c = this.C(i.no); const L = this.legal || { play: [], attack: [], activate: [] };
    const items = [];
    if (!manualOnly && this.isMyMain() && i.owner === me) {
      if (L.play.includes(uid)) items.push([c.type === 'event' ? `이벤트 사용 (코스트 ${E.costOf(G, this.db, uid)})` : `내기 (코스트 ${E.costOf(G, this.db, uid)})`, () => this.playCard(uid)]);
      if (L.attack.includes(uid)) items.push(['어택하기', () => { this.sel = { mode: 'attack', uid }; this.render(); }]);
      if ((G.players[me].leader === uid || G.players[me].chars.includes(uid)) && G.players[me].donActive > 0) {
        items.push(['두웅!! 1장 붙이기 (+1000)', () => this.send({ type: 'attachDon', uid, n: 1 })]);
        if (G.players[me].donActive > 1) items.push([`두웅!! 전부 붙이기 (+${G.players[me].donActive}000)`, () => this.send({ type: 'attachDon', uid, n: G.players[me].donActive })]);
      }
      L.activate.filter(x => x.uid === uid).forEach(x => { const ab = E.effectsOf(this.db, i.no).abilities[x.i]; items.push([`${x.event ? '상황 효과(조건 맞을 때 직접)' : '효과 발동'}: ${(ab.src || '').replace(/【[^】]+】/g, '').slice(0, 22)}…`, () => this.send({ type: 'activate', uid, i: x.i })]); });
    }
    items.push(['카드 설명 보기', () => this.o.onCardInfo && this.o.onCardInfo(i.no)]);
    const canManual = this.G.sandbox || (G.pending && G.pending.type === 'manual' && G.pending.p === me);
    if (canManual) {
      const z = i.zone;
      const ops = z === 'hand' ? ['play', 'handToTrash', 'handToLife', 'deckBottom'] : z === 'trash' ? ['trashToHand', 'play', 'deckBottom'] : ['ko', 'bounce', 'deckBottom', 'deckTop', 'rest', 'activeSet', 'powerUp', 'powerDown', 'attachDon', 'trash'];
      items.push(['— 수동 조작 —', null]);
      ops.forEach(op => items.push([E.MANUAL_OPS[op], () => this.send({ type: 'manual', op, uid })]));
      items.push([E.MANUAL_OPS.draw, () => this.send({ type: 'manual', op: 'draw' })]);
      items.push([E.MANUAL_OPS.addDon, () => this.send({ type: 'manual', op: 'addDon' })]);
      items.push([E.MANUAL_OPS.returnDon, () => this.send({ type: 'manual', op: 'returnDon' })]);
      items.push([E.MANUAL_OPS.lifeToHand + ' (이 카드 주인)', () => this.send({ type: 'manual', op: 'lifeToHand', uid })]);
    }
    const m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = `<div class="h">${esc(c.name)} · ${c.no}</div>`;
    for (const [label, fn] of items) {
      if (!fn) { const h = document.createElement('div'); h.className = 'h'; h.textContent = label; m.appendChild(h); continue; }
      const b = document.createElement('button'); b.textContent = label; b.onclick = (ev) => { ev.stopPropagation(); this.closeMenu(); fn(); }; m.appendChild(b);
    }
    document.body.appendChild(m);
    const r = node.getBoundingClientRect();
    const mh = m.offsetHeight, mw = m.offsetWidth;
    let top = r.top + window.scrollY - mh - 6; if (top < window.scrollY + 60) top = r.bottom + window.scrollY + 6;
    m.style.top = top + 'px'; m.style.left = Math.min(window.innerWidth - mw - 10, Math.max(10, r.left + r.width / 2 - mw / 2)) + 'px'; m.style.position = 'absolute';
    this.menu = m;
  }
  playCard(uid) {
    const G = this.G, me = this.me, P = G.players[me]; const c = this.cardOf(uid);
    if (c.type === 'character' && P.chars.length >= E.MAX_CHARS) {
      // 교체할 캐릭터 선택
      this.toast('캐릭터는 5장까지! 트래시로 보낼 캐릭터를 누르세요');
      const handler = (ev) => { const n = ev.target.closest('[data-uid]'); if (!n || !P.chars.includes(n.dataset.uid)) return; ev.stopPropagation(); this.el.removeEventListener('click', handler, true); this.send({ type: 'play', uid, replace: n.dataset.uid }); };
      this.el.addEventListener('click', handler, true);
      return;
    }
    this.send({ type: 'play', uid });
  }
  showTrash(p) {
    const P = this.G.players[p];
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><button class="x ghost">닫기</button><h2>${esc(P.name)} 트래시 (${P.trash.length})</h2><div class="decklist">${P.trash.map(u => { const c = this.cardOf(u); return c ? `<div class="cthumb" data-no="${c.no}"><img src="${imgSrc(c)}"></div>` : ''; }).join('')}</div></div>`;
    bg.onclick = (e) => { if (e.target === bg || e.target.closest('.x')) bg.remove(); const t = e.target.closest('[data-no]'); if (t) { bg.remove(); this.o.onCardInfo && this.o.onCardInfo(t.dataset.no); } };
    document.body.appendChild(bg);
  }
}

// 로컬 컨트롤러: 엔진 직접 실행 + AI 자동 진행
export class LocalMatch {
  constructor(board, db, G, { aiDelay = 700, onEvents } = {}) {
    this.b = board; this.db = db; this.G = G; this.aiDelay = aiDelay; this.onEvents = onEvents; this.stopped = false;
    board.o.send = (a) => this.act(board.me, a);
  }
  async start() { await this.b.update(this.G, this.G.events || []); this.loop(); }
  async act(p, a) {
    if (this.stopped) return;
    E.apply(this.G, this.db, p, a);
    const evs = this.G.events; this.G.events = [];
    this.onEvents && this.onEvents(a, evs, p);
    await this.b.update(this.G, evs);
    this.loop();
  }
  async loop() {
    if (this.looping || this.stopped) return; this.looping = true;
    try {
      while (!this.stopped && this.G.winner === null) {
        let acted = false;
        for (const p of [0, 1]) {
          if (!this.G.ai[p]) continue;
          while (this.hold && !this.stopped) await sleep(150);
          const a = E.aiStep(this.G, this.db, p);
          if (!a) continue;
          await sleep(this.aiDelay * this.b.o.speed);
          try { E.apply(this.G, this.db, p, a); }
          catch (err) { console.warn('AI action failed', a, err.message); try { E.apply(this.G, this.db, p, this.G.pending ? (this.G.pending.type === 'counter' ? { type: 'counter', uid: null } : { type: 'manualDone' }) : { type: 'endTurn' }); } catch (e2) { console.error(e2); this.stopped = true; } }
          const evs = this.G.events; this.G.events = [];
          this.onEvents && this.onEvents(a, evs, p);
          await this.b.update(this.G, evs);
          acted = true; break;
        }
        if (!acted) break;
      }
    } finally { this.looping = false; }
  }
  stop() { this.stopped = true; }
}
