import { grammarLessons, gameQuestions } from './grammar.js?v=20261016-akkhara1';
import { bangkokDay, createPractice, submitPractice, advancePractice } from './game-engine.js?v=20261016-akkhara1';

export const dailyNotes = [
  ['เริ่มที่คำกริยา', 'verb-parts', 'อาขยาตเป็นคำกริยาแบบหนึ่ง เช่น ขาทติ (khādati) กิน ใน ทารโก ผลํ ขาทติ (dārako phalaṃ khādati) เด็กกินผลไม้ เริ่มจากรู้ความหมายทั้งคำก่อนแยกส่วน', 'บอกให้ได้ว่าใครกิน และคำใดบอกการกิน'],
  ['สามส่วนของคำว่ากิน', 'verb-parts', 'ขาทฺ + อ + ติ → ขาทติ (khādati) ขาทฺ ธาตุบอกความหมายว่ากิน อ ปัจจัยช่วยประกอบรูป ติ วิภัตติในตัวอย่างนี้กล่าวถึงเขาคนเดียว อย่าตัดทุกกริยาด้วยวิธีเดียวกัน', 'เขียนชื่อ ธาตุ ปัจจัย วิภัตติ กำกับทีละส่วน'],
  ['ฉันกิน ต่างจากเขากิน', 'verb-person-drill', 'อหํ ขาทามิ (ahaṃ khādāmi) ฉันกิน เปรียบกับ ทารโก ขาทติ (dārako khādati) เด็กกิน คำท้ายกริยาช่วยบอกว่ากล่าวถึงผู้พูดหรือผู้อื่น', 'ลองเปลี่ยนจากฉันเป็นเธอ แล้วตรวจ ขาทสิ (khādasi)'],
  ['คนเดียวหรือหลายคน', 'verb-person-drill', 'ทารโก ขาทติ (dārako khādati) เด็กคนเดียวกิน; ทารกา ขาทนฺติ (dārakā khādanti) เด็กหลายคนกิน ดูทั้งนามและกริยา ไม่ดูส่วนท้ายคำเดียว', 'อ่านแต่ละคู่ แล้วบอกเอกวจนะหรือพหูพจน์พร้อมเหตุผล'],
  ['ใครเป็นคนกิน?', 'passive', 'ทารโก ผลํ ขาทติ (dārako phalaṃ khādati) เด็กกินผลไม้ ประธานคือเด็ก และเด็กเป็นผู้ทำ จึงเป็นกัตตุวาจก (active voice)', 'วงประธานแล้วเขียนว่า ประธานเป็นผู้กระทำ'],
  ['อะไรถูกกิน?', 'passive', 'ทารเกน ผลํ ขชฺชติ (dārakena phalaṃ khajjati) ผลไม้ถูกเด็กกิน ประธานคือผลไม้ซึ่งถูกกระทำ จึงเป็นกัมมวาจก (passive voice) เด็กยังเป็นคนกิน แต่ไม่ใช่ประธานในตัวอย่างนี้', 'อธิบายความต่างระหว่างประธานกับผู้กระทำเป็นภาษาไทย'],
  ['เติมคำว่า ฉลาด', 'adjective-agreement', 'กุสโล ปุริโส (kusalo puriso) ผู้ชายผู้ฉลาด กุสโล ขยาย ปุริโส ศัพท์สอบเรียกคำขยายลักษณะเช่นนี้ว่า วิเสสนะ คำขยายไม่ใช่การกระทำใหม่', 'ชี้คำหลักและคำขยายให้ถูกก่อนแปล'],
  ['คำขยายเปลี่ยนตามจำนวน', 'adjective-agreement', 'กุสลา ปุริสา (kusalā purisā) ผู้ชายผู้ฉลาดหลายคน ในตัวอย่างนี้ทั้งนามและคำขยายเป็นรูปปฐมา พหูพจน์ ปุงลิงค์ เทียบกับ กุสโล ปุริโส (kusalo puriso) คนเดียว', 'เขียนสองกลุ่มคำเทียบกัน ไม่เหมารวมว่าคำสัมพันธ์กันต้องลงท้ายเหมือนกันเสมอ'],
  ['อย่าให้คำว่า ไม่ หาย', 'negation-links', 'ทารโก ผลํ น ขาทติ (dārako phalaṃ na khādati) เด็กไม่กินผลไม้ น (na) ปฏิเสธการกิน ถ้าตกคำเดียว ความหมายกลับด้าน', 'อ่านคำแปลย้อนกลับแล้วตรวจว่ามีคำว่า ไม่'],
  ['และ เชื่อมใครกับใคร', 'negation-links', 'ทารโก จ ปุริโส จ ธมฺมํ สุณนฺติ (dārako ca puriso ca dhammaṃ suṇanti) เด็กและผู้ชายฟังธรรม จ (ca) เชื่อมผู้ฟังสองคน กริยาจึงเป็นพหูพจน์ในตัวอย่างนี้', 'ขีดเส้นเชื่อมผู้ทำสองคน และตรวจรูปกริยา'],
  ['ไปก่อน แล้วจึงนั่ง', 'sequence-practice', 'ทารโก วิหารํ คนฺตฺวา นิสีทติ (dārako vihāraṃ gantvā nisīdati) เด็กไปวิหารแล้วนั่งลง คนฺตฺวา บอกเหตุการณ์ก่อน นิสีทติ เป็นกริยาหลัก', 'วาดลูกศร ไปวิหาร → นั่งลง แล้วระบุว่าเป็นเด็กคนเดียวกัน'],
  ['คืนคำว่า ของ', 'compound-analysis', 'พุทฺธสาวโก (buddhasāvako) สาวกของพระพุทธเจ้า คืนความสัมพันธ์เป็น พุทฺธสฺส สาวโก (buddhassa sāvako) คำหลักคือสาวก ไม่ใช่พระพุทธเจ้า', 'แปลและคืนความสัมพันธ์ก่อนบอกชื่อ ฉัฏฐีตัปปุริสสมาส'],
  ['เดินประโยคยาวทีละส่วน', 'translation-boss', 'กุสโล ทารโก วิหารํ คนฺตฺวา ธมฺมํ สุณาติ (kusalo dārako vihāraṃ gantvā dhammaṃ suṇāti) เด็กผู้ฉลาดไปวิหารแล้วฟังธรรม หาคู่เด็ก–ฟังก่อน แล้วเชื่อมส่วนขยายและการไป', 'ปิดคำแปลแล้วเขียนเอง ตรวจว่าไม่เพิ่มผู้ทำคนใหม่'],
  ['ทวนก่อนก้าวต่อ', 'translation-boss', 'ยังใช้ประโยคเมื่อวาน แต่ลองแยก 5 จุด: ใครทำ ลักษณะของผู้ทำ ไปที่ไหน อะไรเกิดก่อน และฟังอะไร เกมช่วยทวนรูปคำ ส่วนงานเขียนควรให้ผู้สอนตรวจด้วย', 'ลองแปลโดยไม่ดูต้นแบบ แล้วเข้าห้องซ้อมสอบเขียนตอบ']
].map(([title, lessonId, text, task]) => ({ title, lessonId, text, task }));

