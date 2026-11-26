import { HANDS } from '../engine/opening.js?v=202611261846';
const labels = {rock:'바위', paper:'보', scissors:'가위'};
export function drawOpening(root, v, me, send) {
  const other = 1-me;
  const result = v.last ? `나: ${labels[v.last[me]]} · 상대: ${labels[v.last[other]]}` : '';
  root.innerHTML = `<section class="intro opening" aria-live="polite"><small class="mut">대전 준비 · 첫 패를 받기 전</small><div class="opening-leads mut"></div><h2></h2><p></p><div class="filters"></div></section>`;
  const h = root.querySelector('h2'), p = root.querySelector('p'), actions = root.querySelector('.filters');
  if (v.leaders?.length === 2) root.querySelector('.opening-leads').textContent = `내 리더: ${v.leaders[me]} · 상대 리더: ${v.leaders[other]}`;
  function button(text,a) { const b = document.createElement('button'); b.type='button'; b.className='pri'; b.textContent=text; b.style.minHeight='44px'; b.onclick=()=>{ for (const child of actions.children) child.disabled=true; send({...a,round:v.round}); }; actions.append(b); }
  if (v.winner === null) {
    h.textContent = v.mine ? `${labels[v.mine]}를 냈어. 상대를 기다리는 중` : v.last ? '비겼어! 다시 골라봐' : '가위바위보, 무엇을 낼까?';
    p.textContent = (result ? result+' · ' : '') + '이긴 사람이 선공과 후공 중 하나를 골라.';
    if (!v.mine) for (const hand of HANDS) button(labels[hand],{kind:'throw',hand});
  } else {
    h.textContent = v.winner === me ? '이겼어! 먼저 할까, 나중에 할까?' : '상대가 이겼어. 순서를 고르는 중이야';
    p.textContent = result + ' | 선공 첫 턴: 드로우 없이 두웅!! 1장. 후공 첫 턴: 드로우 1장과 두웅!! 2장.';
    if (v.winner === me) { button('선공으로 시작',{kind:'order',first:me}); button('후공으로 시작',{kind:'order',first:other}); }
  }
}
