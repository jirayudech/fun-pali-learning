import { examArchive, archiveMetadata } from './exam-archive.js?v=20261026-kale1';
import { examTopics, examQuestion, createExam, gradeExam, secondsRemaining, validateExamData } from './exam-engine.js?v=20261026-kale1';
import { chantRoman } from './chant-engine.js?v=20261026-kale1';
import { paliMarkup } from './pali-script.js?v=20261026-kale1';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action,secondary=false,disabled=false)=>`<button type="button" class="button ${secondary?'secondary':''}" data-action="exam-${action}" ${disabled?'disabled':''}>${label}</button>`;
const link=(label,url)=>`<a class="button secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
const time=sec=>`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
const date=ms=>new Date(ms).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'});
const titles={diagnostic:'ประเมินพื้นฐาน 14 ข้อ',mock:'ซ้อมปรนัย 21 ข้อ',writing:'ฝึกเขียนตอบ 7 หมวด',source:'ฝึกแปลข้อความสอบจริง'};
export function createExamController({storageKey,show,notify}) {
  let key,data,screen='lobby',currentResult=null,interval,preferredMinutes=20;
  function load() {
    const next=storageKey();if(next===key)return;leave();key=next;data={version:1,active:null,attempts:[]};screen='lobby';currentResult=null;
    try {const raw=localStorage.getItem(key);if(raw)data=validateExamData(JSON.parse(raw));}
    catch {notify('เปิดประวัติซ้อมสอบเดิมไม่ได้ กรุณานำเข้าไฟล์สำรอง');}
  }
  function save() {try{localStorage.setItem(key,JSON.stringify(data));}catch{throw new Error('บันทึกซ้อมสอบไม่ได้ กรุณาตรวจพื้นที่เบราว์เซอร์และดาวน์โหลดสำรอง');}}
  function capture() {
    if(!data?.active||screen!=='run'||secondsRemaining(data.active)===0)return;
    const input=document.querySelector('[data-exam-answer]');if(!input)return;
    const id=data.active.questionIds[data.active.index],q=examQuestion(id);
    if(q.kind==='original-choice') {const checked=document.querySelector('[data-exam-answer]:checked');if(checked)data.active.answers[id]=Number(checked.value);}
    else data.active.answers[id]=input.value.slice(0,10000);
    save();
  }
  function tick() {
    const el=document.querySelector('#exam-timer');if(!el||!data.active)return;
    const remaining=secondsRemaining(data.active);el.textContent=time(remaining);
    if(!remaining) {
      document.querySelector('#exam-time-status').textContent='หมดเวลาซ้อมแล้ว ส่งคำตอบเพื่อดูผลได้ ข้อที่ยังไม่ได้ตอบจะถูกบันทึกตามจริง';
      document.querySelectorAll('[data-exam-answer]').forEach(input=>input.disabled=true);
      document.querySelector('#exam-next')?.setAttribute('disabled','');
      document.querySelector('#exam-finish')?.removeAttribute('disabled');
    }
  }
  function activePanel() {
    return data.active?`<section class="exam-resume panel"><h3>มีรอบซ้อมที่ยังไม่ส่ง</h3><p>${titles[data.active.kind]} · ทำถึงข้อ ${data.active.index+1}/${data.active.questionIds.length} · เวลาเริ่ม ${date(data.active.startedAt)}</p><div class="actions">${btn('ทำรอบเดิมต่อ →','resume')}${btn('ยกเลิกรอบที่ค้างอยู่','discard',true)}</div><p class="muted">เวลาเดินต่อเมื่อออกจากหน้า ร่างเก็บอัตโนมัติในเครื่องนี้</p></section>`:'';
  }
  function lobby() {
    const last=data.attempts.find(a=>a.total!==null),weak=last?.categories.filter(t=>t.score/t.total<0.8).sort((a,b)=>a.score/a.total-b.score/b.total) || [];
    return `${activePanel()}<section class="exam-hero"><img src="./assets/exam.svg" alt="น้องช้างฝึกเขียนคำตอบกับนก" width="260" height="170"><div><h2>จากจำรูปศัพท์ สู่เขียนตอบและแปลได้</h2><p>เริ่มวัดพื้นฐาน แล้วเลือกบททบทวนตามจุดที่พลาด การซ้อมปรนัยตรวจอัตโนมัติ ส่วนงานเขียนใช้เกณฑ์ทบทวนและให้ผู้สอนตรวจเพิ่มเติม</p><span class="badge">24 บทเรียน · 7 หมวดไวยากรณ์ · แปลมคธเป็นไทย</span></div></section><div class="cards exam-start-cards">${[['diagnostic','วัดพื้นฐานก่อนเพิ่มความยาก','14 ข้อ · สุ่มหมวดละ 2 ข้อ'],['mock','ซ้อมคิดภายใต้เวลา','21 ข้อ · สุ่มหมวดละ 3 ข้อ'],['writing','เขียนคำอธิบายให้ครบ','7 ข้อ · มีแนวตอบและเกณฑ์ตรวจตนเอง']].map(([kind,title,desc])=>`<article class="lesson-card"><h3>${title}</h3><p>${desc}</p><p class="muted">โจทย์แต่งใหม่สำหรับประโยค 1–2</p>${btn('เริ่มซ้อม →',`start:${kind}`,false,!!data.active)}</article>`).join('')}</div><section class="panel"><h3>ตั้งเวลาซ้อม</h3><label for="exam-duration">เวลาของรอบใหม่ (เลือกเอง ไม่ใช่เวลาสอบทางการ)</label><select id="exam-duration">${[10,20,30,60,120,180].map(n=>`<option value="${n}" ${n===preferredMinutes?'selected':''}>${n} นาที</option>`).join('')}</select></section>${last?`<section class="panel"><h2>จุดที่ควรทบทวนจากรอบล่าสุด</h2><p>${last.score}/${last.total} · ${date(last.submittedAt)} · คะแนนแบบฝึกแต่งใหม่</p>${weak.length?weak.map(t=>{const topic=examTopics.find(x=>x.id===t.id);return `<div class="exam-topic-row"><span>${topic.title}: ${t.score}/${t.total}</span><button class="button secondary small" data-action="lesson:${topic.lesson}">ทบทวนบทนี้ →</button></div>`;}).join(''):'<p>รอบนี้ถึงเกณฑ์ฝึก 80% ทุกหมวดแล้ว ลองเขียนตอบและแปลข้อความจริงต่อได้ เกณฑ์นี้ตั้งสำหรับการฝึก ไม่ใช่เกณฑ์ผ่านสนามหลวง</p>'}</section>`:''}<section class="bottom-note"><div><h2>ข้อสอบย้อนหลังสิบปี</h2><p>ประโยค 1–2 · พ.ศ. 2560–2569 · ข้อความแปลคัดจากคลังพร้อมที่มา และลิงก์ชุดไวยากรณ์ต้นฉบับ</p></div>${btn('เลือกปีข้อสอบ →','archive')}</section>`;
  }
  function archive() {
    return `${activePanel()}<section class="panel"><h2>คลังประโยค 1–2 · พ.ศ. 2560–2569</h2><p>ตรวจข้อมูลจาก <a href="${archiveMetadata.source}" target="_blank" rel="noopener noreferrer">บาลีธันเดอร์</a> เมื่อ 14 ต.ค. 2569 ครบสิบปี รวมข้อย่อยไวยากรณ์ 436 รายการและข้อความแปล 256 รายการตามการแบ่งของคลัง ไม่ใช่จำนวนข้อสอบเต็มฉบับ</p><p>ในเว็บนี้ฝึกแปลจากข้อความบาลีคัดบางส่วนได้ ส่วนชุดไวยากรณ์และข้อความแปลเต็มเปิดที่ต้นทาง ลิงก์ชุดไวยากรณ์จัดตามหมวดจึงอาจมีข้อจากปีอื่นรวมอยู่ด้วย ตรวจป้ายปีและรหัสข้อทุกครั้ง</p></section><div class="exam-archive-grid">${examArchive.map(y=>`<article class="panel exam-year"><span class="badge">ประโยค 1–2</span><h2>พ.ศ. ${y.year}</h2><p class="muted">ครั้งที่ ${y.rounds.join(' / ')} · ไวยากรณ์ ${y.grammarCount} รายการ · แปล ${y.translationCount} รายการ</p><p>ตัวอย่างแปล: ${esc(y.sample.source)} · ครั้งที่ ${y.sample.round}</p><div class="actions">${btn('ฝึกแปลตัวอย่างปีนี้ →',`start:source:${y.year}`,false,!!data.active)}${link('เปิดคลังแปลเต็ม',y.sample.sourceUrl)}</div><details><summary>ชุดไวยากรณ์ที่มีข้อจากปี ${y.year}</summary><ul>${y.topics.map(t=>`<li><a href="${t.sourceUrl}" target="_blank" rel="noopener noreferrer">${t.name} (${t.count} รายการในปีนี้) ↗</a><small class="muted">รหัสตัวอย่าง ${esc(t.exampleIds.join(', '))}</small></li>`).join('')}</ul></details></article>`).join('')}</div>`;
  }
  function run() {
    const s=data.active;if(!s){screen='lobby';return lobby();}
    const q=examQuestion(s.questionIds[s.index]),answer=s.answers[q.id],choice=q.kind==='original-choice';
    return `<section class="exam-run-top"><div><span class="eyebrow">${titles[s.kind]}</span><h2>ข้อ ${s.index+1} / ${s.questionIds.length}</h2></div><div class="exam-clock"><span>เวลาที่เหลือ</span><strong id="exam-timer">${time(secondsRemaining(s))}</strong></div></section><p id="exam-time-status" class="muted" role="status">ร่างบันทึกอัตโนมัติ · ส่งคำตอบแล้วจึงเปิดเฉลย</p><progress class="progress" max="${s.questionIds.length}" value="${Object.values(s.answers).filter(v=>v!==null&&v!=='').length}" aria-label="จำนวนข้อที่มีคำตอบ"></progress><form id="exam-question-form" class="panel"><span class="badge">${q.kind==='source-excerpt'?'คัดข้อความบาลีจากข้อสอบจริง':'โจทย์แต่งใหม่เพื่อฝึก'}</span>${q.kind==='source-excerpt'?`<p class="muted">พ.ศ. ${q.year} · ครั้งที่ ${q.round} · ${esc(q.source)}<br>รหัส ${q.id} · ${q.excerpt?'คัดบางส่วนของข้อความ':'ข้อความที่คลังแบ่งไว้สำหรับฝึก'}<br><a href="${q.sourceUrl}" target="_blank" rel="noopener noreferrer">ตรวจข้อความและเฉลยต้นทาง ↗</a></p><h3>แปลเป็นไทย และเขียนรูปศัพท์กับหน้าที่ที่สังเกตได้</h3><p class="chant-pali">${esc(q.text)}</p><details><summary>ดูอักษรโรมันช่วยอ่าน</summary><p class="chant-roman">${esc(chantRoman(q.text))}</p></details>`:`<h3>${paliMarkup(q.text)}</h3>`}${choice?`<fieldset class="question"><legend>เลือกคำตอบเดียว</legend><div class="options">${q.options.map((option,n)=>`<label class="option"><input type="radio" name="answer" value="${n}" data-exam-answer ${answer===n?'checked':''} required><span>${paliMarkup(option)}</span></label>`).join('')}</div></fieldset>`:`<label for="exam-written">คำตอบของคุณ (ยังไม่เปิดแนวตอบ)</label><textarea id="exam-written" name="answer" data-exam-answer rows="9" maxlength="10000" spellcheck="false">${esc(answer||'')}</textarea>`}<p class="error" role="alert"></p><div class="actions">${btn('← ข้อก่อนหน้า','previous',true,s.index===0)}<button id="exam-next" class="button" type="submit">${s.index===s.questionIds.length-1?'ส่งคำตอบและดูผล →':'บันทึกและข้อถัดไป →'}</button>${btn('พักแล้วกลับหน้าซ้อมสอบ','pause',true)}</div></form><div class="exam-question-nav" aria-label="เลือกข้อสอบ">${s.questionIds.map((id,i)=>btn(`${i+1}${s.answers[id]!==undefined&&s.answers[id]!==null&&s.answers[id]!==''?' ✓':''}`,`jump:${i}`,s.index!==i)).join('')}</div><div class="actions">${btn('ส่งรอบนี้ (รวมข้อที่ยังไม่ตอบ)','finish',true)}</div><p class="muted">หมดเวลาจะหยุดรับคำตอบใหม่ แต่ยังต้องกดส่งเพื่อบันทึกผล ไม่มี XP หรือคะแนนอันดับจากการซ้อมสอบนี้</p>`;
  }
  function result() {
    const a=data.attempts.find(x=>x.id===currentResult);if(!a){screen='history';return history();}
    const automatic=a.total!==null;
    return `<section class="panel"><span class="badge">${titles[a.kind]}</span><h2>${automatic?`ได้ ${a.score} / ${a.total} ในแบบฝึกนี้`:'บันทึกงานเขียนแล้ว · รอตรวจตามเกณฑ์ฝึก'}</h2><p>${date(a.submittedAt)} · ใช้เวลา ${time(a.elapsedSeconds)} ${a.expired?'· ส่งหลังเวลาซ้อมหมด':''}</p>${automatic?`<div class="exam-category-results">${a.categories.map(t=>`<span class="badge">${examTopics.find(x=>x.id===t.id).title} ${t.score}/${t.total}</span>`).join('')}</div>`:'<p>การติ๊กเกณฑ์ด้านล่างเป็นการประเมินของคุณเอง ไม่ใช่การตรวจความหมายอัตโนมัติหรือคะแนนจากกรรมการสอบ นำคำตอบไปให้ผู้สอนตรวจได้</p>'}</section>${a.items.map((item,i)=>{
      const q=examQuestion(item.id),choice=q.kind==='original-choice',checks=a.selfReview[q.id]||Array(q.rubric?.length||0).fill(false);
      return `<article class="panel exam-feedback ${choice&&!item.correct?'exam-needs-review':''}"><h3>${i+1}. ${q.kind==='source-excerpt'?`ข้อความสอบปี ${q.year} ครั้งที่ ${q.round}`:paliMarkup(q.text)}</h3>${q.kind==='source-excerpt'?`<p class="chant-pali">${esc(q.text)}</p><p class="chant-roman">${esc(chantRoman(q.text))}</p><p class="muted">${esc(q.source)} · ${q.id} · <a href="${q.sourceUrl}" target="_blank" rel="noopener noreferrer">แหล่งต้นทาง ↗</a></p>`:''}<h4>คำตอบที่คุณส่ง</h4><p class="exam-written-answer">${choice?item.response===null?'ยังไม่ได้ตอบ':paliMarkup(q.options[item.response]):esc(item.response||'ยังไม่ได้เขียนตอบ')}</p>${choice?`<div class="feedback ${item.correct?'':'wrong'}"><strong>${item.correct?'✓ ถูกในแบบฝึกนี้':'↻ ควรทบทวน'}</strong><p>คำตอบ: ${paliMarkup(q.options[q.answer[0]])}</p><p>${paliMarkup(q.why)}</p></div><button class="button secondary small" data-action="lesson:${q.lessonId}">อ่านบทที่เกี่ยวข้อง →</button>`:`<details><summary>เปิดแนวตอบเพื่อเรียนรู้และเกณฑ์ตรวจตนเอง</summary><p>${paliMarkup(q.model)}</p>${q.analysis?`<ul>${q.analysis.map(text=>`<li>${esc(text)}</li>`).join('')}</ul>`:''}<p class="muted">${esc(q.notes)}</p>${q.rubric.map((text,n)=>`<label class="exam-rubric"><input type="checkbox" data-exam-rubric="${esc(q.id)}" data-index="${n}" ${checks[n]?'checked':''}> ${esc(text)}</label>`).join('')}</details><p class="exam-review-count muted">ผ่านเกณฑ์ที่คุณประเมิน ${checks.filter(Boolean).length}/${checks.length} จุด</p>`}</article>`;
    }).join('')}<div class="actions">${btn('เลือกซ้อมรอบใหม่','lobby')}${btn('ดูประวัติทั้งหมด','history',true)}${btn('ดาวน์โหลดคำตอบและประวัติ','export',true)}</div>`;
  }
  function history() {
    return `${activePanel()}<section class="panel"><h2>ประวัติซ้อมสอบของฉัน</h2>${data.attempts.length?`<ul class="history-list">${data.attempts.map(a=>`<li><div><h3>${titles[a.kind]}</h3><p class="muted">${date(a.submittedAt)} · ${a.questionIds.length} ข้อ · ${a.total===null?'งานเขียน: ตรวจตามเกณฑ์ฝึก':a.score+'/'+a.total+' คะแนนแบบฝึก'}</p></div>${btn('ดูคำตอบ',`result:${a.id}`,true)}</li>`).join('')}</ul>`:'<p>ยังไม่มีรอบที่ส่งคำตอบ ร่างที่ยังไม่ส่งจะไม่ถูกนับเป็นผลสอบ</p>'}<div class="actions">${btn('ดาวน์โหลดสำรอง JSON','export',true)}</div><label for="exam-import">นำเข้าไฟล์สำรองแทนประวัติในเครื่องนี้</label><input id="exam-import" type="file" accept="application/json,.json"></section>`;
  }
  function render() {
    load();clearInterval(interval);
    const content=screen==='archive'?archive():screen==='run'?run():screen==='result'?result():screen==='history'?history():lobby();
    show(`<div class="heading"><div><div class="eyebrow">สนามฝึกประโยค 1–2</div><h1>ซ้อมสอบบาลีสนามหลวง</h1><p class="muted">เป้าหมายที่คุณกำหนด: 3–4 มีนาคม 2570</p></div><span class="badge">เฉพาะประโยค 1–2</span></div><div class="exam-tabs">${[['lobby','เริ่มซ้อม'],['archive','ข้อสอบสิบปี'],['history','ประวัติซ้อมสอบ']].map(([id,label])=>btn(label,id,screen!==id)).join('')}</div><div class="banner">ประวัติซ้อมสอบและร่างคำตอบเก็บเฉพาะเครื่องนี้ แยกตามบัญชี ยังไม่ซิงก์ข้ามเครื่อง ดาวน์โหลดสำรองได้ในประวัติ</div>${content}`);
    if(screen==='run'){tick();interval=setInterval(tick,1000);}
  }
  async function action(action) {
    load();capture();const [verb,arg,year]=action.replace(/^exam-/,'').split(':');
    if(['lobby','archive','history'].includes(verb))screen=verb;
    else if(verb==='start') {
      if(data.active){notify('มีรอบที่ค้างอยู่ ทำต่อหรือกดยกเลิกรอบเดิมก่อน');return;}
      const minutes=Number(document.querySelector('#exam-duration')?.value||preferredMinutes);
      data.active=createExam(arg,{year:Number(year),minutes});save();screen='run';
    } else if(verb==='resume'){if(!data.active)return;screen='run';}
    else if(verb==='discard'){data.active=null;save();screen='lobby';}
    else if(verb==='pause')screen='lobby';
    else if(verb==='previous'){if(!data.active)return;data.active.index=Math.max(0,data.active.index-1);save();}
    else if(verb==='jump'){const n=Number(arg);if(!data.active||!Number.isInteger(n)||n<0||n>=data.active.questionIds.length)return;data.active.index=n;save();}
    else if(verb==='finish'){finish();}
    else if(verb==='result'){if(!data.attempts.some(a=>a.id===arg))return;currentResult=arg;screen='result';}
    else if(verb==='export'){
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='pali-my-exam-practice.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    } else return;
    render();if(screen==='run')document.querySelector('.exam-run-top')?.scrollIntoView({block:'start'});else window.scrollTo(0,0);
  }
  function finish() {
    if(!data.active)return;const result=gradeExam(data.active);data.attempts.unshift(result);data.attempts=data.attempts.slice(0,100);data.active=null;currentResult=result.id;save();screen='result';
  }
  async function submit(form) {
    load();if(form.id!=='exam-question-form'||!data.active)return;
    capture();const q=examQuestion(data.active.questionIds[data.active.index]);
    if(q.kind==='original-choice'&&data.active.answers[q.id]===undefined&&secondsRemaining(data.active)>0)throw new Error('เลือกคำตอบก่อน หรือใช้ปุ่มส่งรอบนี้เพื่อบันทึกข้อที่ยังไม่ตอบ');
    if(data.active.index===data.active.questionIds.length-1||secondsRemaining(data.active)===0)finish();else{data.active.index++;save();}
    render();if(screen==='run')document.querySelector('.exam-run-top')?.scrollIntoView({block:'start'});else window.scrollTo(0,0);
  }
  async function change(event) {
    const el=event.target;load();
    if(el.id==='exam-duration') {const n=Number(el.value);if([10,20,30,60,120,180].includes(n))preferredMinutes=n;}
    else if(el.matches('[data-exam-answer]'))capture();
    else if(el.dataset.examRubric){const a=data.attempts.find(x=>x.id===currentResult),q=examQuestion(el.dataset.examRubric),n=Number(el.dataset.index);if(!a||!q?.rubric||!a.questionIds.includes(q.id)||!Number.isInteger(n)||n<0||n>=q.rubric.length)return;a.selfReview[q.id]||=Array(q.rubric.length).fill(false);a.selfReview[q.id][n]=el.checked;save();el.closest('.exam-feedback').querySelector('.exam-review-count').textContent=`ผ่านเกณฑ์ที่คุณประเมิน ${a.selfReview[q.id].filter(Boolean).length}/${q.rubric.length} จุด`;}
    else if(el.id==='exam-import') {
      const file=el.files[0];if(!file)return;if(file.size>3*1024*1024)throw new Error('ไฟล์สำรองต้องไม่เกิน 3 MB');
      const importingKey=key,next=validateExamData(JSON.parse(await file.text()));if(importingKey!==storageKey())return;
      data=next;save();screen='history';render();notify('นำเข้าประวัติแล้ว คะแนนปรนัยตรวจใหม่จากคำตอบที่บันทึก ส่วนงานเขียนเป็นการประเมินตนเอง');
    }
  }
  function input(event) {if(event.target.matches('[data-exam-answer]'))capture();}
  function leave() {clearInterval(interval);capture();}
  return {render,action,submit,change,input,leave};
}
