// 효과 DSL -> 초보자용 쉬운 한국어 풀이 ("~해요" 체). 브라우저/Node 공용, 의존성 없음.
// 사용: explainAbility(ability, card) / explainCard(cardNo, effects, cards)

const ZONE = { leader: '리더', character: '캐릭터', leaderOrCharacter: '리더나 캐릭터', leaderOrStage: '리더나 스테이지', stage: '스테이지', event: '이벤트', card: '카드', don: '두웅!!', hand: '패', trash: '트래시' };
const COLOR = { red: '빨강(적)', green: '초록(녹)', blue: '파랑(청)', purple: '보라(자)', black: '검정(흑)', yellow: '노랑(황)' };
const KW = {
  blocker: '【블로커】', rush: '【속공】', rushCharacter: '【속공: 캐릭터】', doubleAttack: '【더블 어택】', banish: '【배니시】', unblockable: '【블록 불가】',
  cannotAttack: '어택할 수 없음', cannotBlock: '블록할 수 없음', cannotBeRested: '레스트되지 않음', cannotBeKOd: 'KO 당하지 않음',
  cannotBeKOdByEffect: '효과로 KO 당하지 않음', cannotBeKOdByOppEffect: '상대 효과로 KO 당하지 않음', cannotBeKOdInBattle: '배틀로 KO 당하지 않음',
  canAttackActive: '액티브 상태 캐릭터도 어택 가능', cannotLeaveFieldByOppEffect: '상대 효과로 필드를 벗어나지 않음', cannotLeaveFieldByEffect: '효과로 필드를 벗어나지 않음', skipNextRefresh: '다음 리프레시 페이즈에 다시 세워지지 않음', blockerDisabled: '【블로커】를 쓸 수 없음',
};
const KW_DESC = {
  blocker: '상대가 어택하면 이 카드를 레스트해서 대신 막을 수 있어요',
  rush: '나온 턴에 바로 어택할 수 있어요',
  rushCharacter: '나온 턴에 바로 상대 캐릭터를 어택할 수 있어요 (리더는 안 돼요)',
  doubleAttack: '리더에게 대미지를 주면 라이프가 2장 줄어요',
  banish: '이 카드가 준 대미지로 라이프가 줄면, 그 카드는 패로 오지 않고 트래시로 가요 (트리거도 못 써요)',
  unblockable: '상대는 이 카드의 어택을 【블로커】로 막을 수 없어요',
};

const TIMING = {
  onPlay: '이 카드가 필드에 나왔을 때', activateMain: '내 메인 페이즈에 원할 때 직접 발동해서', main: '메인 페이즈에 이 이벤트를 사용하면',
  counter: '상대가 어택해 왔을 때 패에서 사용하면 (카운터)', trigger: '대미지로 라이프에서 이 카드가 나왔을 때 공개하면 (트리거)',
  whenAttacking: '이 카드가 어택할 때', onKO: '이 카드가 KO 됐을 때', onBlock: '이 카드가 블록했을 때', endOfYourTurn: '내 턴이 끝날 때',
  endOfOppTurn: '상대 턴이 끝날 때', onOppAttack: '상대가 어택해 왔을 때', static: '조건이 맞으면 항상', onEvent: '아래 상황이 생겼을 때',
  onRested: '이 캐릭터가 레스트 됐을 때', onKOByOppEffect: '이 캐릭터가 상대 효과로 KO 됐을 때', onDonReturned: '내 필드의 두웅!!이 두웅!! 덱으로 돌아갔을 때',
  onEventCardUsed: '이벤트가 사용됐을 때', onBlockerUsed: '상대가 【블로커】를 썼을 때', onDamageDealt: '상대 리더에게 대미지를 줬을 때',
  onHandDiscardedByEffect: '효과로 내 패가 버려졌을 때', onCharKO: '캐릭터가 KO 됐을 때', onBattleKO: '이 캐릭터가 배틀로 상대 캐릭터를 KO 시켰을 때',
  onCharPlayed: '상대가 캐릭터를 냈을 때', onDonAttached: '내 리더나 캐릭터에게 두웅!!이 붙었을 때', onLifeToHand: '내 라이프가 패로 왔을 때',
  replacement: '대신 처리하는 효과', 
};
const DURATION = { battle: '이번 배틀 동안만', turn: '이번 턴이 끝날 때까지', untilOppTurnEnd: '다음 상대 턴이 끝날 때까지', untilYourNextTurn: '다음 내 턴까지', continuous: '' };

