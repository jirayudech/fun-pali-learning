import { gameQuestions, grammarLessons } from './grammar.js?v=20261014-course2';
import { authenticTranslationSamples, writingExercises } from './exam-data.js?v=20261014-course2';
export const examTopics = [
  {id:'T1',title:'สมัญญาภิธาน',lesson:'phonetics'}, {id:'T2',title:'สนธิ',lesson:'sandhi'},
  {id:'T3',title:'นามและสัพพนาม',lesson:'neuter'}, {id:'T4',title:'อาขยาต',lesson:'verb-parts'},
  {id:'T5',title:'กิตก์',lesson:'participles'}, {id:'T6',title:'สมาส',lesson:'compounds'}, {id:'T7',title:'ตัทธิต',lesson:'taddhita'}
];
const topicFor = lessonId => grammarLessons.find(l=>l.id===lessonId)?.topic || (lessonId==='verbs'?'T4':'T3');
export const choiceBank = gameQuestions.filter(q=>['choose','gap'].includes(q.kind)).map(q=>({...q,topic:topicFor(q.lessonId),kind:'original-choice'}));
const bank = [...choiceBank,...writingExercises,...authenticTranslationSamples];
export const examQuestion = id => bank.find(q=>q.id===id);
export function shuffle(items,random=Math.random) {
  const result=[...items];
  for(let i=result.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function createExam(kind,{year,minutes=20,now=Date.now(),random=Math.random}={}) {
  if(!['diagnostic','mock','writing','source'].includes(kind))throw new Error('ไม่พบรูปแบบซ้อมสอบ');
  if(![10,20,30,60,120,180].includes(minutes))throw new Error('เลือกเวลาซ้อมจากตัวเลือกที่มี');
  let ids;
  if(kind==='diagnostic'||kind==='mock') {
    const n=kind==='diagnostic'?2:3;
    ids=shuffle(examTopics.flatMap(t=>shuffle(choiceBank.filter(q=>q.topic===t.id),random).slice(0,n)),random).map(q=>q.id);
  } else if(kind==='writing') ids=writingExercises.map(q=>q.id);
  else { const q=authenticTranslationSamples.find(s=>s.year===year);if(!q)throw new Error('ไม่พบข้อความสอบของปีนี้');ids=[q.id]; }
  return {id:crypto.randomUUID(),kind,questionIds:ids,answers:{},index:0,startedAt:now,deadline:now+minutes*60000,minutes};
}
export function secondsRemaining(session,now=Date.now()) {return Math.max(0,Math.ceil((session.deadline-now)/1000));}
export function gradeExam(session,now=Date.now()) {
  const items=session.questionIds.map(id=>{
    const q=examQuestion(id), response=session.answers[id];
    const automatic=q.kind==='original-choice';
    return {id,response:response??(automatic?null:''),correct:automatic?Number.isInteger(response)&&response===q.answer[0]:null};
  });
  const automatic=items.every(i=>i.correct!==null);
  const categories=automatic?examTopics.map(t=>{
    const rows=items.filter(i=>examQuestion(i.id).topic===t.id);
    return {id:t.id,total:rows.length,score:rows.filter(i=>i.correct).length};
  }).filter(t=>t.total):[];
  return {id:session.id,kind:session.kind,questionIds:[...session.questionIds],items,categories,
    score:automatic?items.filter(i=>i.correct).length:null,total:automatic?items.length:null,
    selfReview:{},startedAt:session.startedAt,submittedAt:now,elapsedSeconds:Math.max(0,Math.floor((now-session.startedAt)/1000)),expired:now>=session.deadline};
}
function validSession(s) {
  return s && typeof s.id==='string' && ['diagnostic','mock','writing','source'].includes(s.kind) && Array.isArray(s.questionIds) && s.questionIds.length>0 && s.questionIds.length<=30 && new Set(s.questionIds).size===s.questionIds.length && s.questionIds.every(id=>{const q=examQuestion(id);return q&&(s.kind==='source'?q.kind==='source-excerpt':s.kind==='writing'?q.kind==='original':q.kind==='original-choice');}) && Number.isInteger(s.index) && s.index>=0 && s.index<s.questionIds.length && Number.isFinite(s.startedAt)&&Number.isFinite(s.deadline)&&s.deadline>s.startedAt;
}
export function validateExamData(raw) {
  if(!raw||raw.version!==1)throw new Error('รูปแบบไฟล์ประวัติซ้อมสอบไม่ถูกต้อง');
  const sanitizeAnswers = (ids,answers)=>Object.fromEntries(ids.map(id=>{
    const q=examQuestion(id),v=answers?.[id];
    return [id,q.kind==='original-choice'?Number.isInteger(v)&&v>=0&&v<q.options.length?v:null:typeof v==='string'?v.slice(0,10000):''];
  }));
  const result={version:1,active:null,attempts:[]};
  if(validSession(raw.active))result.active={...raw.active,answers:sanitizeAnswers(raw.active.questionIds,raw.active.answers)};
  if(Array.isArray(raw.attempts))for(const a of raw.attempts.slice(0,100)) {
    if(!validSession({...a,index:0,deadline:a.submittedAt+1})||!Number.isFinite(a.submittedAt)||a.submittedAt<a.startedAt||!Array.isArray(a.items))continue;
    const answers=sanitizeAnswers(a.questionIds,Object.fromEntries(a.items.filter(i=>i&&typeof i.id==='string').map(i=>[i.id,i.response])));
    const graded=gradeExam({id:a.id,kind:a.kind,questionIds:a.questionIds,answers,startedAt:a.startedAt,deadline:a.expired?a.submittedAt:a.submittedAt+1},a.submittedAt);
    for(const id of a.questionIds)if(examQuestion(id).kind!=='original-choice') {
      const n=examQuestion(id).rubric.length;
      const checks=a.selfReview?.[id];
      if(Array.isArray(checks)&&checks.length===n)graded.selfReview[id]=checks.map(v=>v===true);
    }
    result.attempts.push(graded);
  }
  return result;
}
