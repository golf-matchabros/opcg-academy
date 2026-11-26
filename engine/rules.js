// 덱 검증 (한국 시즌 규칙) - 서버/브라우저 공용
export function validateDeck(db, reg, d) {
  if (!d || !d.leader || !Array.isArray(d.cards)) return '덱 정보가 없어요';
  const L = db.cards.get(d.leader); if (!L || L.type !== 'leader') return '리더 카드가 올바르지 않아요';
  let total = 0; const counts = {};
  for (const { no, count } of d.cards) {
    const c = db.cards.get(no); if (!c) return `없는 카드: ${no}`;
    if (c.type === 'leader') return '메인 덱에 리더를 넣을 수 없어요';
    if (!c.colors.every(k => L.colors.includes(k))) return `리더 색이 아닌 카드: ${c.name}`;
    counts[c.base] = (counts[c.base] || 0) + count; if (counts[c.base] > 4) return `4장 초과: ${c.name}`;
    if ((reg.banned || []).includes(c.base)) return `금지 카드: ${c.name}`;
    total += count;
  }
  for (const [a, b] of reg.pairs || []) if ((counts[a] || d.leader === a) && (counts[b] || d.leader === b)) return `금지 페어: ${a} + ${b}`;
  if (total !== 50) return `메인 덱은 50장이어야 해요 (지금 ${total}장)`;
  return null;
}