// 받침 판정 -> 조사
function hasBatchim(word) {
  const w = String(word).replace(/[\s)\]」》』.!?~]+$/, '');
  const ch = w[w.length - 1];
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return '013678'.includes(ch);
  return false;
}
export const josa = (w, a, b) => w + (hasBatchim(w) ? a : b);

const names = arr => (arr || []).map(n => `「${n}」`).join(' 또는 ');

export function filterText(f = {}) {
  const p = [];
  if (f.notName) p.push(names(f.notName) + ' 말고');
  if (f.state === 'rested') p.push('레스트(옆으로 눕힌) 상태인');
  if (f.state === 'active') p.push('액티브(세워진) 상태인');
  if (f.color) p.push(COLOR[f.color] + '색');
  if (f.costMin != null && f.costMin === f.costMax) p.push(`코스트가 ${f.costMin}인`);
  else {
    if (f.costMin != null) p.push(`코스트 ${f.costMin} 이상`);
    if (f.costMax != null) p.push(`코스트 ${f.costMax} 이하`);
  }
  if (f.baseCostMax != null) p.push(`원래 코스트 ${f.baseCostMax} 이하`);
  if (f.costMaxRef === 'oppLife') p.push('코스트가 상대 라이프 장수 이하인');
  if (f.costMaxRef === 'totalLife') p.push('코스트가 서로의 라이프 합계 이하인');
  if (f.powerMax != null) p.push(`파워 ${f.powerMax} 이하`);
  if (f.powerMin != null) p.push(`파워 ${f.powerMin} 이상`);
  if (f.basePowerMax != null && f.basePowerMax === f.basePowerMin) p.push(`원래 파워가 ${f.basePowerMax}인`);
  else {
    if (f.basePowerMax != null) p.push(`원래 파워 ${f.basePowerMax} 이하`);
    if (f.basePowerMin != null) p.push(`원래 파워 ${f.basePowerMin} 이상`);
  }
  if (f.trait) p.push(`《${f.trait}》 특징을 가진`);
  if (f.traitAny) p.push(f.traitAny.map(t => `《${t}》`).join(' 또는 ') + ' 특징을 가진');
  if (f.traitContains) p.push(`특징에 '${f.traitContains}'가 들어간`);
  if (f.hasTrigger) p.push('【트리거】가 있는');
  if (f.noDon) p.push('두웅!!이 붙어 있지 않은');
  if (f.name) p.push(names(f.name));
  return p.join(' ');
}

export function targetText(t) {
  if (!t) return '';
  if (t.thisCard) return t.zone === 'hand' ? '이 카드' : `이 ${ZONE[t.zone] || '카드'}`;
  const side = t.side === 'self' ? '내 ' : t.side === 'opp' ? '상대 ' : '';
  const ft = filterText(t.filter);
  let zone = ZONE[t.zone] || '카드';
  if (t.filter && t.filter.name && t.zone === 'leaderOrCharacter') zone = '';
  if (t.filterAppliesTo === 'character') return `${side}리더 또는 ${ft} 캐릭터 ${cnt(t)}`.replace(/\s+/g, ' ').trim();
  return `${side}${ft ? ft + ' ' : ''}${zone} ${cnt(t)}`.replace(/\s+/g, ' ').trim();
}
const cnt = t => t.all ? '전부' : t.upTo ? `최대 ${t.count}장` : `${t.count}장`;

