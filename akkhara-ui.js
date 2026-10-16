import { akkharaLessons, akkharaSource, consonantRows, speechBases, speechOrgans } from './akkhara-lessons.js?v=20261016-chants2';
import { chantRoman } from './chant-engine.js?v=20261016-chants2';
import { paliMarkup } from './pali-script.js?v=20261016-chants2';
const button = (text, action, style = '') => `<button class="button ${style}" data-action="${action}">${text}</button>`;

export function akkharaProgress(stats = []) {
  const progress = akkharaLessons.map(lesson => ({ ...lesson, stat: stats.find(s => s.id === lesson.id) || { learned: false, attempts: 0, latestScore: null } }));
  const weak = progress.filter(l => l.stat.latestScore !== null && l.stat.latestScore < .8).sort((a, b) => a.stat.latestScore - b.stat.latestScore)[0];
  const next = weak || progress.find(l => !l.stat.learned) || progress.slice().sort((a, b) => (a.stat.latestScore ?? 0) - (b.stat.latestScore ?? 0))[0];
  return { progress, next, learned: progress.filter(l => l.stat.learned).length,
    reason: weak ? 'ทวนจุดที่ยังไม่แม่นก่อน ค่อยไปเรื่องใหม่' : progress.some(l => !l.stat.learned) ? 'บทถัดไปของหมวดนี้ เรียนทีละเรื่องได้เลย' : 'ฝึกครบหมวดแล้ว กลับทวนหรือซ้อมเขียนตอบให้คล่องขึ้น' };
}
export function akkharaTeaser() {
  return `<section class="bottom-note akkhara-teaser"><img src="./assets/akkhara.svg" alt="" width="140" height="100"><div><span class="badge">ใหม่ · อ้างอิงหัวข้อจากบาลีธันเดอร์</span><h2>อักขรวิธี แบบเข้าใจทีละขั้น</h2><p>8 บทสั้น · 40 โจทย์ · สระ พยัญชนะ ฐานและกรณ์</p></div>${button('เริ่มเส้นทางอักขรวิธี →', 'nav:akkhara')}</section>`;
}
export function akkharaHub(stats) {
  const { progress, next, learned, reason } = akkharaProgress(stats);
  return `<div class="heading"><div><div class="eyebrow">อ่านเป็น · เข้าใจเสียง · เตรียมประโยค 1–2</div><h1>อักขรวิธี ทีละขั้น</h1><p class="muted">เริ่มจากตัวอย่างที่คุ้น แล้วค่อยจำชื่อศัพท์ที่ใช้สอบ</p></div><span class="badge">เรียน/ฝึกแล้ว ${learned}/${progress.length} บท</span></div>
    <section class="akkhara-hero"><img src="./assets/akkhara.svg" alt="น้องช้างชี้กระดานอักษรบาลีห้าแถว" width="480" height="320"><div><h2>ไม่ต้องท่องทุกชื่อในวันแรก</h2><p>รู้ความหมายก่อน → ดูตัวอย่าง → เล่น 5 ข้อ → ลองตอบจากความจำ ข้อที่พลาดกลับมาทวนได้</p><p>บทละประมาณ 7 นาที บาลีอักษรไทยเป็นหลัก พร้อมโรมันกำกับ</p>${button('เรียนต่อ: '+next.title, `lesson:${next.id}`)}<p class="muted">${reason}</p></div></section>
    <section class="panel"><h2>อักขรวิธีคืออะไร?</h2><p>คือเรื่องอักษรและวิธีเกี่ยวกับอักษร ในเส้นทางนี้เราฝึกเสียงสั้น–ยาว น้ำหนักพยางค์ การจัดพยัญชนะ และที่เกิดเสียง เพื่ออ่านและตอบไวยากรณ์ได้ตรงเรื่อง</p><p class="muted">หากยังไม่คุ้นพินทุ ฺ กับนิคคหิต ํ เริ่มอ่านบทพื้นฐานก่อนได้</p><div class="actions">${button('รู้จักเสียงและอักษร', 'lesson:sounds', 'secondary')}${button('ทวนภาพรวมสมัญญาภิธาน', 'lesson:phonetics', 'secondary')}</div></section>
    <div class="section-head"><h2>เส้นทาง 8 บท</h2><span class="muted">เลือกทวนได้ทุกบท</span></div><div class="akkhara-path">${progress.map((l, i) => {
      const { stat } = l, assessed = stat.latestScore !== null;
      const label = assessed ? `จบด่านแล้ว${Math.round(stat.latestScore * 100) < 80 ? ' · ควรทวน' : ''} · ล่าสุด ${Math.round(stat.latestScore * 100)}%` : stat.learned ? 'เรียนแล้วตามที่แจ้ง · ยังไม่มีคะแนน' : 'ยังไม่ได้ฝึก';
      return `<article class="panel akkhara-step ${assessed && stat.latestScore >= .8 ? 'done' : ''}"><div class="akkhara-step-number">${assessed && stat.latestScore >= .8 ? '✓' : i + 1}</div><div><span class="eyebrow">${['สระและเสียง','สระและเสียง','พยัญชนะ','พยัญชนะ','พยัญชนะ','ฐานและกรณ์','ฐานและกรณ์','รวมความเข้าใจ'][i]} · ${l.minutes} นาที</span><h3>${l.title}</h3><p>${l.intro}</p><span class="badge">${label}</span><div class="actions">${button(stat.learned ? 'อ่านทบทวน' : 'อ่านก่อนเล่น', `lesson:${l.id}`)}${button('เล่นเกม 5 ข้อ', `game-start:${l.id}`, 'secondary')}</div></div></article>`;
    }).join('')}</div>
    <section class="panel"><h2>อ่านแล้ว ลองตอบแบบเขียนด้วย</h2><p>ท้ายแต่ละบทมีโจทย์ให้ลองตอบจากความจำ พร้อมแนวตอบและรายการตรวจตนเอง ก่อนฝึกข้อสอบในห้องซ้อมสอบ เกมเป็นเครื่องมือทวน ไม่ใช่ผลรับรองว่าตอบงานเขียนสอบได้ครบแล้ว</p><div class="actions">${button('เข้าห้องซ้อมสอบประโยค 1–2', 'nav:exams')}${button('ต่อเรื่องสนธิ', 'lesson:sandhi', 'secondary')}</div></section>
    <section class="panel akkhara-source"><h2>ที่มาของหัวข้อ</h2><p>ตรวจข้อเท็จจริงจาก <a href="${akkharaSource.url}" target="_blank" rel="noopener noreferrer">${akkharaSource.title} ↗</a> วันที่ 16 ตุลาคม 2569 แล้วเขียนคำอธิบาย ตัวอย่าง และเกมขึ้นใหม่สำหรับเว็บของเรา โจทย์ใน 8 บทนี้เป็นโจทย์แต่งเพื่อเรียน ไม่ใช่ข้อสอบจริงที่คัดมา และไม่ได้คัดลอกคลังโจทย์หรือเฉลยต้นทาง</p></section>`;
}