const dayNumber = day => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
export function courseDay(startDay, today = bangkokDay()) {
  return Math.max(1, dayNumber(today) - dayNumber(startDay) + 1);
}
function rotate(items, offset) {
  if (!items.length) return [];
  const n = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}
export function makeDailyPlan({ day = bangkokDay(), startDay = day, history = [], reported = [] } = {}) {
  const index = courseDay(startDay, day);
  const note = dailyNotes[(index - 1) % dailyNotes.length];
  const latest = new Map();
  for (const h of [...history].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))) {
    if (!latest.has(h.lesson_id) && grammarLessons.some(l => l.id === h.lesson_id) && h.total > 0) latest.set(h.lesson_id, h.score / h.total);
  }
  const weak = [...latest].filter(([, score]) => score < .8).sort((a, b) => a[1] - b[1])[0]?.[0];
  const next = grammarLessons.find(l => !latest.has(l.id) && !reported.includes(l.id))?.id;
  const focusId = weak || next || note.lessonId;
  const focus = grammarLessons.find(l => l.id === focusId);
  const offset = dayNumber(day);
  const focusQuestions = rotate(focus.questions, offset);
  const review = rotate(grammarLessons.filter(l => l.id !== focusId && (latest.has(l.id) || reported.includes(l.id))).flatMap(l => l.questions), offset);
  const chosen = [...focusQuestions.slice(0, 3), ...review.slice(0, 2)];
  for (const q of focusQuestions) if (chosen.length < 5 && !chosen.some(c => c.id === q.id)) chosen.push(q);
  return { day, index, note, lessonId: focusId, title: focus.title,
    reason: weak ? 'ทวนเรื่องที่คะแนนล่าสุดยังไม่ถึง 80% ก่อนเพิ่มความยาก' : next ? 'ฝึกบทถัดไปตามผลการเรียน อ่านบทนี้ก่อนเล่นได้' : 'เรียนครบแล้ว ฝึกประยุกต์และทวนจากแผนประจำวัน',
    questionIds: chosen.map(q => q.id) };
}

