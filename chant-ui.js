import { chantPacks, materializePack, KATHINA_RECIPIENT, KATHINA_VIDEO } from './chant-content.js?v=20261016-akkhara1';
import { chantRoman, chantTokens, compareChant, orderCorrect, parseChantLines, shuffledIndices, recordRecall, daysToKathina, chantVocabulary } from './chant-engine.js?v=20261016-akkhara1';
import { readAudio, storeAudio } from './chant-audio.js?v=20261016-akkhara1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (text, action, secondary = false, disabled = false) => `<button type="button" class="button ${secondary ? 'secondary' : ''}" data-action="chant-${action}" ${disabled ? 'disabled' : ''}>${text}</button>`;
const keyboard = () => `<div class="chant-keyboard">${button('ใส่พินทุ ฺ','insert:phinthu',true)}${button('ใส่นิคคหิต ํ','insert:nikkhahit',true)}</div>`;
const script = text => `<span class="chant-pali">${esc(text)}</span><span class="chant-roman">${esc(chantRoman(text))}</span>`;
const defaults = () => ({ version: 1, ...KATHINA_RECIPIENT, packs: {}, stats: {}, full: {}, audio: {} });
export function validateChantData(raw) {
  if (!raw || raw.version !== 1 || typeof raw.name !== 'string' || typeof raw.oblique !== 'string' || raw.name.length > 80 || raw.oblique.length > 80) throw new Error('ไฟล์สำรองบทสวดไม่ถูกต้อง');
  const result = defaults(); result.name = raw.name; result.oblique = raw.oblique;
  for (const pack of chantPacks) {
    const custom = raw.packs?.[pack.id];
    if (custom) {
      if (!Array.isArray(custom.lines)) throw new Error('รูปแบบวรรคในไฟล์ไม่ถูกต้อง');
      parseChantLines(custom.lines.map(l => l.text).join('\n'));
      if (!custom.lines.length || custom.lines.length > 120 || custom.lines.some(l => typeof l.text !== 'string' || !l.text.trim() || l.text.length > 700 || typeof l.meaning !== 'string' || l.meaning.length > 1000 || typeof l.grammar !== 'string' || l.grammar.length > 1000)) throw new Error('วรรคหรือคำแปลในไฟล์ไม่ถูกต้อง');
      result.packs[pack.id] = { lines: custom.lines.map((l, i) => ({ id: `${pack.id}-${i}`, text: l.text.trim(), meaning: l.meaning, grammar: l.grammar })), checked: custom.checked === true, complete: custom.complete === true, source: String(custom.source || '').slice(0, 300) };
    }
    const stats = raw.stats?.[pack.id];
    result.stats[pack.id] = {};
    if (stats && typeof stats === 'object') {
      for (const [key, s] of Object.entries(stats).slice(0, 120)) {
        if (!s || key.length > 800) continue;
        const safe = { spoken: s.spoken === true };
        for (const mode of ['order', 'cloze', 'recall']) {
          const n = s[mode];
          if (n && Number.isSafeInteger(n.attempts) && n.attempts >= 0 && n.attempts <= 100000 && Number.isSafeInteger(n.correct) && n.correct >= 0 && n.correct <= n.attempts && Number.isSafeInteger(n.streak) && n.streak >= 0 && n.streak <= n.attempts && Number.isFinite(n.lastAttempt) && Number.isFinite(n.dueAt)) safe[mode] = { attempts: n.attempts, correct: n.correct, streak: n.streak, lastAttempt: n.lastAttempt, dueAt: n.dueAt };
        }
        result.stats[pack.id][key] = safe;
      }
    }
    const full = raw.full?.[pack.id];
    if (full && Number.isFinite(full.at) && typeof full.text === 'string' && full.text.length <= 90000) result.full[pack.id] = { at: full.at, text: full.text, correct: full.correct === true };
    const a = raw.audio?.[pack.id];
    if (a) result.audio[pack.id] = { start: Number.isFinite(a.start) && a.start >= 0 ? a.start : 0, end: Number.isFinite(a.end) && a.end >= 0 ? a.end : 0, speed: [0.75, 1, 1.25].includes(a.speed) ? a.speed : 1, loop: a.loop === true };
  }
  return result;
}

