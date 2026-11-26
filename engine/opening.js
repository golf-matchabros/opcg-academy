// 게임을 만들기 전에 순서를 확정한다. 각자 낸 손은 둘 다 선택하기 전엔 상대에게 보내지 않는다.
export const HANDS = ['scissors', 'rock', 'paper'];
const beats = { scissors: 'paper', rock: 'scissors', paper: 'rock' };
export const newOpening = () => ({ round: 1, hands: [null,null], last: null, winner: null, first: null });
export function applyOpening(s, p, a) {
  if ((p !== 0 && p !== 1) || !a || a.round !== s.round || s.first !== null) throw Error('현재 선택 단계가 아니에요');
  if (a.kind === 'throw' && s.winner === null && s.hands[p] === null && HANDS.includes(a.hand)) {
    s.hands[p] = a.hand;
    if (s.hands.every(Boolean)) {
      s.last = [...s.hands];
      if (s.hands[0] === s.hands[1]) { s.round++; s.hands = [null,null]; }
      else s.winner = beats[s.hands[0]] === s.hands[1] ? 0 : 1;
    }
  } else if (a.kind === 'order' && s.winner === p && (a.first === 0 || a.first === 1)) s.first = a.first;
  else throw Error('지금 선택할 수 없어요');
}
export function openingView(s,p) { return {round:s.round, mine:s.hands[p], last:s.last && [...s.last], winner:s.winner, first:s.first}; }
