import { effectsOf } from '../engine/core.js?v=202611261902';
import { explainAbility, explainKeyword } from '../engine/explain.js?v=202611261902';
import { easySentence } from './easy.js?v=202611261902';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = (s, n = 100) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const zone = {chars:'캐릭터 영역',stage:'스테이지',leader:'리더',hand:'손패',deck:'덱',life:'라이프',trash:'트래시',limbo:'공개 영역'};
const signed = n => n > 0 ? '+' + n : String(n);
const side = (p, me) => p === me ? '내' : '상대';
const LIMIT = 8;

// Never reveal a private card's identity just because local practice has a full G.
function observed(e, b, batch) {
  const i = b.G.cards[e.target || e.uid];
  const publicZone = z => ['leader','chars','trash','stage'].includes(z);
  const visible = i && (publicZone(i.zone) || publicZone(e.from) || publicZone(e.to) || i.owner === b.me && i.zone === 'hand');
  const name = visible && !i.hidden ? b.C(i.no)?.name : null;
  const target = (i ? side(i.owner, b.me) + ' ' : '') + (name || '카드');
  const who = side(e.p, b.me);
  switch (e.t) {
    case 'manual': return '지원하지 않는 단계 · 미적용';
    case 'draw': return who + ' 1장 드로우';
    case 'power': case 'counter': return `${target} 파워 ${e.set == null ? signed(e.amount) : '기준값 ' + e.set}${e.now == null ? '' : ` (적용 직후 ${e.now})`}`;
    case 'ko': return target + ' KO';
    case 'cost': return `${target} 코스트 ${signed(e.amount)}`;
    case 'rest': return target + ' 레스트';
    case 'active': return target + ' 액티브';
    case 'attach': return `${target} 부착 두웅!! ${e.don}장`;
    case 'grant': return `${target} ${explainKeyword(e.keyword).name} 부여`;
    case 'negate': return target + ' 효과 무효';
    case 'move': {
      if (e.to === 'trash' && batch.some(x => x.t === 'ko' && x.uid === e.uid && x.by === e.by)) return '';
      return `${target}: ${zone[e.from] || '이전 영역'} → ${zone[e.to] || '다른 영역'}`;
    }
    case 'look': return `${who} 덱 위 ${e.uids?.length ?? 0}장 확인`;
    case 'lookLife': return who + ' 라이프 확인';
    case 'reveal': return '카드 1장 공개';
    case 'life': return `${who} 라이프 ${signed(e.delta)}`;
    case 'don': {
      for (const [key,verb] of [['add','추가'],['ret','반환'],['rest','레스트'],['activate','액티브']]) if (e[key] != null) return `${who} 두웅!! ${e[key]}장 ${verb}`;
    }
  }
  return '';
}

// Separate source-linked changes from ordinary draws, battle damage and other effects.
// One batch can start multiple abilities, or continue one after a pending choice.
export function collectEffects(events, b, previous = []) {
  const starts = new Map(), linked = new Map(previous.slice().reverse().map(r => [r.uid, r]));
  for (let k = 0; k < events.length; k++) {
    const e = events[k], i = b.G.cards[e.uid], p = e.p ?? i?.owner;
    const kind = e.t === 'ability' ? e.timing : e.t;
    const paired = ['trigger','event'].includes(e.t) && events.slice(k+1).some(x => x.t === 'ability' && x.uid === e.uid && x.timing === (e.t === 'trigger' ? 'trigger' : 'counter'));
    // The engine may ask the AI whether to use an optional ability in a later action.
    // In that case its actual 'ability' event is still queued, not a second activation.
    const queued = b.G.queue?.some(item => item.sys === 'abilityStart' && item.ctx?.src === e.uid && item.ab?.timing === (e.t === 'trigger' ? 'trigger' : 'counter'));
    const fallback = !paired && !queued && (e.t === 'trigger' || e.t === 'event' && b.G.battle && b.G.battle.p !== p);
    if (e.t === 'ability' || e.t === 'counter' || fallback || (e.t === 'manual' && !e.by && !starts.size)) {
      const no = e.no || i?.no, c = no && b.C(no), timing = e.t === 'event' ? 'counter' : kind;
      const abs = no ? effectsOf(b.db, no).abilities : [];
      const ab = abs.find(a => a.timing === timing && (!e.src || a.src === e.src));
      const counter = e.t === 'counter';
      let ex;
      if (ab) { try { ex = explainAbility({...ab, cost:ab.cost || [],steps:ab.steps || []}, c); } catch { /* prefer source over guessing */ } }
      const raw = counter ? `카운터 +${e.amount}` : e.src || ab?.src || (timing === 'trigger' ? c?.trigger : '') || e.text || '';
      const expected = counter ? `이번 배틀 동안 방어 카드의 파워를 ${e.amount} 올려요.` : easySentence(ex?.result || raw || '효과 내용은 카드 원문을 확인하세요.');
      const r = { uid:e.uid, p, no, perspective:p === b.me ? '내 기준' : b.o?.mode === 'practice' ? 'AI 기준' : '상대 기준', name:c?.name || '카드', who:side(p,b.me), timing, when:ex?.when || ({trigger:'라이프에서 트리거 발동',counter:'상대 어택의 카운터 스텝',manual:'미지원 단계'}[timing] || '효과 발동'), expected, raw,
        rules:(ex?.steps || []).filter(s => !s.label.startsWith('효과') && s.label !== '언제'), actual:[], turn:b.G.turn };
      if (counter || e.t === 'manual') r.actual.push(observed(e,b,events));
      starts.set(e,r); linked.set(e.uid,r);
    } else {
      const r = linked.get(e.by); if (!r) continue;
      const change = observed(e,b,events); if (change) r.actual.push(change);
    }
  }
  const next = b.G.queue?.[0], pending = b.G.pending;
  const waitingSource = pending?.src || next?.ctx?.src;
  for (const r of linked.values()) {
    r.awaiting = pending && waitingSource === r.uid ? side(pending.p,b.me) + ' 선택을 기다리고 있어요.' : '';
  }
  return starts;
}