export function condText(c) {
  if (!c) return '';
  if (c.and) return c.and.map(condText).join(', 그리고 ');
  if (c.or) return c.or.map(condText).join(', 또는 ');
  if (c.raw) return `"${c.raw}" (직접 확인해요)`;
  const k = Object.keys(c)[0], v = c[k];
  const m = {
    leaderTrait: () => `내 리더가 《${v}》 특징을 가졌을 때`,
    leaderTraitAny: () => `내 리더가 ${v.map(x => `《${x}》`).join(' 또는 ')} 특징을 가졌을 때`,
    leaderTraitContains: () => `내 리더의 특징에 '${v}'가 들어갈 때`,
    leaderName: () => `내 리더가 ${names(v)}일 때`,
    leaderMulticolor: () => '내 리더가 여러 색(다색)일 때',
    leaderColor: () => `내 리더가 ${COLOR[v]}색일 때`,
    lifeAtMost: () => `내 라이프가 ${v}장 이하일 때`, lifeAtLeast: () => `내 라이프가 ${v}장 이상일 때`,
    oppLifeAtMost: () => `상대 라이프가 ${v}장 이하일 때`, oppLifeAtLeast: () => `상대 라이프가 ${v}장 이상일 때`,
    totalLifeAtMost: () => `서로의 라이프를 합쳐 ${v}장 이하일 때`, totalLifeAtLeast: () => `서로의 라이프를 합쳐 ${v}장 이상일 때`,
    handAtMost: () => `내 패가 ${v}장 이하일 때`, handAtLeast: () => `내 패가 ${v}장 이상일 때`,
    oppHandAtLeast: () => `상대 패가 ${v}장 이상일 때`, oppHandAtMost: () => `상대 패가 ${v}장 이하일 때`,
    donFieldAtLeast: () => `내 필드의 두웅!!이 ${v}장 이상일 때`, donFieldAtMost: () => `내 필드의 두웅!!이 ${v}장 이하일 때`,
    donFieldAtMostOpp: () => '내 필드의 두웅!!이 상대보다 적거나 같을 때', donFieldAtLeastOpp: () => '내 필드의 두웅!!이 상대보다 많거나 같을 때',
    oppDonFieldAtLeast: () => `상대 필드의 두웅!!이 ${v}장 이상일 때`,
    trashAtLeast: () => `내 트래시가 ${v}장 이상일 때`, deckAtMost: () => `내 덱이 ${v}장 이하일 때`,
    ifPrevDone: () => '바로 앞 단계를 실제로 했다면',
    not: () => '(' + condText(v) + ')가 아닐 때',
    leaderRested: () => '내 리더가 레스트 상태일 때', lifeLessThanOpp: () => '내 라이프가 상대보다 적을 때',
    donFieldLessThanOpp: () => '내 필드의 두웅!!이 상대보다 적을 때', thisInHand: () => '이 카드가 내 패에 있을 때',
    yourTurn: () => '내 턴일 때', oppTurn: () => '상대 턴일 때',
    thisRested: () => '이 캐릭터가 레스트 상태일 때', thisActive: () => '이 캐릭터가 액티브 상태일 때',
    charCountAtLeast: () => `내 필드에 ${filterText(v.filter) || ''} 캐릭터가 ${v.n}장 이상 있을 때`,
    charCountAtMost: () => v.n === 0 ? `내 필드에 ${filterText(v.filter)} 캐릭터가 없을 때` : `내 캐릭터가 ${v.n}장 이하일 때`,
    charCountExactly: () => `내 캐릭터가 딱 ${v.n}장일 때`,
    oppCharCountAtLeast: () => `상대 필드에 ${filterText(v.filter) || ''} 캐릭터가 ${v.n}장 이상 있을 때`,
    oppCharCountAtMost: () => v.n === 0 ? `상대 필드에 ${filterText(v.filter)} 캐릭터가 없을 때` : `상대 캐릭터가 ${v.n}장 이하일 때`,
    oppCharCountExactly: () => `상대 캐릭터가 딱 ${v.n}장일 때`,
  }[k];
  return (m ? m() : JSON.stringify(c)).replace(/\s+/g, ' ');
}

const REST = { bottom: '나머지는 원하는 순서로 덱 맨 아래에 넣어요', top: '나머지는 원하는 순서로 덱 맨 위에 올려요', topOrBottom: '나머지는 원하는 순서로 덱 맨 위나 아래에 넣어요', trash: '나머지는 트래시에 버려요' };

