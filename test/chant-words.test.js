import test from 'node:test';
import assert from 'node:assert/strict';
import { chantPacks, materializePack, KATHINA_RECIPIENT } from '../chant-content.js';
import { chantTokens, parseChantLines, recordRecall } from '../chant-engine.js';
import { chantWordKey, lookupChantWord, validateWordGlosses, makeChantWordQuiz } from '../chant-lexicon.js';
import { validateChantData } from '../chant-ui.js';
import { chantWordMarkup, chantWordAnalysisMarkup } from '../chant-word-ui.js';
import { lookupChantAnalysis } from '../chant-analysis.js';
import { validateChantLibrary } from '../chant-library.js';
import { KALE_PACK } from '../kale-content.js';

test('every word in the current chants has a scoped learning gloss, including the five-word passage', () => {
  for (const pack of chantPacks) for (const line of materializePack(pack)) for (const word of chantTokens(line.text)) {
    const entry=lookupChantWord(word,{...KATHINA_RECIPIENT,kathina:pack.hasRecipient!==false,packId:pack.id});
    assert.ok(entry?.meaning,word); assert.ok(entry.grammar,word);
  }
  assert.match(lookupChantWord('สพฺรหฺมจารีนํ').grammar,/ฉัฏฐีพหุวจนะ/);
  assert.notEqual(lookupChantWord('สนฺทสฺสโก').meaning,lookupChantWord('สมาทปโก').meaning);
});
test('Kale word meanings are complete and scoped to that chant without replacing Namo or private glosses', () => {
  for (const line of materializePack(KALE_PACK)) for (const word of chantTokens(line.text)) {
    assert.ok(lookupChantWord(word,{packId:KALE_PACK.id})?.meaning,word);
  }
  const scoped=lookupChantWord('ตสฺส',{packId:KALE_PACK.id});
  assert.match(scoped.grammar,/ผู้ให้ทาน/);
  assert.match(lookupChantWord('ตสฺส',{packId:'kathina-motion'}).meaning,/พระองค์/);
  assert.match(lookupChantWord('ตสฺส').meaning,/พระองค์/);
  assert.equal(lookupChantWord('กาเล'),null);
  assert.equal(lookupChantWord('ตสฺส',{packId:KALE_PACK.id,overrides:{'ตสฺส':{meaning:'คำแปลเฉพาะของฉัน',grammar:''}}}).meaning,'คำแปลเฉพาะของฉัน');
});
test('missing forms and changed Pali signs do not get an invented dictionary match', () => {
  assert.equal(chantWordKey('“สพฺรหฺมจารีนํ,”'),'สพฺรหฺมจารีนํ');
  assert.equal(lookupChantWord('สมุตเตชโก'),null);
  assert.equal(lookupChantWord('คำที่ยังไม่มี'),null);
  assert.equal(lookupChantWord('constructor'),null);
  const entry={meaning:'ความหมายเฉพาะบริบท',grammar:'ตรวจจากฉบับที่ใช้'};
  assert.equal(lookupChantWord('โน',{overrides:{โน:entry}}).meaning,entry.meaning);
  assert.notEqual(lookupChantWord('โน').meaning,entry.meaning);
});
test('word rendering preserves the exact text while escaping content and making separate keyboard targets', () => {
  const html=chantWordMarkup('สนฺทสฺสโก สมาทปโก <img src=x onerror=alert(1)>',2);
  assert.ok(!html.includes('<img'));
  assert.match(html,/&lt;img/);
  assert.match(html,/data-chant-line="2"/);
  assert.match(html,/type="button"/);
  assert.match(html,/chant-word:2\./);
});
test('chant analysis separates front and back vowel elision from nominal inflection', () => {
  const first=lookupChantAnalysis('มญฺญามหํ'), second=lookupChantAnalysis('สพฺโพยํ'), noun=lookupChantAnalysis('สงฺโฆ');
  assert.deepEqual(first.parts.map(part=>part[0]),['มญฺญามิ','อหํ']);
  assert.match(first.sandhi,/โลปสระหน้า/);assert.match(first.sandhi,/อิ/);
  assert.match(first.compound,/ไม่ใช่สมาส/);assert.match(first.caution,/มญฺญาม เป็นกริยารูป “พวกเรา”/);
  assert.deepEqual(second.parts.map(part=>part[0]),['สพฺโพ','อยํ']);
  assert.match(second.sandhi,/โลปสระหลัง/);assert.match(second.context,/สงฆ์ทั้งหมดนี้/);
  assert.match(noun.inflection,/ปฐมาวิภัตติ เอกวจนะ/);
  assert.match(noun.sandhi,/ไม่ใช่การเชื่อมเสียงระหว่างคำสองคำ/);
  assert.notEqual(first.formula,second.formula);
});
test('word analysis is curated for exact forms and does not guess compounds from similar spelling', () => {
  assert.equal(lookupChantAnalysis('สมุตเตชโก'),null);
  assert.equal(lookupChantAnalysis('สพฺเพหิ'),null);
  assert.equal(lookupChantAnalysis('constructor'),null);
  assert.equal(lookupChantAnalysis('สพฺโพยํ'),lookupChantAnalysis('“สพฺโพยํ,”'));
  for(const word of ['สนฺทสฺสโก','สมาทปโก','สมุตฺเตชโก','สมฺปหํสโก']) {
    const entry=lookupChantAnalysis(word);assert.match(entry.sandhi,/อาเทสนิคคหิตสนธิ/);assert.ok(entry.steps.length>=2);
  }
  assert.match(lookupChantAnalysis('สพฺรหฺมจารีนํ').compound,/ยังไม่ระบุชนิดสมาส/);
  assert.match(lookupChantAnalysis('ราชปุตฺโต').compound,/ฉัฏฐีตัปปุริสสมาส/);
  assert.match(lookupChantAnalysis('ราชปุตฺโต').caution,/ไม่ใช่สูตรลบเสียง/);
  for(const word of ['มญฺญามหํ','สพฺโพยํ','สงฺโฆ','สพฺรหฺมจารีนํ','สนฺทสฺสโก','สมาทปโก','สมุตฺเตชโก','สมฺปหํสโก','ราชปุตฺโต']) assert.ok(lookupChantWord(word)?.meaning,word);
});
test('Kale analysis distinguishes a time-case form, vowel elision and the two-step iti ending', () => {
  const time=lookupChantAnalysis('กาเล'), pronoun=lookupChantAnalysis('เตปิ'), ending=lookupChantAnalysis('ปาณินนฺติ');
  assert.match(time.inflection,/สัตตมีวิภัตติ เอกวจนะ/);assert.match(time.sandhi,/ไม่ใช่การสนธิข้ามคำ/);
  assert.deepEqual(pronoun.parts.map(part=>part[0]),['เต','อปิ']);
  assert.match(pronoun.sandhi,/โลปสระหลัง/);assert.match(pronoun.context,/ร่วมอนุโมทนาหรือช่วยงานทาน/);
  assert.deepEqual(ending.parts.map(part=>part[0]),['ปาณินํ','อิติ']);
  assert.match(ending.steps[1],/ลบ อิ/);assert.match(ending.steps[2],/เปลี่ยน ํ เป็น นฺ/);
  assert.match(ending.inflection,/อิติ เป็นนิบาต/);assert.match(ending.sources[0].note,/§46/);
  for(const word of ['กาเล','เตปิ','ปาณินนฺติ']) assert.ok(lookupChantWord(word,{packId:KALE_PACK.id})?.meaning,word);
});
test('word detail shows a short formula before optional steps, with Thai and Roman parts and an honest unknown state', () => {
  const html=chantWordAnalysisMarkup('มญฺญามหํ');
  assert.match(html,/มญฺญามิ \+ อหํ/);assert.match(html,/maññāmi/);assert.match(html,/ahaṃ/);
  assert.match(html,/<details><summary>ดูชนิดและขั้นแปลงรูปทีละขั้น<\/summary>/);
  assert.match(html,/<dt>สมาส<\/dt>/);assert.match(html,/<dt>สนธิ<\/dt>/);assert.match(html,/<ol>/);
  assert.match(html,/https:\/\/thunder\.purivaro\.com\/grammar-study\/sandhi/);
  const unknown=chantWordAnalysisMarkup('<img src=x onerror=alert(1)>');
  assert.match(unknown,/ยังไม่มีบทวิเคราะห์ที่ตรวจแล้ว/);assert.ok(!unknown.includes('<img'));
  assert.ok(!unknown.includes('<ol>'));
  const override={meaning:'คำแปลของฉัน',grammar:'บริบทของวรรคนี้'};
  assert.equal(lookupChantWord('มญฺญามหํ',{overrides:{'มญฺญามหํ':override}}).meaning,override.meaning);
  assert.match(chantWordAnalysisMarkup('มญฺญามหํ'),/บทวิเคราะห์พื้นฐานเพื่อเรียน/);
});
test('library backup round-trips a long private chant, word overrides and progress without changing old v1 backups', () => {
  const id='custom-example123', text='นโม ตสฺส', lineKey=`${id}-0:${text}`;
  const raw={version:1,...KATHINA_RECIPIENT,library:[{id,title:'บทส่วนตัว',collection:'patimokkha'}],packs:{[id]:{lines:Array.from({length:300},()=>({text,meaning:'นอบน้อม',grammar:''})),source:'ฉบับวัด',complete:true}},
    glossary:{[id]:{[lineKey]:{นโม:{meaning:'คำแปลเฉพาะวรรค',grammar:'ข้อสังเกตส่วนตัว'}}}},stats:{[id]:{[lineKey]:{recall:recordRecall(null,true,1000)}}},lastPack:id,lastLine:200};
  assert.equal(parseChantLines(Array(300).fill(text).join('\n')).length,300);
  const restored=validateChantData(JSON.parse(JSON.stringify(raw)));
  assert.equal(restored.packs[id].lines.length,300);assert.equal(restored.library[0].collection,'patimokkha');
  assert.equal(restored.glossary[id][lineKey].นโม.meaning,'คำแปลเฉพาะวรรค');
  assert.equal(restored.stats[id][lineKey].recall.correct,1);assert.equal(restored.lastPack,id);assert.equal(restored.lastLine,200);
  assert.deepEqual(validateChantData({version:1,...KATHINA_RECIPIENT}).library,[]);
});
test('malformed or conflicting library IDs and oversized glossary data are rejected', () => {
  const item={id:'custom-example123',title:'บทสวด',collection:'general'};
  assert.throws(()=>validateChantLibrary([item,item]));
  assert.throws(()=>validateChantLibrary([{...item,id:'third-monk'}]));
  assert.throws(()=>validateChantData({version:1,...KATHINA_RECIPIENT,library:[item]}));
  assert.throws(()=>validateWordGlosses({'line':{'นโม':{meaning:'x'.repeat(501),grammar:''}}}));
  assert.throws(()=>validateWordGlosses(JSON.parse('{"line":{"__proto__":{"meaning":"bad","grammar":""}}}')));
});
test('meaning games use only the selected chant and unique available meanings, with flashcards for a single meaning', () => {
  const lines=[{text:'นโม ตสฺส'}], quiz=makeChantWordQuiz(lines,word=>lookupChantWord(word),()=>0);
  assert.equal(quiz.word,'นโม');assert.equal(quiz.options[quiz.answer],lookupChantWord('นโม').meaning);
  assert.equal(new Set(quiz.options).size,quiz.options.length);
  assert.equal(quiz.options.length,2);
  assert.deepEqual(makeChantWordQuiz([{text:'นโม นโม'}],word=>lookupChantWord(word),()=>0).options,[]);
  assert.equal(makeChantWordQuiz([{text:'สมุตเตชโก'}],word=>lookupChantWord(word)),null);
});
