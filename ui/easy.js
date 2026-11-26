// 초보자용 보조: 쉬운 말 바꾸기, 용어 툴팁, "왜 중요해요?" 팁
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 원문(카드 문장)을 조금 더 쉬운 말로 (수동 처리 문장 등에 사용)
const SWAP = [
  [/자신의 /g, '내 '], [/상대의 /g, '상대 '], [/1장까지/g, '최대 1장'], [/(\d+)장까지/g, '최대 $1장'],
  [/KO 시킨다/g, 'KO 시켜요(트래시로 보내요)'], [/등장시킨다/g, '필드에 내요'], [/부여한다/g, '붙여요'],
  [/레스트로 한다/g, '눕혀요(레스트)'], [/액티브로 한다/g, '세워요(액티브)'], [/패에 더한다/g, '손으로 가져와요'],
  [/주인의 패/g, '그 카드 주인의 손패'], [/트래시에 버린다/g, '트래시에 버려요'], [/버린다/g, '버려요'],
  [/원래 파워/g, '원래 파워(카드에 적힌 숫자)'], [/원래 코스트/g, '원래 코스트(카드에 적힌 숫자)'],
  [/두웅!! 덱으로 되돌린다/g, '두웅!! 덱으로 돌려보내요'], [/얻는다/g, '얻어요'], [/할 수 있다/g, '할 수 있어요(안 해도 돼요)'],
  [/이번 턴 동안/g, '이번 턴이 끝날 때까지'], [/이번 배틀 동안/g, '이번 배틀(싸움 1번) 동안만'], [/룰상,?/g, '규칙상'],
];
export function easyKo(t) { let s = String(t || ''); for (const [a, b] of SWAP) s = s.replace(a, b); return s; }
export function easySentence(sentence) {
  return String(sentence || '').replace(/미지원 효과: "([^"]+)"/g, (m, x) => `미지원 효과: "${easyKo(x)}"`);
}

// 용어 툴팁: 텍스트 안의 용어에 점선 밑줄 + 마우스 올리면 뜻
const TERMS = ['두웅!!', '레스트', '액티브', '카운터', '트리거', '블로커', '속공', '더블 어택', '배니시', 'KO', '라이프', '리더', '스테이지', '특징', '트래시', '코스트', '파워', '등장', '원래 파워', '패'];
export function glossify(text, glossary) {
  let h = esc(text);
  const keys = TERMS.filter(k => glossary && glossary[k]).sort((a, b) => b.length - a.length);
  if (!keys.length) return h;
  const re = new RegExp('(' + keys.map(k => k.replace(/[!.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
  const used = new Set();
  return h.replace(re, (m) => { if (used.has(m)) return m; used.add(m); return `<span class="term" data-tip="${esc(glossary[m])}">${m}</span>`; });
}

// 왜 중요한지 (초보 팁)
export function tipsFor(ab, keywords = []) {
  const tips = new Set();
  const steps = [...(ab?.steps || []), ...(ab?.cost || [])];
  for (const s of steps) {
    const opp = s.side === 'opp' || s.target?.side === 'opp';
    if (s.do === 'lifeToHand') tips.add(opp ? '상대 라이프가 1장 줄어요 → 승리에 가까워져요 (대신 상대 손패는 1장 늘어요)' : '내 라이프가 1장 줄어요 → 대신 그 카드를 손패로 써요. 라이프가 적을 땐 위험할 수 있어요');
    if (s.do === 'trashLife') tips.add(opp ? '상대 라이프가 줄어요 (트리거도 못 써요)' : '내 라이프가 줄어요. 라이프 0장에서 한 번 더 맞으면 져요');
    if (s.do === 'addLife') tips.add('라이프가 늘어나서 더 오래 버틸 수 있어요');
    if (s.do === 'ko') tips.add('상대 캐릭터를 없애면 그 캐릭터는 어택도 블록도 못 해요');
    if (s.do === 'power' && s.amount < 0) tips.add('상대 파워를 낮추면 내 어택이 이기기 쉬워지거나, 상대 어택이 약해져요');
    if (s.do === 'power' && s.amount > 0) tips.add('파워가 높을수록 어택에서 이기고, 맞을 때도 잘 버텨요');
    if (s.do === 'rest') tips.add('눕힌(레스트) 캐릭터는 이번에 어택·블록을 못 하고, 내가 어택할 수 있는 대상이 돼요');
    if (s.do === 'bounce') tips.add('패로 돌려보내면 상대는 다시 코스트를 내야 해요');
    if (s.do === 'draw') tips.add('손패가 늘어나서 할 수 있는 게 많아져요');
    if (s.do === 'search') tips.add('덱에서 필요한 카드를 찾아오는 효과예요');
    if (s.do === 'addDon' || s.do === 'attachDon') tips.add('두웅!!이 늘면 더 비싼 카드를 내거나 파워를 올릴 수 있어요');
    if (s.do === 'returnDon') tips.add(opp ? '상대 두웅!!이 줄어서 다음 턴에 할 수 있는 게 줄어요' : '두웅!!을 덱으로 돌려보내는 대가를 치르는 거예요');
    if (s.do === 'manual') tips.add('이 부분은 지원하지 않아서 게임 상태에 반영되지 않아요');
  }
  if (ab?.timing === 'trigger') tips.add('【트리거】: 내가 대미지를 받아 라이프에서 이 카드가 나오면, 손으로 가져가는 대신 공짜로 효과를 쓸 수 있어요');
  if (ab?.timing === 'counter') tips.add('【카운터】 이벤트: 상대 턴에 내가 어택당했을 때만 쓸 수 있어요');
  if (ab?.oncePerTurn) tips.add('【턴 1회】: 한 턴에 한 번만 쓸 수 있어요');
  if (ab?.donReq) tips.add(`【두웅!!×${ab.donReq}】: 이 카드에 두웅!!이 ${ab.donReq}장 이상 붙어 있어야 효과가 켜져요`);
  for (const k of keywords) {
    if (k === 'blocker') tips.add('【블로커】: 상대가 내 리더를 때릴 때, 이 캐릭터를 눕혀서 대신 맞을 수 있어요. 라이프를 지키는 방패예요');
    if (k === 'rush') tips.add('【속공】: 원래는 나온 턴에 어택 못 하지만, 이 카드는 바로 어택할 수 있어요');
    if (k === 'doubleAttack') tips.add('【더블 어택】: 리더를 맞히면 라이프를 2장 깎아요');
    if (k === 'banish') tips.add('【배니시】: 맞은 라이프가 손패가 아니라 트래시로 가요 (트리거도 못 써요)');
  }
  return [...tips];
}
