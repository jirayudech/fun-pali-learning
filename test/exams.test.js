import test from 'node:test';
import assert from 'node:assert/strict';
import { examArchive } from '../exam-archive.js';
import { authenticTranslationSamples, writingExercises } from '../exam-data.js';
import { examTopics, examQuestion, createExam, gradeExam, secondsRemaining, validateExamData } from '../exam-engine.js';
import { lessons } from '../lessons.js';
const random=()=>0.4;
test('balanced diagnostics and mocks cover all seven categories without repeated questions',()=>{
  for(const [kind,n] of [['diagnostic',2],['mock',3]]) {
    const s=createExam(kind,{random,now:1000});
    assert.equal(s.questionIds.length,n*7);assert.equal(new Set(s.questionIds).size,s.questionIds.length);
    for(const t of examTopics) assert.equal(s.questionIds.filter(id=>examQuestion(id).topic===t.id).length,n);
  }
});
test('unanswered choices score zero and topic weaknesses derive from actual answers',()=>{
  const s=createExam('diagnostic',{random,now:1000});
  for(const id of s.questionIds)if(examQuestion(id).topic!=='T2')s.answers[id]=examQuestion(id).answer[0];
  const a=gradeExam(s,60000);
  assert.equal(a.score,12);assert.equal(a.total,14);
  assert.deepEqual(a.categories.find(t=>t.id==='T2'),{id:'T2',score:0,total:2});
  assert.ok(a.items.filter(i=>!i.correct).every(i=>i.response===null));
});
test('written work never receives an automatic official or semantic score',()=>{
  for(const s of [createExam('writing'),createExam('source',{year:2567})]) {
    for(const id of s.questionIds)s.answers[id]='ตัวอย่างคำตอบที่ผู้เรียนเขียน';
    const a=gradeExam(s);assert.equal(a.score,null);assert.equal(a.total,null);assert.ok(a.items.every(i=>i.correct===null));
    assert.ok(a.items.every(i=>i.response==='ตัวอย่างคำตอบที่ผู้เรียนเขียน'));
  }
});
test('the clock is based on persisted deadlines rather than restarting on reload',()=>{
  const s=createExam('mock',{now:1000,minutes:10});
  assert.equal(secondsRemaining(s,1000),600);assert.equal(secondsRemaining(s,301000),300);assert.equal(secondsRemaining(s,601000),0);
  const restored=validateExamData({version:1,active:s,attempts:[]}).active;
  assert.equal(secondsRemaining(restored,301000),300);
});
test('backup import recalculates fabricated scores and rejects unknown or mislabelled source questions',()=>{
  const s=createExam('diagnostic',{now:1000,random}),a=gradeExam(s,10000);a.score=14;
  const r=validateExamData({version:1,active:s,attempts:[a]});
  assert.equal(r.attempts[0].score,0);
  assert.equal(validateExamData({version:1,active:{...s,kind:'source'},attempts:[]}).active,null);
  assert.equal(validateExamData({version:1,active:{...s,questionIds:['invented-year']},attempts:[]}).active,null);
});
test('exactly ten verified years have source IDs matching their year and public source links',()=>{
  assert.deepEqual(examArchive.map(y=>y.year),[2569,2568,2567,2566,2565,2564,2563,2562,2561,2560]);
  assert.equal(examArchive.reduce((n,y)=>n+y.grammarCount,0),436);assert.equal(examArchive.reduce((n,y)=>n+y.translationCount,0),256);
  assert.equal(authenticTranslationSamples.length,10);
  for(const y of examArchive) {
    assert.ok(y.sample.id.startsWith(String(y.year)+'-'));assert.equal(y.sample.year,y.year);assert.equal(y.topics.length,7);
    assert.ok(y.topics.every(t=>t.count>0&&/^https:\/\/thunder\.purivaro\.com\/exam-bank\/set\/[0-9-]+$/.test(t.sourceUrl)));
    assert.equal(y.topics.reduce((n,t)=>n+t.count,0),y.grammarCount);
  }
});
test('original writing prompts are not classified as actual past papers, and every category has a review lesson',()=>{
  assert.equal(writingExercises.length,7);assert.ok(writingExercises.every(q=>q.kind==='original'&&q.notes.includes('ไม่ใช่ข้อสอบจริง')));
  assert.ok(authenticTranslationSamples.every(q=>q.kind==='source-excerpt'&&q.notes.includes('ไม่ใช่ข้อสอบทั้งฉบับ')));
  assert.equal(lessons.length,30);for(const t of examTopics)assert.ok(lessons.some(l=>l.id===t.lesson));
});