export function actionText(a) {
  const tt = a.target ? targetText(a.target) : '';
  const dur = a.duration && DURATION[a.duration] ? DURATION[a.duration] + ' ' : '';
  const opt = a.optional ? ' (안 해도 돼요)' : '';
  const f = a.filter ? filterText(a.filter) : '';
  const cardWord = a.filter && a.filter.type ? ZONE[a.filter.type] : '카드';
  let s;
  switch (a.do) {
    case 'draw': s = `덱에서 카드를 ${a.n}장 뽑아요`; break;
    case 'discard': s = a.side === 'opp' ? `상대가 자기 패에서 ${a.n}장을 골라 버려요` : `내 패에서 ${f ? f + ' ' + cardWord + ' ' : ''}${a.upTo ? '최대 ' : ''}${a.n}장을 골라 트래시에 버려요`; break;
    case 'trashFromDeckTop': s = `내 덱 맨 위에서 ${a.n}장을 트래시에 놓아요`; break;
    case 'power': s = `${dur}${josa(tt, '의', '의')} 파워를 ${a.amount > 0 ? '+' : ''}${a.amount} 해요`; break;
    case 'setPower': s = `${dur}${tt}의 파워를 ${a.value}으로 바꿔요`; break;
    case 'setBasePower': s = `${dur}${tt}의 원래 파워를 ${a.value}으로 바꿔요`; break;
    case 'costMod': s = `${dur}${tt}의 코스트를 ${a.amount > 0 ? '+' : ''}${a.amount} 해요`; break;
    case 'rest': s = `${josa(tt, '을', '를')} 레스트(옆으로 눕힘)해요`; break;
    case 'setActive': s = `${josa(tt, '을', '를')} 액티브(다시 세움)로 해요`; break;
    case 'ko': s = `${josa(tt, '을', '를')} KO 시켜서 트래시로 보내요`; break;
    case 'bounce': s = `${josa(tt, '을', '를')} 주인의 패로 되돌려요`; break;
    case 'toDeckBottom': s = `${josa(tt, '을', '를')} 주인의 덱 맨 아래로 보내요`; break;
    case 'toDeckTop': s = `${josa(tt, '을', '를')} 주인의 덱 맨 위로 보내요`; break;
    case 'toTrash': s = `${josa(tt, '을', '를')} 트래시에 놓아요`; break;
    case 'addDon': s = `두웅!! 덱에서 두웅!!을 ${a.upTo ? '최대 ' : ''}${a.n}장 ${a.state === 'active' ? '세운(액티브) 상태로' : '눕힌(레스트) 상태로'} 가져와요`; break;
    case 'returnDon': s = `내 필드의 두웅!! ${a.n}장을 두웅!! 덱으로 되돌려요`; break;
    case 'restDon': s = a.side === 'opp' ? `상대의 두웅!! ${a.upTo ? '최대 ' : ''}${a.n}장을 레스트해요` : `내 코스트 에리어의 두웅!! ${a.n}장을 레스트(눕힘)해요`; break;
    case 'setDonActive': s = `${a.side === 'opp' ? '상대' : '내'} 두웅!!을 ${a.upTo ? '최대 ' : ''}${a.n}장 다시 세워요(액티브)`; break;
    case 'attachDon': s = `${tt}에게 ${a.state === 'active' ? '세워진' : '눕혀진'} 두웅!!을 ${a.upTo ? '최대 ' : ''}${a.n}장 붙여요`; break;
    case 'search':
      if (!a.take) s = `내 덱 맨 위 ${a.look}장을 보고, ${REST[a.rest] || ''}`;
      else s = `내 덱 맨 위 ${a.look}장을 보고, 그중 ${josa((f ? f + ' ' : '') + cardWord, '을', '를')} 최대 ${a.take}장 상대에게 보여준 뒤 패에 넣어요. ${REST[a.rest] || ''}`;
      break;
    case 'lifeToHand': s = a.side === 'opp' ? `상대가 자기 라이프 맨 위 ${a.n}장을 패에 넣어요` : `내 라이프 ${a.from === 'bottom' ? '맨 아래' : a.from === 'topOrBottom' ? '맨 위나 맨 아래' : '맨 위'}에서 ${a.n}장을 패에 넣어요`; break;
    case 'addLife':
      if (a.from === 'deckTop') s = `내 덱 맨 위에서 ${a.upTo ? '최대 ' : ''}${a.n}장을 라이프 맨 위에 뒷면으로 더해요`;
      else if (a.from === 'hand') s = `내 패에서 ${a.upTo ? '최대 ' : ''}${a.n}장을 라이프 맨 위에 더해요`;
      else s = `${josa(tt, '을', '를')} ${a.side === 'opp' ? '상대' : '내'} 라이프 맨 위나 아래에 ${a.faceUp ? '앞면으로' : '뒷면으로'} 넣어요`;
      break;
    case 'trashLife': s = `${a.side === 'opp' ? '상대' : '내'} 라이프 ${a.from === 'topOrBottom' ? '맨 위나 아래' : '맨 위'}에서 ${a.upTo ? '최대 ' : ''}${a.n}장을 트래시에 놓아요`; break;
    case 'lookLife': s = `${a.side === 'self' ? '내' : a.side === 'opp' ? '상대' : '나나 상대 중 한 명의'} 라이프 맨 위 ${a.n}장을 몰래 보고, 라이프 맨 위나 아래에 다시 놓아요`; break;
    case 'lifeFace': s = `내 라이프 ${a.all ? '전부를' : '맨 위 ' + a.n + '장을'} ${a.faceUp ? '앞면(공개)' : '뒷면'}으로 뒤집어요`; break;
    case 'play':
      if (a.card === 'this') s = a.from === 'trash' ? `트래시에 있는 이 카드를 코스트 없이 ${a.state === 'rested' ? '눕힌 상태로 ' : ''}필드에 내요` : '이 카드를 코스트를 내지 않고 바로 필드에 내요';
      else if (a.from === 'deckTop') s = `내 덱 맨 위 ${a.look}장 중에서 ${josa((f ? f + ' ' : '') + cardWord, '을', '를')} ${a.upTo ? '최대 ' : ''}${a.n}장 코스트 없이 ${a.state === 'rested' ? '눕힌 상태로 ' : ''}필드에 내요. ${REST[a.rest] || ''}`;
      else s = `${{ hand: '내 패', trash: '내 트래시', handOrTrash: '내 패나 트래시' }[a.from]}에서 ${josa((f ? f + ' ' : '') + cardWord, '을', '를')} ${a.upTo ? '최대 ' : ''}${a.n}장 코스트 없이 ${a.state === 'rested' ? '눕힌 상태로 ' : ''}필드에 내요`;
      break;
    case 'grant': s = `${dur}${josa(tt, '은', '는')} ${KW[a.keyword] || a.keyword}${KW_DESC[a.keyword] ? ' 능력을 얻어요 (' + KW_DESC[a.keyword] + ')' : ' 상태가 돼요'}`; break;
    case 'activateMainOf': s = '이 카드에 적힌 【메인】 효과를 그대로 발동해요'; break;
    case 'activateAbilityOf': s = `이 카드에 적힌 다른 효과를 그대로 발동해요`; break;
    case 'thisToHand': s = '이 카드를 내 패에 넣어요'; break;
    case 'trashToDeck': s = `내 트래시에서 ${f ? f + ' ' : ''}카드 ${a.n}장을 원하는 순서로 덱 맨 아래에 넣어요`; break;
    case 'revealFromHand': s = `내 패에서 ${f ? f + ' ' : ''}카드 ${a.n}장을 상대에게 보여줘요`; break;
    case 'trashToHand': s = `내 트래시에서 ${josa((f ? f + ' ' : '') + cardWord, '을', '를')} ${a.upTo ? '최대 ' : ''}${a.n}장 패에 넣어요`; break;
    case 'handToDeck': s = `내 패에서 ${a.n}장을 골라 원하는 순서로 덱 맨 아래에 넣어요`; break;
    case 'shuffle': s = '덱을 섞어요'; break;
    case 'aliasName': s = `이 카드는 이름이 ${names(a.names)}인 카드로도 취급해요`; break;
    case 'extraTurn': s = '이번 턴이 끝나면 내 턴을 한 번 더 해요'; break;
    case 'negate': s = `${dur}${tt}의 효과를 무효로 해요 (적힌 능력이 사라져요)`; break;
    case 'playerRestriction': s = `${dur}제한: "${a.text}"`; break;
    case 'rule': s = `덱 규칙: ${a.text}`; break;
    case 'choose': s = '아래 중 하나를 골라요: ' + a.options.map((o, i) => `(${i + 1}) ${o.map(actionText).join(', ')}`).join(' / '); break;
    case 'manual': s = `미지원 효과: "${a.text}"`; break;
    default: s = JSON.stringify(a);
  }
  if (a.at === 'endOfThisTurn') s = '이번 턴이 끝날 때 ' + s;
  if (a.condition) s = `${condText(a.condition)}만 ${s}`;
  return (s + opt).replace(/\s+/g, ' ').trim();
}

