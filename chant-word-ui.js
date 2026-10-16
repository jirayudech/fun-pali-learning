import { chantRoman } from './chant-engine.js?v=20261016-chants2';
import { chantWordKey } from './chant-lexicon.js?v=20261016-chants2';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function chantWordMarkup(text, lineIndex) {
  const html = String(text).split(/(\s+)/).map(token => {
    const word = chantWordKey(token);
    if (!word || /\s/.test(token)) return esc(token);
    return `<button type="button" class="chant-word" data-action="chant-word:${lineIndex}.${encodeURIComponent(word)}" data-chant-word="${esc(word)}" data-chant-line="${lineIndex}" aria-label="${esc(word)} — ดูคำแปล">${esc(token)}</button>`;
  }).join('');
  return `<span class="chant-pali chant-word-line">${html}</span><span class="chant-roman">${esc(chantRoman(text))}</span>`;
}
export function createChantTooltip(entryFor) {
  let tooltip, active, timer;
  const contains = (parent, target) => Boolean(parent && target && typeof target.nodeType === 'number' && parent.contains(target));
  function hide() {
    clearTimeout(timer);
    active?.removeAttribute('aria-describedby'); active = null;
    if (tooltip) tooltip.hidden = true;
  }
  function position() {
    if (!active?.isConnected || !tooltip || tooltip.hidden) return;
    const rect = active.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) { hide(); return; }
    tooltip.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - bounds.width - 12))}px`;
    const below = rect.bottom + 8;
    tooltip.style.top = `${Math.max(8, below + bounds.height <= innerHeight - 8 ? below : rect.top - bounds.height - 8)}px`;
  }
  function open(word) {
    clearTimeout(timer);
    if (!tooltip?.isConnected) {
      tooltip = document.createElement('div'); tooltip.id = 'chant-word-tooltip'; tooltip.className = 'chant-word-tooltip'; tooltip.setAttribute('role', 'tooltip');
      document.body.append(tooltip);
    }
    active?.removeAttribute('aria-describedby'); active = word;
    const token = word.dataset.chantWord, entry = entryFor(token, Number(word.dataset.chantLine));
    tooltip.innerHTML = `<b>${esc(token)}</b><small>${esc(chantRoman(token))}</small><p>${esc(entry?.meaning || 'ยังไม่มีคำแปลของคำนี้ แตะเพื่อเพิ่มคำแปลส่วนตัวได้')}</p><small>${esc(entry?.origin || 'จะไม่เดาคำแปลให้')}${entry ? ' · แตะดูรูปศัพท์หรือบันทึกคำแปลเฉพาะวรรค' : ''}</small>`;
    tooltip.hidden = false; active.setAttribute('aria-describedby', tooltip.id);
    position();
  }
  function handle(event) {
    if (event.type === 'keydown') { if (event.key === 'Escape') hide(); return; }
    if (event.type === 'scroll' || event.type === 'resize') { if (!contains(tooltip,event.target)) position(); return; }
    const word = event.target.closest?.('.chant-word');
    if (event.type === 'pointerover' || event.type === 'focusin') {
      if (word) open(word);
      else if (contains(tooltip,event.target)) clearTimeout(timer);
      return;
    }
    if (event.type === 'pointerout' || event.type === 'focusout') {
      if (contains(word,event.relatedTarget) || contains(tooltip,event.relatedTarget)) return;
      if (word || contains(tooltip,event.target)) timer = setTimeout(() => {
        if (!contains(active,document.activeElement)) hide();
      }, 150);
    }
  }
  return { handle, hide };
}
