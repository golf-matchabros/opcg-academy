// Read-only board pieces. Counters come from their respective engine zones;
// attached cards never pass through the cost area and the deck is a count only.
const face = `<svg viewBox="0 0 42 59" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="40" height="57" rx="4" fill="var(--don-paper)" stroke="var(--don-edge)" stroke-width="2"/>
  <rect x="4" y="4" width="34" height="51" rx="2" fill="var(--don-ink)"/>
  <path d="M5 6l9 11-3-12 9 10 1-10 4 10 8-10-3 13 7-5-5 10 5 1-6 5 6 4-9-1 6 9-12-6 1 8-7-9-9 6 4-10-7 2 7-8-7-1 8-4z" fill="var(--don-flash)"/>
  <path d="M5 26l30-8 2 9-31 9z" fill="var(--don-paper)"/>
  <text x="21" y="31" transform="rotate(-10 21 27)" text-anchor="middle" fill="var(--don-ink)" font-size="13" font-weight="1000" textLength="30" lengthAdjust="spacingAndGlyphs">두웅!!</text>
  <path d="M7 44h28" stroke="var(--don-flash)"/><text x="21" y="52" text-anchor="middle" fill="var(--don-paper)" font-family="system-ui,sans-serif" font-weight="800" font-size="7">+1000</text></svg>`;
const cards = (state, count) => `<span class="don-mini" data-don-state="${state}" aria-hidden="true">${face}</span>`.repeat(count);
function lane(state, label, count) {
  return `<div class="don-lane" data-don-lane="${state}"><span class="don-caption">${label} <b>${count}장</b></span><div class="don-faces" aria-hidden="true">${cards(state, count) || '<span class="don-empty">없음</span>'}</div></div>`;
}
export function donArea(P, player, isMe) {
  const who = isMe ? '내' : '상대';
  return `<section class="don" data-pile="don${player}" aria-label="${who} 두웅!! 영역">
    <div class="don-head"><strong>${who} 두웅!!</strong><span class="don-stock" data-don-deck="${P.donDeck}">남은 덱 <b>${P.donDeck}장</b></span></div>
    ${lane('active', '액티브', P.donActive)}${lane('rested', '레스트', P.donRested)}
  </section>`;
}
export function attachedDon(uid, count, escapedName) {
  if (!count) return '';
  return `<div class="don-attached" data-don-host="${uid}" role="img" aria-label="${escapedName}에 붙은 두웅!! ${count}장"><span aria-hidden="true">붙은 두웅!! <b>${count}장</b></span><div class="don-faces">${cards('attached', count)}</div></div>`;
}