const REPL = { ko: 'KO 당할', koByOppEffect: '상대 효과로 KO 당할', koByEffect: '효과로 KO 당할', koInBattle: '배틀로 KO 당할', leaveByOppEffect: '상대 효과로 필드를 떠날', leaveByEffect: '효과로 필드를 떠날', restByOppEffect: '상대 효과로 레스트될' };
export function whenText(ab) {
  const p = [];
  if (ab.during === 'yourTurn') p.push('내 턴 동안');
  if (ab.during === 'oppTurn') p.push('상대 턴 동안');
  if (ab.donReq) p.push(`이 카드에 두웅!!이 ${ab.donReq}장 이상 붙어 있으면`);
  if (ab.timing === 'replacement' && ab.replace && !ab.replace.raw) p.push(`${josa(targetText(ab.replace.target), '이', '가')} ${REPL[ab.replace.event] || ab.replace.event} 때, 그 대신`);
  else if (ab.timing === 'replacement' && ab.replace) p.push(`"${ab.replace.raw}" 때 (직접 확인해요), 그 대신`);
  else if (ab.timing === 'static') p.push(p.length ? '항상' : '조건이 맞으면 항상');
  else if (ab.timing !== 'onEvent') p.push(TIMING[ab.timing] || ab.timing);
  if (ab.timing2) p.push('또는 ' + (TIMING[ab.timing2] || ab.timing2));
  if (ab.eventWhen && ab.timing === 'onEvent') p.push(`"${ab.eventWhen}" (이 상황인지 직접 확인해요)`);
  if (ab.oncePerTurn) p.push('(한 턴에 한 번만)');
  return p.join(', ').replace(', (', ' (').replace(/동안, 항상/, '동안 항상');
}