export function akkharaReference(type) {
  if (type === 'rows') {
    return `<details class="akkhara-reference"><summary>เปิดตารางพยัญชนะทีละแถว</summary><p class="muted">ตัวเลขคือช่องที่ 1–5 ในแต่ละวรรค โรมันในตารางแสดงพยัญชนะโดยไม่เติมเสียงสระ</p><div class="akkhara-table-wrap"><table class="akkhara-table"><caption>พยัญชนะวรรค 25 ตัว</caption><thead><tr><th scope="col">วรรค</th>${[1,2,3,4,5].map(n => `<th scope="col">${n}</th>`).join('')}</tr></thead><tbody>${consonantRows.map(([name, row]) => `<tr><th scope="row">${name}</th>${row.map(c => `<td><b lang="pi-Thai">${c}</b><small lang="pi-Latn">${chantRoman(c+'ฺ')}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div><p>อวรรคอีก 8 ตัว: ย ร ล ว ส ห ฬ ํ</p></details>`;
  }
  const terms = type === 'bases' ? speechBases : type === 'organs' ? speechOrgans : null;
  if (!terms) return '';
  return `<details class="akkhara-reference"><summary>พร้อมแล้ว เปิดบัตรชื่อ${type === 'bases' ? 'ฐานทั้ง 6' : 'กรณ์ทั้ง 4'}</summary><p class="muted">อ่านทีละคู่ ลองปิดแล้วบอกความหมาย ไม่ต้องจำพร้อมกันทั้งหมดในครั้งแรก</p><dl class="akkhara-terms">${terms.map(([name, meaning]) => `<div><dt lang="pi-Thai">${name}<small lang="pi-Latn">${chantRoman(name)}</small></dt><dd>${meaning}</dd></div>`).join('')}</dl></details>`;
}
export function akkharaLessonExtras(lesson) {
  if (lesson.track !== 'akkhara') return '';
  return `${akkharaReference(lesson.reference)}<section class="akkhara-recall"><h3>ลองตอบจากความจำ ก่อนเปิดแนวตอบ</h3><p>${lesson.recall.prompt}</p><details><summary>เปิดแนวตอบเพื่อเช็กตัวเอง</summary><p>${paliMarkup(lesson.recall.model)}</p><ul>${lesson.recall.checks.map(c => `<li>${c}</li>`).join('')}</ul><small>แนวตอบเพื่อฝึก ไม่ใช่เฉลยทางการ หากไม่แน่ใจให้ผู้สอนช่วยตรวจ</small></details></section><p class="muted akkhara-source">เรียบเรียงใหม่โดยอ้างอิงหัวข้อจาก <a href="${lesson.source.url}" target="_blank" rel="noopener noreferrer">บาลีธันเดอร์ ↗</a> · ตัวอย่างและเกมเขียนใหม่เพื่อเรียน</p>`;
}
export function akkharaQuestionGuide(question) {
  const lesson = akkharaLessons.find(l => question.id.startsWith(l.id+'-'));
  if (!lesson) return '';
  // Optional reference stays available in practice, including questions opened from the lobby.
  return akkharaReference(lesson.reference);
}
