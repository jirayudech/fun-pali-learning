import { chantPacks, materializePack, KATHINA_RECIPIENT } from './chant-content.js?v=20261031-pdf1';
import { chantRoman } from './chant-engine.js?v=20261031-pdf1';

export const FEATURED_CHANT = 'kale-anumodana';
export const CHANT_TARGET_KEY = 'pali-open-chant-pack';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const publicChant = id => chantPacks.find(p => p.id === id) || null;
export function kathinaPdfPanel() {
  return `<section class="bottom-note kathina-download" aria-label="ดาวน์โหลดบทสวดกฐิน"><div><h2>รวมบทสวดกฐิน · A4 หน้าเดียว</h2><p>อปโลกน์องค์ที่ ๓ · ญัตติทุติยกรรมวาจา · กาเล</p><p>PDF ฉบับนี้ใช้ชื่อผู้รับ <span class="pali-script">${esc(KATHINA_RECIPIENT.name)}</span> · บาลีอักษรไทยสำหรับพิมพ์</p></div><a class="button" href="./assets/kathina-a4.pdf" download="kathina-a4.pdf">ดาวน์โหลด PDF รวม ๓ บท ↓</a></section>`;
}
export function chantSourceLinks(pack) {
  return pack.sourceLinks?.length ? `<details class="chant-source-links"><summary>แหล่งต้นฉบับที่ใช้ตรวจ</summary><ul>${pack.sourceLinks.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ul></details>` : '';
}
export function chantShareUrl(id, base = globalThis.location?.href) {
  if (!publicChant(id)) throw new Error('ไม่พบบทสวดสำหรับแชร์');
  const url = new URL(base);
  url.search = ''; url.hash = '';
  url.searchParams.set('chants', '1'); url.searchParams.set('pack', id);
  return url.href;
}
export function requestedChant(search, stored = null) {
  const id = new URLSearchParams(search).get('pack');
  return publicChant(id)?.id || publicChant(stored)?.id || null;
}

export function chantPublicContent(selectedId = null, signedIn = false) {
  const selected = publicChant(selectedId);
  const featured = publicChant(FEATURED_CHANT) || chantPacks[0];
  const ordered = [featured, ...chantPacks.filter(p => p.id !== featured.id)];
  const start = (p, label = 'เริ่มฝึกท่อง →') => `<button class="button" data-action="practice-chant:${p.id}">${label}</button>`;
  const cards = `<section id="chant-catalog" aria-labelledby="chant-catalog-title"><div class="section-head"><h2 id="chant-catalog-title">เลือกบทที่อยากฝึก</h2><span class="muted">อ่านได้ก่อนเข้าสู่ระบบ</span></div><div class="chant-public-cards">${ordered.map(p => `<article class="panel"><span class="badge">${p.id === FEATURED_CHANT ? 'แนะนำ · อนุโมทนากฐิน' : 'บทสวดกฐิน'}</span><h3>${esc(p.title)}</h3><p>${esc(p.intro)}</p><p class="muted">${p.rows.length} วรรค · บาลีอักษรไทย พร้อมโรมันและความหมาย</p><div class="actions">${start(p)}<button class="button secondary" data-action="preview-chant:${p.id}">อ่านบทสวด</button></div></article>`).join('')}</div></section>`;
  const preview = selected ? `<article class="panel chant-public-preview" aria-labelledby="chant-preview-title"><span class="badge">อ่านบทก่อนเริ่มฝึก</span><h1 id="chant-preview-title">${esc(selected.title)}</h1><p>${esc(selected.intro)}</p><details class="chant-source-links"><summary>ฉบับที่ใช้และแหล่งอ้างอิง</summary><p>${esc(selected.source)}</p><p>${esc(selected.note)}</p>${chantSourceLinks(selected)}</details><div class="actions">${start(selected, signedIn ? 'เข้าห้องฝึกบทนี้ →' : 'เข้าสู่ระบบเพื่อเริ่มฝึก →')}<button class="button secondary" data-action="share-chant:${selected.id}">คัดลอกลิงก์ให้เพื่อน</button></div><p class="muted">${signedIn ? 'ประวัติซ้อมเก็บในอุปกรณ์นี้ แยกตามบัญชีของคุณ' : 'เริ่มเกมและบันทึกผลฝึกหลังเข้าสู่ระบบด้วย Google หรืออีเมล'}</p><ol class="chant-public-lines">${materializePack(selected).map(l => `<li><span class="chant-pali">${esc(l.text)}</span><span class="chant-roman">${esc(chantRoman(l.text))}</span><p>${esc(l.meaning)}</p></li>`).join('')}</ol><div class="actions">${start(selected)}<button class="button secondary" data-action="public-chants">ดูบทสวดทั้งหมด</button></div></article>` : `<section class="hero chant-public-hero"><div><div class="eyebrow">จำทีละวรรค · เข้าใจทีละคำ</div><h1>ฝึกท่องบทสวดมนต์<br>เริ่มที่ “กาเล” อนุโมทนากฐิน</h1><p>อ่านความหมาย เล่นเรียงคำ เติมคำ แล้วลองท่องจากความจำ ชวนเพื่อนมาฝึกด้วยกันได้ฟรี</p><div class="actions">${start(featured)}<button class="button light" data-action="preview-chant:${featured.id}">เปิดอ่านบทกาเล</button></div><p>อ่านบทได้ทันที · เข้าสู่ระบบเมื่อเริ่มฝึก</p></div><img src="./assets/kathina.svg" alt="น้องช้างและนกชวนฝึกบทสวดที่ศาลา" width="230" height="160"></section>`;
  return `${kathinaPdfPanel()}${preview}${cards}<section class="bottom-note"><div><h2>เรียนบาลีเพื่อเข้าใจบทที่สวด</h2><p>บทเรียนสั้น เกมไวยากรณ์ และซ้อมสอบประโยค 1–2</p></div><button class="button secondary" data-action="learning-home">ไปเรียนบาลี →</button></section>`;
}