export function explainAbility(ab, card) {
  const when = whenText(ab);
  const condition = condText(ab.condition);
  const cost = ab.cost.length ? ab.cost.map(actionText).map(s => s.replace(/ \(안 해도 돼요\)$/, '')).join(', ') : '';
  const first = ab.steps.find(s => s.target);
  const target = first ? targetText(first.target) : '';
  const results = ab.steps.map(actionText);
  const durStep = ab.steps.find(s => s.duration && DURATION[s.duration]);
  const duration = durStep ? DURATION[durStep.duration] : '';
  const optional = !!(ab.optional || ab.steps.some(s => s.optional));
  const steps = [{ label: '언제', text: when }];
  if (ab.activeIn === 'hand') steps.push({ label: '어디서', text: '이 카드가 패에 있을 때만 적용돼요' });
  if (condition) steps.push({ label: '조건', text: condition });
  if (cost) steps.push({ label: '비용', text: cost + (ab.cost.length ? ' (내고 싶을 때만 내요. 내면 효과가 발동해요)' : '') });
  results.forEach((r, i) => steps.push({ label: results.length > 1 ? `효과 ${i + 1}` : '효과', text: r }));
  if (ab.optional && !cost) steps.push({ label: '선택', text: '"할 수 있다"라서 안 해도 괜찮아요' });
  let sentence = when;
  if (condition) sentence += `, ${condition}`;
  if (cost) sentence += `, 비용(${cost})을 내면`;
  sentence += ' → ' + results.join(' → ');
  return { when, condition, cost, target, result: results.join(' → '), duration, optional, manual: ab.steps.some(s => s.do === 'manual') || ab.cost.some(s => s.do === 'manual'), steps, sentence: sentence.replace(/\s+/g, ' ') + '.' };
}

export function explainKeyword(k) {
  return { keyword: k, name: KW[k] || k, text: KW_DESC[k] || '' };
}

export function explainCard(cardNo, effects, cards) {
  const card = Array.isArray(cards) ? cards.find(c => c.no === cardNo) : cards && cards[cardNo];
  const base = card ? card.base : cardNo.replace(/_[A-Za-z]+\d*$/, '');
  const e = effects[cardNo] || effects[base];
  if (!e) return { cardNo, keywords: [], abilities: [], coverage: 0, unparsed: [] };
  return {
    cardNo, name: card && card.name,
    keywords: e.keywords.map(explainKeyword),
    abilities: e.abilities.map(ab => ({ src: ab.src, ...explainAbility(ab, card) })),
    coverage: e.coverage, unparsed: e.unparsed,
  };
}
