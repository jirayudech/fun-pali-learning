import { bangkokDay, learningStreak } from './game-engine.js?v=20261016-chants2';
import { dailyNotes, courseDay, makeDailyPlan, startDaily, replayDaily, reminderEvent } from './daily-engine.js?v=20261016-chants2';
import { gameQuestions } from './grammar.js?v=20261016-chants2';
import { gameQuestion } from './game-ui.js?v=20261016-chants2';
import { selectPair } from './pairing.js?v=20261016-chants2';
import { paliMarkup } from './pali-script.js?v=20261016-chants2';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const button = (text, action, style = '') => `<button class="button ${style}" data-action="${action}">${text}</button>`;

export function createDailyController({ storageKey, context, show, notify }) {
  let key, data, playing = false, record, selection = [], activeLeft = null, activeRight = null;
  const today = () => bangkokDay();
  function load() {
    const nextKey = storageKey();
    if (key === nextKey && data) return;
    key = nextKey; playing = false;
    data = { version: 1, startDay: today(), time: '09:00', sessions: {} };
    const raw = localStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(saved.startDay) || Number.isNaN(Date.parse(saved.startDay))) throw new Error('ข้อมูลแผนรายวันอ่านไม่ได้ กรุณาดาวน์โหลดข้อมูลเดิมสำรองก่อน');
      reminderEvent(saved.time);
      data = { ...data, startDay: saved.startDay, time: saved.time };
      for (const [day, item] of Object.entries(saved.sessions || {})) {
        if (item.day !== day) continue;
        replayDaily(item);
        data.sessions[day] = item;
      }
    } else save();
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch { throw new Error('บันทึกภารกิจไม่ได้ กรุณาตรวจพื้นที่เบราว์เซอร์ก่อนเรียนต่อ'); }
  }
  function completed() { return Object.values(data.sessions).filter(item => replayDaily(item).done); }
  function plan() {
    const current = context();
    const dailyHistory = completed().map(item => {
      const focus = item.questionIds.map((id, i) => ({ q: gameQuestions.find(q => q.id === id), answer: item.answers[i] })).filter(({ q }) => q.lessonId === item.lessonId);
      return { lesson_id: item.lessonId, score: focus.filter(({ q, answer }) => JSON.stringify(q.answer) === JSON.stringify(answer)).length,
        total: focus.length, created_at: item.completedAt || `${item.day}T23:59:00+07:00` };
    });
    return makeDailyPlan({ day: today(), startDay: data.startDay, history: [...current.history, ...dailyHistory], reported: current.reported });
  }
  function resetSelection() {
    const { state } = replayDaily(record);
    const q = state.queue[state.step];
    selection = q?.kind === 'pair' ? Array(q.left.length).fill(null) : [];
    activeLeft = activeRight = null;
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function teaser() {
    load();
    const item = data.sessions[today()], done = item && replayDaily(item).done;
    return `<section class="bottom-note daily-teaser"><img src="./assets/garden.svg" alt="" width="130" height="90"><div><span class="badge">${done ? '✓ ทำภารกิจวันนี้แล้ว' : 'วันนี้มีภารกิจรอคุณอยู่'}</span><h2>บาลีวันละ 15 นาที</h2><p>บทอ่านสั้น + เกม 5 ข้อ + ซ้อมสวด · เตือนเวลา ${esc(data.time)} น. ผ่านปฏิทินที่คุณตั้ง</p></div>${button('เปิดภารกิจวันนี้ →', 'nav:daily')}</section>`;
  }
  function render() {
    load();
    if (playing) {
      const { state, done } = replayDaily(record);
      if (state.step >= state.queue.length) { playing = false; return render(); }
      const game = { daily: true, demo: true, lessonId: record.lessonId, question: state.queue[state.step], step: state.step,
        total: state.queue.length, selected: selection, activeLeft, activeRight, feedback: state.feedback, done, xp: 0, combo: state.combo };
      return show(gameQuestion(game).replaceAll('data-action="game-', 'data-action="daily-'));
    }
    const item = data.sessions[today()], result = item && replayDaily(item);
    const p = plan();
    // Keep today's frozen focus visible after a completion changes the next recommendation.
    if (item) {
      p.lessonId = item.lessonId;
      p.title = context().lessonTitle(item.lessonId);
      if (result.done) p.reason = 'ผลวันนี้บันทึกแล้ว พรุ่งนี้ใช้คะแนนจริงจัดบททวนให้';
    }
    const finished = completed(), event = reminderEvent(data.time);
    show(`<div class="heading"><div><div class="eyebrow">A LITTLE EVERY DAY · เวลาไทย</div><h1>ภารกิจประจำวัน</h1><p class="muted">อ่าน 3 นาที · เล่น 7 นาที · ซ้อมสวด 5 นาที</p></div><span class="badge">วันที่ ${p.index} ของเส้นทางคุณ</span></div>
      <section class="panel daily-intro"><img class="daily-guide" src="./assets/guide.svg" alt="น้องช้างชวนกลับมาเรียนทุกวัน" width="160" height="160"><div><h2>${result?.done ? '✓ วันนี้คุณทำสำเร็จแล้ว' : 'กลับมาอีกวัน ก็เก่งขึ้นอีกนิด'}</h2><p>เรียนต่อเนื่อง ${learningStreak(finished.map(r => r.day))} วัน · จบภารกิจแล้ว ${finished.length} วัน</p><p class="muted">แผนเตรียมไว้ 14 วัน เปิดหัวข้ออ่านเพิ่มวันละหัวข้อตามเวลาไทย ชุดเกมเลือกจากคลังที่เขียนไว้ มีข้อเก่ากลับมาทวน ไม่ได้สร้างบทเรียนใหม่ไม่จำกัดอัตโนมัติ${p.index > 14 ? ' · ขณะนี้เข้ารอบทบทวนแผนเดิมแล้ว' : ''}</p></div></section>
      <section class="panel"><span class="eyebrow">1 · อ่านสั้นวันนี้</span><h2>${p.note.title}</h2><p>${paliMarkup(p.note.text)}</p><p><b>ลองทำ:</b> ${paliMarkup(p.note.task)}</p>${button('อ่านบทเต็ม', `lesson:${p.note.lessonId}`, 'secondary')}</section>
      <section class="panel"><span class="eyebrow">2 · เกมประจำวัน 5 ข้อ</span><h2>${esc(p.title)}</h2><p>${esc(p.reason)}</p>${result?.done ? `<p class="badge">✓ บันทึกภารกิจวันนี้แล้ว · ถูกครั้งแรก ${result.score}/${result.total}</p><p>หากยังไม่แม่น ไปทวนบทเต็มได้ วันนี้ไม่จำเป็นต้องเริ่มภารกิจใหม่เพื่อรักษาวันต่อเนื่อง</p>` : `<p>ตอบผิดมีโอกาสทวนไม่เกิน 2 รอบ กลับมาทำต่อได้เมื่อปิดเว็บ</p>${button(item ? 'ทำภารกิจต่อ →' : 'เริ่มเกมวันนี้ →', 'daily-start')}`}<div class="actions">${button('อ่านบทที่แนะนำก่อน', `lesson:${p.lessonId}`, 'secondary')}${button('เล่นด่านอื่นต่อ', 'nav:games', 'secondary')}</div></section>
      <section class="bottom-note"><img src="./assets/kathina.svg" alt="" width="130" height="90"><div><span class="eyebrow">3 · อย่าลืมเป้าหมายใกล้ตัว</span><h2>ซ้อมสวดกฐินอีก 5 นาที</h2><p>ทวนวรรคที่ยังติด พร้อมเทียบเสียงจริงและคำแปลก่อนวันงาน</p></div>${button('ไปซ้อมบทสวด →', 'nav:chants')}</section>
      <section class="panel"><h2>เตือนให้กลับมาเรียนทุกวัน</h2><label for="daily-time">เวลาเริ่มเรียน (เวลาไทย)</label><input id="daily-time" type="time" value="${esc(data.time)}"><p>กิจกรรมซ้ำทุกวัน 15 นาที เวลา ${esc(data.time)} น. เลือกวิธีเพิ่มลงปฏิทินของคุณ</p><div class="actions"><a class="button" href="${esc(event.googleUrl)}" target="_blank" rel="noopener noreferrer">เพิ่มใน Google ปฏิทิน ↗</a>${button('ดาวน์โหลดสำหรับ Apple / ปฏิทินอื่น', 'daily-calendar', 'secondary')}</div><p class="muted">ใน Google ปฏิทิน ให้ตั้งการแจ้งเตือน “0 นาทีก่อน” เพื่อเตือนตรง 09:00 น. (หรือตามเวลาที่เลือก) แล้วกดบันทึกกิจกรรม เว็บยังไม่ได้ตั้งเตือนบนอุปกรณ์ให้เอง เปิดกิจกรรมเดิมเพื่อเปลี่ยนเวลาหรือยกเลิก แทนการเพิ่มซ้ำ</p></section>
      <section class="panel"><h2>แผนอ่าน 14 วัน</h2><p class="muted">หัวข้อวันถัดไปเปิดอัตโนมัติเมื่อถึงวันใหม่ ถ้าพร้อมเรียนล่วงหน้า บทเต็มทั้ง ${context().lessonCount || 38} บทเปิดให้เรียนได้ทันที</p><ol class="daily-schedule">${dailyNotes.map((n, i) => `<li class="${(p.index - 1) % 14 === i ? 'today' : ''}"><span>วันที่ ${i + 1} · ${n.title}</span>${i < Math.min(p.index, 14) ? button('อ่าน', `daily-note:${i}`, 'secondary small') : '<span class="muted">รอถึงวันเรียน</span>'}</li>`).join('')}</ol></section>
      <section class="panel"><h2>ประวัติภารกิจของคุณ</h2>${finished.length ? `<ul>${finished.slice().sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14).map(r => `<li>${esc(r.day)} · ถูกครั้งแรก ${replayDaily(r).score}/5</li>`).join('')}</ul>` : '<p>ยังไม่มีผลจบภารกิจ เริ่มวันนี้แล้วค่อย ๆ สะสมวันเรียน</p>'}<p class="muted">ภารกิจและแบบร่างเก็บในเบราว์เซอร์นี้ แยกตามบัญชี ไม่ซิงก์ข้ามเครื่อง และไม่เพิ่ม XP หรืออันดับออนไลน์</p>${button('ดาวน์โหลดสำรองภารกิจ', 'daily-export', 'secondary')}</section>`);
  }
  async function action(action) {
    load();
    if (action === 'daily-start') {
      let current = data.sessions[today()];
      if (current && replayDaily(current).done) return render();
      if (!current) {
        current = startDaily(plan()); data.sessions[today()] = current;
        try { save(); } catch (error) { delete data.sessions[today()]; throw error; }
      }
      record = current; playing = true; resetSelection(); return render();
    }
    if (action === 'daily-calendar') { download(reminderEvent(data.time).ics, `pali-daily-${data.time.replace(':', '')}.ics`, 'text/calendar;charset=utf-8'); notify('เปิดไฟล์แล้วเพิ่มกิจกรรมในปฏิทิน เพื่อตั้งเตือนซ้ำทุกวัน'); return; }
    if (action === 'daily-export') return download(JSON.stringify(data, null, 2), 'pali-daily-backup.json', 'application/json');
    if (action.startsWith('daily-note:')) {
      const i = Number(action.split(':')[1]);
      if (!Number.isInteger(i) || i < 0 || i >= Math.min(courseDay(data.startDay), 14)) return;
      const n = dailyNotes[i];
      show(`<article class="panel"><span class="eyebrow">บทอ่านวันที่ ${i + 1}</span><h1>${n.title}</h1><p>${paliMarkup(n.text)}</p><p>${paliMarkup(n.task)}</p><div class="actions">${button('อ่านบทเต็ม', `lesson:${n.lessonId}`)}${button('กลับภารกิจวันนี้', 'daily-home', 'secondary')}</div></article>`); return;
    }
    if (action === 'daily-home') { playing = false; return render(); }
    if (!playing || !record) return;
    const { state, done } = replayDaily(record), q = state.queue[state.step];
    if (action === 'daily-next' && state.feedback) {
      const previous = record.acknowledged; record.acknowledged = true;
      try { save(); } catch (error) { record.acknowledged = previous; throw error; }
      if (done) playing = false;
      else resetSelection();
      return render();
    }
    if (state.feedback || !q) return;
    const index = Number(action.split(':')[1]);
    if (action === 'daily-check') {
      const candidate = { ...record, answers: [...record.answers, [...selection]], acknowledged: false };
      const result = replayDaily(candidate);
      if (result.done) candidate.completedAt = new Date().toISOString();
      const previous = data.sessions[record.day];
      data.sessions[record.day] = candidate;
      try { save(); } catch (error) { data.sessions[record.day] = previous; throw error; }
      record = candidate;
    } else if (action === 'daily-reset') resetSelection();
    else if (action.startsWith('daily-remove:') && q.kind === 'build') selection.splice(index, 1);
    else if (action.startsWith('daily-left:') || action.startsWith('daily-pick:')) {
      if (!Number.isInteger(index) || index < 0) return;
      if (q.kind === 'pair') {
        const next = selectPair({ selected: selection, activeLeft, activeRight }, action.startsWith('daily-left:') ? 'left' : 'right', index, q.options.length);
        selection = next.selected; activeLeft = next.activeLeft; activeRight = next.activeRight;
      } else if (index < q.options.length) {
        if (q.kind === 'build') { if (!selection.includes(index)) selection.push(index); }
        else selection = [index];
      }
    }
    render();
  }
  function change(event) {
    if (event.target.id !== 'daily-time') return;
    load(); reminderEvent(event.target.value); const previous = data.time; data.time = event.target.value;
    try { save(); } catch (error) { data.time = previous; throw error; }
    notify('บันทึกเวลาที่เลือกแล้ว กดเพิ่มในปฏิทินเพื่อเปิดใช้การเตือน'); render();
  }
  return { render, action, change, teaser, leave: () => { playing = false; } };
}