export function startDaily(plan) {
  return { day: plan.day, lessonId: plan.lessonId, questionIds: plan.questionIds, answers: [], acknowledged: false };
}
export function replayDaily(record) {
  if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.day) || !grammarLessons.some(l => l.id === record.lessonId) ||
      !Array.isArray(record.questionIds) || record.questionIds.length !== 5 || new Set(record.questionIds).size !== 5 ||
      !Array.isArray(record.answers) || record.answers.length > 15) throw new Error('ข้อมูลภารกิจไม่ถูกต้อง');
  const questions = record.questionIds.map(id => gameQuestions.find(q => q.id === id));
  if (questions.some(q => !q)) throw new Error('ไม่พบโจทย์ของภารกิจนี้');
  const state = createPractice(questions);
  for (const [i, answer] of record.answers.entries()) {
    const q = state.queue[state.step];
    if (!q || !Array.isArray(answer) || answer.length !== q.answer.length || new Set(answer).size !== answer.length ||
        answer.some(n => !Number.isInteger(n) || n < 0 || n >= q.options.length)) throw new Error('คำตอบภารกิจไม่ถูกต้อง');
    submitPractice(state, answer, () => 0);
    if (i < record.answers.length - 1 || record.acknowledged) advancePractice(state);
  }
  const done = state.step >= state.queue.length || (Boolean(state.feedback) && state.step + 1 === state.queue.length);
  return { state, done, score: state.firstTryCorrect, total: 5 };
}

export function reminderEvent(time = '09:00', now = new Date()) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('เลือกเวลาให้ถูกต้อง');
  let start = new Date(`${bangkokDay(now)}T${time}:00+07:00`);
  if (start <= now) start = new Date(start.getTime() + 86400000);
  const end = new Date(start.getTime() + 15 * 60000);
  const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const url = 'https://jirayudech.github.io/fun-pali-learning/?daily=1';
  const details = `ฝึกบาลี 10 นาที แล้วซ้อมสวดกฐิน 5 นาที เปิดภารกิจวันนี้: ${url}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: 'เรียนบาลีทีละนิด · ภารกิจประจำวัน', dates: `${stamp(start)}/${stamp(end)}`, ctz: 'Asia/Bangkok', recur: 'RRULE:FREQ=DAILY', details });
  const escapeICS = value => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fun Pali Learning//Daily Study//TH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:pali-daily-study@jirayudech.github.io', `DTSTAMP:${stamp(new Date(now))}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    'RRULE:FREQ=DAILY', 'SUMMARY:เรียนบาลีทีละนิด · ภารกิจประจำวัน', `DESCRIPTION:${escapeICS(details)}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:ถึงเวลาเรียนบาลีและซ้อมสวดแล้ว', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  // RFC 5545: fold long lines at at most 75 UTF-8 octets without splitting Thai code points.
  const fold = line => {
    let out = '', current = '', bytes = 0;
    for (const c of line) { const n = new TextEncoder().encode(c).length; if (bytes + n > 75) { out += current + '\r\n'; current = ' '; bytes = 1; } current += c; bytes += n; }
    return out + current;
  };
  return { googleUrl: `https://calendar.google.com/calendar/render?${params}`, ics: lines.map(fold).join('\r\n') + '\r\n', start: start.toISOString() };
}