const actualText = r => {
  const counts = new Map(); for (const s of r.actual) counts.set(s,(counts.get(s)||0)+1);
  return [...counts].map(([s,n]) => s + (n>1 ? ` ×${n}` : '')).join(' · ') || r.awaiting || '이 효과에 연결된 변화 기록이 없어요.';
};

export class EffectReader {
  constructor(el) { this.el = el; this.records = []; this.wait = null; this.closed = false; this.paint(); }
  paint() {
    const [r,...older] = this.records, el = this.el;
    el.dataset.waiting = String(!!this.wait);
    const stat = this.wait ? '확인 대기' : r ? '최근 발동' : '대기';
    const actual = r && actualText(r);
    el.innerHTML = `<header><h3>효과 읽기</h3><span class="er-status">${stat}</span></header>` + (!r ? '<p class="mut">카드 효과가 발동하면 여기에 남아요.</p>' : `
      <div class="er-current" aria-live="polite"><strong>${esc(r.who)} · ${esc(r.name)}</strong><small>${esc(r.when)}</small>
      <p><b>카드 효과 · ${esc(r.perspective)}</b> ${esc(short(r.expected))}</p><p><b>실제 기록</b> ${esc(short(actual))}</p></div>
      ${this.wait ? '<button type="button" class="pri" data-reader-continue>읽었어 · 계속</button>' : ''}
      <details data-reader-details><summary>원문 · 적용 규칙</summary>
      <dl><dt>출처</dt><dd>${esc(r.name)} ${esc(r.no)}</dd>${r.raw ? `<dt>카드 원문</dt><dd>${esc(r.raw)}</dd>` : ''}
      ${r.expected !== short(r.expected) ? `<dt>전체 효과</dt><dd>${esc(r.expected)}</dd>` : ''}
      ${r.rules.map(s => `<dt>${esc(s.label)}</dt><dd>${esc(s.text)}</dd>`).join('')}
      ${actual !== short(actual) ? `<dt>전체 기록</dt><dd>${esc(actual)}</dd>` : ''}</dl>
      <p class="mut">카드 효과는 발동한 플레이어 기준이에요. 실제 기록은 게임에서 확인된 변화만 보여줘요. 선택이 남았다면 효과를 읽고 보드에서 선택하세요.</p></details>
      ${older.length ? `<details data-reader-history><summary>이전 효과 ${older.length}개</summary><ol>${older.map(h=>`<li><b>${esc(h.who)} · ${esc(h.name)}</b><small>${esc(h.turn)}턴 · ${esc(h.when)}</small><p>${esc(h.perspective)}: ${esc(h.expected)}</p><p>실제 기록: ${esc(actualText(h))}</p></li>`).join('')}</ol></details>` : ''}`);
  }
  async show(r, pause) {
    if (this.closed) return false;
    this.records.unshift(r); this.records.length = Math.min(this.records.length,LIMIT);
    if (!pause) { this.paint(); return true; }
    let finish; const gate = new Promise(resolve => { finish = resolve; });
    this.wait = finish; this.paint();
    const btn = this.el.querySelector('[data-reader-continue]');
    btn.onclick = () => { if (this.wait !== finish) return; this.wait = null; btn.disabled = true; this.paint(); finish(true); };
    btn.focus({preventScroll:true});
    // Scroll only to the reader, never to the log, coach, or a card.
    this.el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    return gate;
  }
  close() { this.closed = true; const finish = this.wait; this.wait = null; if (finish) { this.paint(); finish(false); } }
}
