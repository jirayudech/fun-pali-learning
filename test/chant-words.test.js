import test from 'node:test';
import assert from 'node:assert/strict';
import { chantPacks, materializePack, KATHINA_RECIPIENT } from '../chant-content.js';
import { chantTokens, parseChantLines, recordRecall } from '../chant-engine.js';
import { chantWordKey, lookupChantWord, validateWordGlosses, makeChantWordQuiz } from '../chant-lexicon.js';
import { validateChantData } from '../chant-ui.js';
import { chantWordMarkup } from '../chant-word-ui.js';
import { validateChantLibrary } from '../chant-library.js';

test('every word in both current chants has a learning gloss, including the five-word passage', () => {
  for (const pack of chantPacks) for (const line of materializePack(pack)) for (const word of chantTokens(line.text)) {
    const entry=lookupChantWord(word,{...KATHINA_RECIPIENT,kathina:true});
    assert.ok(entry?.meaning,word); assert.ok(entry.grammar,word);
  }
  assert.match(lookupChantWord('สพฺรหฺมจารีนํ').grammar,/ฉัฏฐีพหุวจนะ/);
  assert.notEqual(lookupChantWord('สนฺทสฺสโก').meaning,lookupChantWord('สมาทปโก').meaning);
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
