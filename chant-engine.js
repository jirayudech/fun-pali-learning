import { bangkokDay } from './game-engine.js?v=20261031-pdf1';
export const KATHINA_DATE = '2026-11-01';
export function daysToKathina(today = bangkokDay()) {
  return Math.max(0, Math.round((Date.parse(KATHINA_DATE + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000));
}
export function normalizeChant(text) {
  // Preserve Pali letters, phinthu and nikkhahit; canonicalize the equivalent Thai iṃ signs, then ignore spacing/punctuation.
  return String(text ?? '').normalize('NFC').replaceAll('ึ', 'ิํ').replace(/[\s.,;:!?ฯ।॥]/g, '');
}
export function chantRoman(text) {
  const consonants = { ก:'k', ข:'kh', ค:'g', ฆ:'gh', ง:'ṅ', จ:'c', ฉ:'ch', ช:'j', ฌ:'jh', ญ:'ñ', ฏ:'ṭ', ฐ:'ṭh', ฑ:'ḍ', ฒ:'ḍh', ณ:'ṇ', ต:'t', ถ:'th', ท:'d', ธ:'dh', น:'n', ป:'p', ผ:'ph', พ:'b', ภ:'bh', ม:'m', ย:'y', ร:'r', ล:'l', ว:'v', ส:'s', ห:'h', ฬ:'ḷ', อ:'' };
  const vowels = { 'า':'ā', 'ิ':'i', 'ี':'ī', 'ุ':'u', 'ู':'ū' };
  let out = '', leading = '';
  // Thai Pali editions also write i + nikkhahit as the single sign ึ (e.g. ตสฺมึ).
  const chars = Array.from(String(text).normalize('NFC').replaceAll('ึ', 'ิํ'));
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === 'เ' || c === 'โ') { leading = c === 'เ' ? 'e' : 'o'; continue; }
    if (Object.hasOwn(consonants, c)) {
      out += consonants[c];
      if (chars[i + 1] === 'ฺ') { i++; continue; }
      if (vowels[chars[i + 1]]) out += vowels[chars[++i]];
      else out += leading || 'a';
      leading = '';
    } else if (c === 'ํ') out += 'ṃ';
    else { out += c; leading = ''; }
  }
  return out;
}
export function chantTokens(text) { return String(text).trim().split(/\s+/).filter(Boolean); }
export function orderCorrect(tokens, selected) {
  if (tokens.length !== selected.length || new Set(selected).size !== selected.length) return false;
  if (!selected.every(i => Number.isInteger(i) && i >= 0 && i < tokens.length)) return false;
  return tokens.every((token, i) => normalizeChant(token) === normalizeChant(tokens[selected[i]]));
}
export function compareChant(expected, actual) {
  const left = Array.from(normalizeChant(expected));
  const right = Array.from(normalizeChant(actual));
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index++;
  return { correct: index === left.length && index === right.length, firstDifference: index, expectedLength: left.length, actualLength: right.length };
}
export function parseChantLines(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 1 || lines.length > 1000) throw new Error('ใส่ 1–1,000 วรรค วรรคละหนึ่งบรรทัด');
  if (lines.some(l => l.length > 700)) throw new Error('วรรคยาวเกินไป กรุณาแบ่งวรรคตามต้นฉบับ');
  return lines;
}
export function shuffledIndices(size, random = Math.random) {
  const indices = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
  if (size > 1 && indices.every((v, i) => v === i)) [indices[0], indices[1]] = [indices[1], indices[0]];
  return indices;
}
export function recordRecall(stats, correct, now = Date.now()) {
  const attempts = (stats?.attempts || 0) + 1;
  const streak = correct ? (stats?.streak || 0) + 1 : 0;
  const intervalHours = [0, 1, 12, 24, 48][Math.min(streak, 4)];
  return { attempts, correct: (stats?.correct || 0) + (correct ? 1 : 0), streak, lastAttempt: now, dueAt: now + intervalHours * 3600000 };
}
export const chantVocabulary = [
  { pali: 'สุณาตุ', meaning: 'จงฟัง', grammar: 'รูปกริยาแสดงคำสั่งหรือคำขอ ในวลีเรียกให้สงฆ์ฟัง ประธานคือสงฆ์', question: 'สุณาตุ มีความหมายหลักในวลีเรียกสงฆ์ว่าอะไร?', options: ['จงฟัง', 'ข้าพเจ้าให้', 'ผ้ากฐิน'], answer: 0 },
  { pali: 'สงฺโฆ', meaning: 'สงฆ์', grammar: 'รูปปฐมาเอกวจนะของ สงฺฆ ในวลีที่สงฆ์เป็นประธาน เป็นนามอการันต์ปุงลิงค์', question: 'สงฺโฆ ในวลีที่เรียกให้สงฆ์ฟัง ทำหน้าที่ใด?', options: ['กรรม', 'ประธาน', 'คำบอกเวลา'], answer: 1 },
  { pali: 'กฐินทุสฺสํ', meaning: 'ผ้ากฐิน', grammar: 'รูปเอกวจนะของ กฐินทุสฺส รูปนี้เป็นได้ทั้งปฐมาและทุติยาในแบบนามนปุงสกลิงค์ ต้องดูประโยคก่อนกำหนดหน้าที่', question: 'ควรกำหนดหน้าที่ของ กฐินทุสฺสํ อย่างไร?', options: ['เป็นกรรมทุกครั้ง', 'ดูบริบท เพราะรูปนี้ใช้ได้มากกว่าหนึ่งหน้าที่', 'เป็นกริยาทุกครั้ง'], answer: 1 },
  { pali: 'ญตฺติ', meaning: 'ญัตติ หรือข้อเสนอให้สงฆ์พิจารณา', grammar: 'เป็นนาม คำว่า ญัตติ ในพิธีมีหน้าที่เป็นข้อเสนอแก่สงฆ์ อย่าสับสนกับชื่อบทหรือคำว่าอนุโมทนา', question: 'ญตฺติ ในบริบทสังฆกรรมหมายถึงอะไร?', options: ['ชื่อผู้ให้ผ้า', 'ข้อเสนอให้สงฆ์พิจารณา', 'จังหวะทำนอง'], answer: 1 },
  { pali: 'ตุณฺหี', meaning: 'นิ่ง หรือโดยความนิ่ง', grammar: 'ใช้เป็นคำบอกอาการ ไม่ใช่รูปกริยาที่แปลว่าให้ผ้า การแปลรายละเอียดต้องดูวลีเต็ม', question: 'ตุณฺหี สื่ออาการใด?', options: ['โดยความนิ่ง', 'การเดิน', 'การถวายดอกไม้'], answer: 0 },
  { pali: 'ธารยามิ', meaning: 'ข้าพเจ้าทรงจำหรือถือไว้', grammar: 'รูปกริยาที่ผู้พูดกล่าวถึงการกระทำของตน ความหมายในกรรมวาจาต้องพิจารณาวลีเต็มด้วย', question: 'ธารยามิ กล่าวถึงการกระทำของใคร?', options: ['ผู้พูดเอง', 'ผู้ฟังหลายคนเสมอ', 'ผ้ากฐิน'], answer: 0 }
];
