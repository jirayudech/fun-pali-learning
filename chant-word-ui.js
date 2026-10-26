import { chantRoman } from './chant-engine.js?v=20261026-kale1';
import { chantWordKey } from './chant-lexicon.js?v=20261026-kale1';
import { lookupChantAnalysis } from './chant-analysis.js?v=20261026-kale1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function chantWordMarkup(text, lineIndex) {
  const html = String(text).split(/(\s+)/).map(token => {
    const word = chantWordKey(token);
    if (!word || /\s/.test(token)) return esc(token);
    return `<button type="button" class="chant-word" data-action="chant-word:${lineIndex}.${encodeURIComponent(word)}" data-chant-word="${esc(word)}" data-chant-line="${lineIndex}" aria-label="${esc(word)} — ดูคำแปลและแยกศัพท์">${esc(token)}</button>`;
  }).join('');
  return `<span class="chant-pali chant-word-line">${html}</span><span class="chant-roman">${esc(chantRoman(text))}</span>`;
}
export function chantWordAnalysisMarkup(word) {
  const analysis = lookupChantAnalysis(word);
  if (!analysis) return '<section class="chant-analysis" aria-label="วิเคราะห์ศัพท์"><p class="muted">ยังไม่มีบทวิเคราะห์ที่ตรวจแล้วสำหรับรูปคำนี้ จึงยังไม่ระบุชนิดสมาส สนธิ หรือธาตุ คำแปลส่วนตัวที่คุณบันทึกยังใช้ได้ตามเดิม</p></section>';
  return `<section class="chant-analysis" aria-label="วิเคราะห์ศัพท์"><p class="chant-analysis-formula"><strong>${esc(analysis.formula)}</strong><small>${esc(analysis.brief)}</small></p><details><summary>ดูชนิดและขั้นแปลงรูปทีละขั้น</summary><p>${esc(analysis.context)}</p><h4>แต่ละส่วนแปลว่าอะไร?</h4><ul class="chant-analysis-parts">${analysis.parts.map(([form,meaning])=>`<li><b>${esc(form)}</b> <span class="muted">(${esc(chantRoman(form))})</span> — ${esc(meaning)}</li>`).join('')}</ul><dl><dt>สมาส</dt><dd>${esc(analysis.compound)}</dd><dt>สนธิ</dt><dd>${esc(analysis.sandhi)}</dd><dt>รูปผันและหน้าที่</dt><dd>${esc(analysis.inflection)}</dd></dl><h4>เปลี่ยนรูปอย่างไร?</h4><ol>${analysis.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p class="muted">${esc(analysis.caution)}</p>${analysis.sources.length?`<details><summary>หลักที่ใช้ตรวจ</summary>${analysis.sources.map(source=>`<p><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a></p><p class="muted">${esc(source.note)}</p>`).join('')}</details>`:''}<p class="muted">บทวิเคราะห์พื้นฐานเพื่อเรียน อ่านเทียบกับบริบทของวรรค ไม่ใช่ตัววิเคราะห์อัตโนมัติหรือการรับรองคำสวดสำหรับวันงาน</p></details></section>`;
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
    const analysis = lookupChantAnalysis(token);
    tooltip.innerHTML = `<b>${esc(token)}</b><small>${esc(chantRoman(token))}</small><p>${esc(entry?.meaning || 'ยังไม่มีคำแปลของคำนี้ แตะเพื่อเพิ่มคำแปลส่วนตัวได้')}</p><small class="chant-analysis-preview">${analysis?`${esc(analysis.formula)} · ${esc(analysis.brief)}`:'ยังไม่มีบทวิเคราะห์ที่ตรวจแล้วสำหรับรูปนี้'}</small><small>${esc(entry?.origin || 'จะไม่เดาคำแปลให้')}${entry ? ' · แตะดูขั้นแปลงรูปหรือบันทึกคำแปลเฉพาะวรรค' : ''}</small>`;
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