export function createChantController({ storageKey, show, notify }) {
  let key, data, packId = 'third-monk', lineIndex = 0, mode = 'read', trial = null, audioUrl, audioOwner, mountId = 0, videoOpen = false;
  function load() {
    const next = storageKey();
    if (next === key) return;
    leave(); key = next; data = defaults();
    try { const saved = localStorage.getItem(key); if (saved) data = validateChantData(JSON.parse(saved)); }
    catch { notify('ข้อมูลซ้อมสวดเดิมอ่านไม่ได้ กรุณานำเข้าไฟล์สำรอง'); }
    packId = 'third-monk'; lineIndex = 0; mode = 'read'; trial = null; videoOpen = false;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch { throw new Error('บันทึกในเครื่องไม่ได้ กรุณาตรวจพื้นที่หรือสิทธิ์เก็บข้อมูลของเบราว์เซอร์ และดาวน์โหลดไฟล์สำรอง'); }
  }
  const pack = () => chantPacks.find(p => p.id === packId);
  const lines = () => data.packs[packId]?.lines || materializePack(pack(), data.name, data.oblique);
  const line = () => lines()[lineIndex];
  const lineKey = l => `${l.id}:${l.text}`;
  const stat = l => data.stats[packId]?.[lineKey(l)] || {};
  const complete = () => data.packs[packId]?.complete ?? pack().complete;
  function start(nextMode, index = lineIndex) {
    lineIndex = Math.max(0, Math.min(index, lines().length - 1)); mode = nextMode;
    const tokens = chantTokens(line().text);
    trial = { selected: [], tokens, bank: shuffledIndices(tokens.length), missing: Math.floor(Math.random() * tokens.length), result: null, answer: '', vocabulary: Math.floor(Math.random() * chantVocabulary.length) };
  }
  function dueLines() { return lines().map((l, i) => ({l, i, s: stat(l).recall})).filter(x => !x.s || x.s.dueAt <= Date.now()).sort((a,b) => (a.s?.dueAt || 0) - (b.s?.dueAt || 0)); }
  function summary() {
    const current = lines(), recalled = current.filter(l => stat(l).recall?.streak >= 1).length;
    const spoken = current.filter(l => stat(l).spoken).length;
    const successes = current.reduce((n,l) => n + ['order','cloze','recall'].reduce((m,s) => m + (stat(l)[s]?.correct || 0), 0), 0);
    const whole = data.full[packId]?.correct && data.full[packId]?.text === current.map(l=>l.text).join('\n');
    return {recalled, spoken, successes, whole};
  }
  function feedback() {
    if (!trial?.result) return '';
    const { correct, explanation } = trial.result;
    const next = mode === 'order' ? 'cloze' : mode === 'cloze' ? 'recall' : 'read';
    return `<div class="feedback ${correct ? '' : 'wrong'}" role="status"><h3>${correct ? '✓ จำได้อีกก้าว' : '↻ ค่อย ๆ ดู แล้วลองใหม่'}</h3><p>${esc(explanation)}</p>${!correct && trial.answer ? `<details><summary>เทียบกับที่คุณพิมพ์</summary><p class="chant-pali">${esc(trial.answer)}</p></details>` : ''}${mode !== 'vocab' ? script(mode === 'full' ? lines().map(l=>l.text).join('\n') : line().text) : ''}</div><div class="actions">${button('ลองใหม่', `mode:${mode}`, true)}${mode === 'vocab' ? button('ศัพท์ข้อต่อไป →', 'mode:vocab') : mode === 'full' ? button('กลับไปซ้อมทีละวรรค', 'mode:read') : correct ? mode==='recall' && lineIndex===lines().length-1 ? button('ซ้อมต่อส่วนที่มี →','mode:full') : button(next === 'read' ? 'วรรคถัดไป →' : 'ฝึกขั้นถัดไป →', `advance:${next}`) : ''}</div>`;
  }
  function practice() {
    const l = line();
    if (!trial) start('read');
    if (mode === 'edit') return editor();
    if (mode === 'sheet') return `<article class="panel chant-sheet"><h2>${esc(pack().title)} · ต้นฉบับซ้อมของฉัน</h2><p>ผู้รับกฐิน: ${esc(data.name)} / ${esc(data.oblique)} · ${esc(data.packs[packId]?.source || pack().source)}</p><p class="muted">${data.packs[packId]?.checked ? 'ผู้เรียนแจ้งว่าพระผู้กำกับตรวจข้อความแล้ว' : 'ยังรอพระผู้กำกับตรวจข้อความ ชื่อพระ และส่วนที่ต้องสวดก่อนใช้วันงาน'}</p><div class="actions">${button('ดาวน์โหลดบทซ้อม .txt','text-export',true)}${button('พิมพ์ / เก็บเป็น PDF','print',true)}${button('กลับไปฝึกทีละวรรค','mode:read')}</div>${lines().map((l,i)=>`<section class="chant-sheet-line"><small>วรรค ${i+1}</small>${script(l.text)}<details><summary>ความหมายและรูปศัพท์</summary><p>${esc(l.meaning)}</p><p>${esc(l.grammar)}</p></details></section>`).join('')}${packId==='third-monk'?'<p class="muted">คำตอบของสงฆ์ตามภาพ: รุจฺจติ ภนฺเต (ruccati bhante) — ไม่ใช่วรรคขององค์ที่ ๓</p>':''}</article>`;
    if (mode === 'full') return `<section class="panel"><h2>${complete() ? 'ซ้อมต่อบทจากความจำ' : 'ซ้อมต่อส่วนที่มีในภาพ (ยังไม่ครบทั้งบท)'}</h2><p>ลองสวดออกเสียงก่อน แล้วพิมพ์บทตามลำดับโดยไม่ดูต้นฉบับ การตรวจนี้วัดตัวอักษร ไม่ได้ตรวจเสียงหรือทำนอง</p>${trial.result ? feedback() : `<form id="chant-answer-form"><label for="chant-answer">บทที่คุณจำได้ (${lines().length} วรรค)</label><textarea id="chant-answer" name="answer" rows="12" required autocomplete="off" spellcheck="false"></textarea>${keyboard()}<p class="error" role="alert"></p><button class="button" type="submit">ตรวจบทที่จำได้</button></form>`}</section>`;
    if (mode === 'vocab') {
      const v = chantVocabulary[trial.vocabulary];
      return `<section class="panel"><span class="badge">เรียนศัพท์ทีละคำ</span><h2>${esc(v.question)}</h2>${trial.result ? `<div class="feedback ${trial.result.correct ? '' : 'wrong'}"><h3>${trial.result.correct ? '✓ ถูกต้อง' : '↻ คำตอบคือ'}</h3>${script(v.pali)}<p>${esc(v.meaning)}</p><p>${esc(v.grammar)}</p></div>${button('ศัพท์ข้อต่อไป →','mode:vocab')}` : `<div class="chant-choices">${v.options.map((o,i)=>button(esc(o),`vocab:${i}`,true)).join('')}</div>`}<p class="muted">ศัพท์พื้นฐานเพื่อเข้าใจบท ไม่ใช่ข้อสอบจริง</p></section>`;
    }
    const prefix = `<div class="section-head"><h2>วรรค ${lineIndex+1} / ${lines().length}</h2><div class="actions">${button('← ก่อนหน้า',`line:${lineIndex-1}`,true,lineIndex===0)}${button('ถัดไป →',`line:${lineIndex+1}`,true,lineIndex===lines().length-1)}</div></div><div class="chant-modes">${[['read','๑ อ่านให้เข้าใจ'],['order','๒ เรียงคำ'],['cloze','๓ เติมคำ'],['recall','๔ ท่องเอง']].map(([id,label])=>`<button type="button" data-action="chant-mode:${id}" class="${mode===id?'active':''}">${label}</button>`).join('')}</div>`;
    let body = '';
    if (mode === 'read') body = `${script(l.text)}<section class="chant-meaning"><h3>ความหมายเพื่อเรียนรู้</h3><p>${esc(l.meaning || 'ยังไม่มีคำแปลที่ตรวจแล้วสำหรับวรรคที่คุณเพิ่ม')}</p><details><summary>ค่อย ๆ ดูรูปศัพท์และหน้าที่</summary><p>${esc(l.grammar || 'เพิ่มข้อสังเกตกับพระผู้สอนในหน้าปรับต้นฉบับได้')}</p></details></section><p class="muted">อ่านออกเสียงช้า ๆ ๒ รอบ แล้วลองซ่อนต้นฉบับ</p>${button('พร้อมแล้ว เล่นเรียงคำ →','mode:order')}<div class="chant-check"><label><input type="checkbox" id="chant-spoken" ${stat(l).spoken?'checked':''}> ฉันสวดวรรคนี้ให้พระผู้กำกับฟัง และได้รับการตรวจเสียงแล้ว</label></div>`;
    if (trial.result && mode !== 'read') body = feedback();
    else if (mode === 'order') body = `<h3>ต่อวรรคให้ถูก จากคำที่กระจายอยู่</h3><p class="muted">แตะคำทีละคำ · คำซ้ำเลือกได้ตามจำนวนที่มี</p><div class="chant-selected" aria-live="polite">${trial.selected.length ? trial.selected.map(i=>`<span class="word-chip">${esc(trial.tokens[i])}</span>`).join(' ') : 'วรรคที่คุณเรียงจะอยู่ตรงนี้'}</div><div class="chant-bank">${trial.bank.map(i=>button(esc(trial.tokens[i]),`pick:${i}`,true,trial.selected.includes(i))).join('')}</div><div class="actions">${button('ตรวจลำดับ','check-order',false,trial.selected.length!==trial.tokens.length)}${button('ย้อนคำล่าสุด','undo',true,!trial.selected.length)}</div>`;
    else if (mode === 'cloze') body = `<h3>คำที่หายไปคือคำไหน?</h3><p class="chant-pali">${trial.tokens.map((t,i)=>i===trial.missing?'<strong class="chant-blank">______</strong>':esc(t)).join(' ')}</p><form id="chant-answer-form"><label for="chant-answer">เติมคำจากความจำ</label><input id="chant-answer" name="answer" required autocomplete="off" spellcheck="false">${keyboard()}<p class="error" role="alert"></p><button class="button" type="submit">ตรวจคำที่เติม</button></form>`;
    else if (mode === 'recall') body = `<h3>คราวนี้ท่องวรรคโดยไม่เห็นต้นฉบับ</h3><p>ลองสวดออกเสียงก่อน แล้วพิมพ์จากความจำ พินทุ (ฺ) และนิคคหิต (ํ) เป็นส่วนของอักษรที่ตรวจด้วย</p><form id="chant-answer-form"><label for="chant-answer">วรรคที่คุณจำได้</label><textarea id="chant-answer" name="answer" rows="4" required autocomplete="off" spellcheck="false"></textarea>${keyboard()}<p class="error" role="alert"></p><button class="button" type="submit">ตรวจและบันทึกการท่อง</button></form>`;
    return `${prefix}<section class="panel chant-practice">${body}</section>`;
  }
  function editor() {
    const custom = data.packs[packId];
    return `<section class="panel"><h2>ตรวจและปรับต้นฉบับของฉัน</h2><p>คัดลอกวรรคจากหนังสือวัด วรรคละหนึ่งบรรทัด เกมจะตรวจตามข้อความนี้ การแก้ข้อความจะเริ่มประวัติซ้อมชุดนี้ใหม่</p><form id="chant-edit-form"><label for="chant-source">ที่มาของต้นฉบับ</label><input id="chant-source" name="source" maxlength="300" value="${esc(custom?.source || pack().source)}"><label for="chant-text">บทสวดบาลีอักษรไทย</label><textarea id="chant-text" name="text" rows="12" required spellcheck="false">${esc(lines().map(l=>l.text).join('\n'))}</textarea><label for="chant-meanings">ความหมาย (หนึ่งบรรทัดต่อหนึ่งวรรค · เว้นว่างได้)</label><textarea id="chant-meanings" name="meanings" rows="6">${esc(lines().map(l=>l.meaning).join('\n'))}</textarea><label for="chant-notes">รูปศัพท์และข้อสังเกต (หนึ่งบรรทัดต่อหนึ่งวรรค)</label><textarea id="chant-notes" name="notes" rows="6">${esc(lines().map(l=>l.grammar).join('\n'))}</textarea><label class="chant-check"><input type="checkbox" name="complete" ${complete()?'checked':''}> ฉันมีข้อความทุกวรรคของบทนี้แล้ว</label><label class="chant-check"><input type="checkbox" name="checked" ${custom?.checked?'checked':''}> พระผู้กำกับตรวจข้อความ ชื่อพระ และส่วนที่ฉันต้องสวดแล้ว</label><p class="error" role="alert"></p><button class="button" type="submit">บันทึกต้นฉบับของฉัน</button></form></section>`;
  }
  function audioPanel() {
    const a = data.audio[packId] || {start:0,end:0,speed:1,loop:false};
    return `<section class="panel chant-audio"><h2>ฟังแล้วสวดตาม · ทำนองของวัด</h2><p>คลิปต้นแบบที่คุณส่ง ให้พระผู้กำกับยืนยันช่วงที่ต้องสวดและทำนองพระป่าธรรมยุตที่วัดใช้ ชื่อพระในคลิปอาจต่างจากงานนี้ ให้ซ้อมชื่อในต้นฉบับของคุณ</p><div class="actions">${button(videoOpen?'ปิดคลิปต้นแบบ':'เปิดคลิปต้นแบบในหน้านี้','video',true)}<a class="button secondary" href="${KATHINA_VIDEO}" target="_blank" rel="noopener noreferrer">ฟังบน YouTube ↗</a></div>${videoOpen?'<iframe class="chant-video" src="https://www.youtube-nocookie.com/embed/eu12ktzvpfQ" title="คลิปสวดกฐินต้นแบบที่ผู้เรียนส่ง" allow="fullscreen; encrypted-media" allowfullscreen></iframe>':''}<p class="muted">หากคลิปไม่อนุญาตให้ฝัง ให้เปิดบน YouTube เลือกความเร็วในเครื่องเล่นได้</p><h3>วนเฉพาะวรรคด้วยไฟล์เสียงจากวัด</h3><label for="chant-audio-file">เพิ่มไฟล์เสียงต้นแบบ (ไม่เกิน 80 MB)</label><input id="chant-audio-file" type="file" accept="audio/*"><p id="chant-audio-status" class="muted" role="status">กำลังตรวจเสียงที่เก็บในเครื่อง…</p><audio id="chant-audio" controls preload="metadata" hidden></audio><div class="chant-audio-controls"><label>เริ่ม A (วินาที)<input id="chant-audio-start" type="number" min="0" step="0.1" value="${a.start}"></label><label>จบ B (วินาที)<input id="chant-audio-end" type="number" min="0" step="0.1" value="${a.end}"></label><label>ความเร็ว<select id="chant-audio-speed"><option value="0.75" ${a.speed===0.75?'selected':''}>0.75×</option><option value="1" ${a.speed===1?'selected':''}>1×</option><option value="1.25" ${a.speed===1.25?'selected':''}>1.25×</option></select></label></div><label class="chant-check"><input type="checkbox" id="chant-audio-loop" ${a.loop?'checked':''}> วนช่วง A–B (ตั้ง B มากกว่า A)</label><p class="muted">ไฟล์เสียงอยู่เฉพาะอุปกรณ์นี้ ไม่แนบไปกับไฟล์สำรองบทสวด</p></section>`;
  }
  function render() {
    load(); if (lineIndex >= lines().length) start('read',0);
    const s = summary(), due = dueLines();
    const retainedAudio = audioOwner === `${key}:${packId}` ? document.querySelector('#chant-audio') : null;
    const retainedStatus = document.querySelector('#chant-audio-status')?.textContent;
    const retainedVideo = videoOpen ? document.querySelector('.chant-video') : null;
    show(`<div class="heading"><div><div class="eyebrow">ซ้อมวันนี้ · ใช้จริงวันงาน</div><h1>ภารกิจจำบทสวดกฐิน</h1><p class="muted">๑ พฤศจิกายน ๒๕๖๙ · ${daysToKathina()} วันถึงเป้าหมาย</p></div><img class="chant-scene" src="./assets/kathina.svg" alt="น้องช้างกับนกช่วยกันซ้อมบทสวดหน้าศาลา" width="230" height="150"></div><div class="banner">ประวัติซ้อมบทสวดและเสียงเก็บเฉพาะเครื่องนี้ แยกตามบัญชีที่เข้าใช้ ยังไม่ซิงก์ข้ามเครื่อง ดาวน์โหลดไฟล์สำรองเมื่อซ้อมเสร็จ</div><div class="chant-pack-tabs">${chantPacks.map(p=>`<button type="button" class="${p.id===packId?'active':''}" data-action="chant-pack:${p.id}">${esc(p.title)}</button>`).join('')}</div><section class="chant-source"><h2>${esc(pack().title)}</h2><p>${esc(pack().intro)}</p><p class="muted">${esc(data.packs[packId]?.source || pack().source)}</p><p>${esc(pack().note)}</p><span class="badge">${data.packs[packId]?.checked?'ผู้เรียนแจ้งว่าพระผู้กำกับตรวจต้นฉบับแล้ว':'รอพระผู้กำกับตรวจต้นฉบับและชื่อพระ'}</span>${!complete()?'<p class="error">ชุดนี้ยังไม่ครบทั้งบท ซ้อมได้เฉพาะส่วนที่มี</p>':''}<div class="actions">${button('เปิดบทเต็ม / เก็บไปซ้อม','mode:sheet',true)}${button('ปรับต้นฉบับ','mode:edit',true)}${button('เกมความหมาย','mode:vocab',true)}${button('ซ้อมต่อบท','mode:full',true)}</div></section><div class="stats"><div class="stat"><span class="muted">พิมพ์จากความจำถูกล่าสุด</span><div class="value">${s.recalled}<small>/ ${lines().length} วรรค</small></div></div><div class="stat"><span class="muted">พระผู้กำกับตรวจเสียงแล้ว</span><div class="value">${s.spoken}<small>/ ${lines().length} วรรค</small></div><small>จากที่คุณแจ้ง</small></div><div class="stat"><span class="muted">ดาวการฝึกของฉัน</span><div class="value">${s.successes}<small>★</small></div><small>รอบที่ตอบถูก · แยกจาก XP และอันดับ</small></div></div><section class="chant-plan"><h3>${due.length?'วันนี้ยังมี '+due.length+' วรรคให้ทบทวน':'ทบทวนครบตามรอบนี้แล้ว'}</h3><p>ตั้งเป้าวรรคใหม่วันละ ${Math.max(1, Math.ceil((lines().length - s.recalled) / Math.max(1, daysToKathina() - 4)))} วรรค พร้อมทบทวนวรรคเดิม เว้น ๔ วันท้ายสำหรับเชื่อมบทและซ้อมกับพระผู้กำกับ หลังท่องถูกจะนัดทบทวนอีก ๑ ชั่วโมง → ๑๒ ชั่วโมง → ๑ วัน → ๒ วัน</p>${button('ซ้อมวรรคที่ถึงเวลา →',`due`,false,!due.length)}<p class="muted">${s.whole?'พิมพ์ต่อส่วนที่มีได้ถูกแล้ว · ยังต้องตรวจเสียงและจังหวะกับพระผู้กำกับ':'ยังไม่มีรอบพิมพ์ต่อส่วนที่มีถูกทั้งหมด'} เกมไม่รับรองความถูกต้องของสังฆกรรมหรือทำนอง</p></section>${practice()}<details class="panel"><summary>แผนที่วรรค · ดูความก้าวหน้า</summary><ol class="chant-map">${lines().map((l,i)=>`<li>${button(`${i+1}. ${esc(l.text.slice(0,55))}${l.text.length>55?'…':''}`,`line:${i}`,true)}<span class="muted">${stat(l).recall?.streak?'✓ ท่องถูกล่าสุด':'รอท่องเอง'}${stat(l).spoken?' · ตรวจเสียงแล้ว':''}</span></li>`).join('')}</ol></details>${audioPanel()}<details class="panel"><summary>ตั้งชื่อพระ · สำรองและย้ายข้อมูลซ้อม</summary><form id="chant-name-form"><p>ต้องใช้รูปชื่อที่วัดกำหนดทั้งสองรูป การเปลี่ยนชื่อจะล้างประวัติซ้อมทั้งสองบท เพื่อไม่ให้ผลจากชื่อเดิมค้างอยู่</p><label for="chant-name">รูปชื่อประธาน เช่น สารธมฺโม</label><input id="chant-name" name="name" required maxlength="80" value="${esc(data.name)}"><label for="chant-oblique">รูปชื่อใน อายสฺมโต เช่น สารธมฺมสฺส</label><input id="chant-oblique" name="oblique" required maxlength="80" value="${esc(data.oblique)}"><p class="error" role="alert"></p><button type="submit" class="button secondary">บันทึกชื่อพระทั้งสองรูป</button></form><div class="actions">${button('ดาวน์โหลดบทและประวัติซ้อม','export',true)}</div><label for="chant-import">นำเข้าไฟล์สำรอง (แทนที่ชุดซ้อมในเครื่องนี้)</label><input id="chant-import" type="file" accept="application/json,.json"></details>`);
    if (retainedVideo) document.querySelector('.chant-video')?.replaceWith(retainedVideo);
    if (retainedAudio?.src) { document.querySelector('#chant-audio').replaceWith(retainedAudio); document.querySelector('#chant-audio-status').textContent = retainedStatus; }
    else mountAudio();
  }
  function record(correct, explanation) {
    data.stats[packId] ||= {};
    const k = lineKey(line()); data.stats[packId][k] ||= {};
    data.stats[packId][k][mode] = recordRecall(data.stats[packId][k][mode],correct);
    save(); trial.result = {correct, explanation};
  }
  async function action(action) {
    load(); const [verb,arg] = action.replace(/^chant-/,'').split(':');
    if (verb === 'insert') {
      const input=document.querySelector('#chant-answer'); if(!input||!['phinthu','nikkhahit'].includes(arg))return;
      input.setRangeText(arg==='phinthu'?'ฺ':'ํ',input.selectionStart,input.selectionEnd,'end'); input.focus(); return;
    }
    else if (verb === 'video') { videoOpen=!videoOpen; }
    else if (verb === 'pack') { if (!chantPacks.some(p=>p.id===arg)) return; packId=arg; start('read',0); }
    else if (verb === 'line') start('read',Number(arg));
    else if (verb === 'mode') { if (!['read','order','cloze','recall','full','vocab','edit','sheet'].includes(arg)) return; start(arg); }
    else if (verb === 'due') start('recall',dueLines()[0]?.i || 0);
    else if (verb === 'advance') { if (!trial?.result?.correct) return; if (arg==='read') start('read',lineIndex+1); else start(arg); }
    else if (verb === 'pick') { const i=Number(arg); if (mode!=='order'||trial.result||!Number.isInteger(i)||!trial.bank.includes(i)||trial.selected.includes(i)) return; trial.selected.push(i); }
    else if (verb === 'undo') { if (mode!=='order'||trial.result) return; trial.selected.pop(); }
    else if (verb === 'check-order') { if(mode!=='order'||trial.result||trial.selected.length!==trial.tokens.length) return; const correct=orderCorrect(trial.tokens,trial.selected); record(correct,correct?'เรียงวรรคได้ถูกแล้ว ลองเติมคำโดยลดตัวช่วย':'ลำดับยังไม่ตรงกับต้นฉบับ ลองอ่านวรรคนี้อีกครั้ง'); }
    else if (verb === 'vocab') { if(mode!=='vocab'||trial.result) return; const v=chantVocabulary[trial.vocabulary]; trial.result={correct:Number(arg)===v.answer}; }
    else if (verb === 'print') { window.print(); return; }
    else if (verb === 'text-export') {
      const text=`${pack().title}\nผู้รับกฐิน: ${data.name} / ${data.oblique}\n${data.packs[packId]?.source || pack().source}\nบทซ้อม: ตรวจข้อความ ชื่อพระ จุดหยุดและทำนองกับพระผู้กำกับก่อนใช้จริง\n\n`+lines().map((l,i)=>`${i+1}. ${l.text}\n${chantRoman(l.text)}\nความหมายเพื่อเรียน: ${l.meaning}\n`).join('\n');
      const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8'})); const a=document.createElement('a'); a.href=url; a.download=`kathina-${packId}.txt`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); return;
    }
    else if (verb === 'export') {
      const backup = structuredClone(data);
      for (const p of chantPacks) backup.packs[p.id] ||= {lines:materializePack(p,data.name,data.oblique),checked:false,complete:p.complete,source:p.source};
      const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
      const a=document.createElement('a'); a.href=url; a.download='kathina-my-practice.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); return;
    } else return;
    render();
  }
  async function submit(form) {
    load(); const values=new FormData(form);
    if(form.id==='chant-answer-form') {
      if(!trial||trial.result||!['cloze','recall','full'].includes(mode)) return;
      const expected=mode==='full'?lines().map(l=>l.text).join('\n'):mode==='cloze'?trial.tokens[trial.missing]:line().text;
      const answer=String(values.get('answer')||''); const result=compareChant(expected,answer);
      trial.answer=answer;
      const explanation=result.correct?'ตรงกับต้นฉบับที่ฝึกแล้ว (ไม่นับช่องว่างและเครื่องหมายวรรคตอน)':'ยังมีอักษรต่างจากต้นฉบับ เริ่มที่ตำแหน่ง '+(result.firstDifference+1)+' เมื่อตัดช่องว่างออก ตรวจพินทุ นิคคหิต และลำดับคำ แล้วลองอีกครั้ง';
      if(mode==='full') { data.full[packId]={at:Date.now(),text:expected,correct:result.correct}; save(); trial.result={correct:result.correct,explanation}; }
      else record(result.correct,explanation);
    } else if(form.id==='chant-edit-form') {
      const texts=parseChantLines(values.get('text')); const meanings=String(values.get('meanings')||'').split(/\r?\n/); const notes=String(values.get('notes')||'').split(/\r?\n/);
      if(meanings.some(t=>t.length>1000)||notes.some(t=>t.length>1000)) throw new Error('แบ่งคำแปลหรือข้อสังเกตให้สั้นลงไม่เกิน 1,000 ตัวต่อวรรค');
      const next = texts.map((text,i)=>({id:`${packId}-${i}`,text,meaning:meanings[i]||'',grammar:notes[i]||''}));
      const changed=JSON.stringify(next.map(l=>l.text))!==JSON.stringify(lines().map(l=>l.text));
      data.packs[packId]={lines:next,source:String(values.get('source')||''),checked:values.has('checked'),complete:values.has('complete')};
      if(changed) { data.stats[packId]={}; delete data.full[packId]; }
      save(); start('read',0); notify('บันทึกต้นฉบับของคุณในเครื่องนี้แล้ว');
    } else if(form.id==='chant-name-form') {
      const name=String(values.get('name')).trim(), oblique=String(values.get('oblique')).trim();
      if(!/^[ก-ฮะาิีุูเโํฺ]+$/.test(name)||!/^[ก-ฮะาิีุูเโํฺ]+$/.test(oblique)) throw new Error('ใส่เฉพาะชื่อบาลีอักษรไทยทั้งสองรูป ไม่ใส่วงเล็บหรือคำอธิบาย');
      if(name!==data.name||oblique!==data.oblique) {
        for(const custom of Object.values(data.packs)) { custom.lines=custom.lines.map(l=>({...l,text:l.text.replaceAll(data.oblique,oblique).replaceAll(data.name,name),meaning:l.meaning.replaceAll(data.name,name)})); custom.checked=false; }
        data.name=name; data.oblique=oblique; data.stats={}; data.full={}; save();
      }
      start('read',0); notify('บันทึกชื่อแล้ว ตรวจรูปชื่อทั้งสองกับพระผู้กำกับอีกครั้ง');
    } else return;
    render();
  }
  async function change(event) {
    load(); const target=event.target;
    if(target.id==='chant-spoken') {
      data.stats[packId] ||= {}; const k=lineKey(line()); data.stats[packId][k] ||= {}; data.stats[packId][k].spoken=target.checked; save(); render();
    } else if(target.id==='chant-import') {
      const file=target.files[0]; if(!file) return;
      if(file.size>1024*1024) throw new Error('ไฟล์สำรองต้องไม่เกิน 1 MB');
      const next=validateChantData(JSON.parse(await file.text()));
      // An imported check is not evidence that the current temple has reviewed this edition.
      for(const p of Object.values(next.packs)) p.checked=false;
      data=next; save(); start('read',0); render(); notify('นำเข้าบทและประวัติแล้ว กรุณาตรวจเทียบต้นฉบับกับวัด');
    } else if(target.id==='chant-audio-file') {
      const file=target.files[0]; if(!file) return;
      const audioKey=`${key}:${packId}`; target.disabled=true;
      try { await storeAudio(audioKey,file); if(audioKey===`${key}:${packId}`) { await mountAudio(); notify('เก็บเสียงต้นแบบในเครื่องแล้ว'); } } finally { if(target.isConnected) target.disabled=false; }
    } else if(target.id.startsWith('chant-audio-')) {
      const a={start:Number(document.querySelector('#chant-audio-start').value),end:Number(document.querySelector('#chant-audio-end').value),speed:Number(document.querySelector('#chant-audio-speed').value),loop:document.querySelector('#chant-audio-loop').checked};
      if(!Number.isFinite(a.start)||!Number.isFinite(a.end)||a.start<0||a.end<0||a.loop&&a.end<=a.start) { document.querySelector('#chant-audio-loop').checked=false; notify('ตั้งจุด B ให้มากกว่า A ก่อนเปิดวนเสียง'); a.loop=false; }
      data.audio[packId]=a; save(); const player=document.querySelector('#chant-audio'); player.playbackRate=a.speed;
    }
  }
  async function mountAudio() {
    const stamp=++mountId, player=document.querySelector('#chant-audio'), status=document.querySelector('#chant-audio-status'); if(!player) return;
    if(audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl=null; }
    const settings=()=>data.audio[packId]||{start:0,end:0,speed:1,loop:false};
    try {
      const stored=await readAudio(`${key}:${packId}`); if(stamp!==mountId||!player.isConnected) return;
      if(!stored) { status.textContent='ยังไม่มีเสียงต้นแบบของบทนี้ เลือกไฟล์จากวัดเพื่อเริ่มฟัง'; return; }
      audioOwner=`${key}:${packId}`; audioUrl=URL.createObjectURL(stored.blob); player.src=audioUrl; player.hidden=false; player.playbackRate=settings().speed;
      status.textContent=`เสียงต้นแบบในเครื่อง: ${stored.name}`;
      player.onerror=()=>{status.textContent='เบราว์เซอร์เล่นไฟล์นี้ไม่ได้ ลองไฟล์ MP3, M4A หรือ WAV';};
      const bounds=()=>{const a=settings(); return a.loop&&a.end>a.start&&Number.isFinite(player.duration)&&a.start<player.duration&&a.end<=player.duration;};
      player.onplay=()=>{if(bounds()&&(player.currentTime<settings().start||player.currentTime>=settings().end)) player.currentTime=settings().start;};
      player.ontimeupdate=()=>{if(bounds()&&player.currentTime>=settings().end) player.currentTime=settings().start;};
      player.onended=()=>{if(bounds()){player.currentTime=settings().start; player.play().catch(()=>{});}};
      player.onloadedmetadata=()=>{const a=settings(); if(a.loop&&!bounds())status.textContent=`${stored.name} · ช่วง A–B อยู่นอกความยาวเสียง กรุณาปรับใหม่`;};
    } catch { if(stamp===mountId&&status.isConnected) status.textContent='เครื่องนี้ยังเปิดพื้นที่เก็บเสียงไม่ได้ คุณยังฝึกข้อความได้ตามปกติ'; }
  }
  function leave() { mountId++; const player=document.querySelector('#chant-audio'); if(player)player.pause(); if(audioUrl)URL.revokeObjectURL(audioUrl); audioUrl=null; audioOwner=null; }
  return { render, action, submit, change, leave };
}
