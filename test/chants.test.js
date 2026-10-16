import test from 'node:test';
import assert from 'node:assert/strict';
import { compareChant, chantRoman, orderCorrect, recordRecall, parseChantLines, daysToKathina } from '../chant-engine.js';
import { chantPacks, materializePack, KATHINA_RECIPIENT } from '../chant-content.js';
import { validateChantData } from '../chant-ui.js';

test('recall tolerates spacing and punctuation but catches missing Pali signs and changed letters', () => {
  const text='สงฺโฆ อิมํ กฐินทุสฺสํ เทติ';
  assert.equal(compareChant(text, 'สงฺโฆ\nอิมํ กฐินทุสฺสํ เทติ.').correct, true);
  for (const wrong of ['สงโฆ อิมํ กฐินทุสฺสํ เทติ','สงฺโฆ อิม กฐินทุสฺสํ เทติ','สงฺโฆ อิมํ กฐินทุสฺสํ ทเทยฺย',text+' ธารยามิ']) assert.equal(compareChant(text,wrong).correct,false);
  assert.equal(compareChant('อิมํ','อิม').firstDifference,3);
});
test('Pali romanization keeps clusters, preposed vowels and the recipient name', () => {
  for (const [text,roman] of [['สุณาตุ เม ภนฺเต สงฺโฆ','suṇātu me bhante saṅgho'],['กิตฺตินนฺโท','kittinando'],['กิตฺตินนฺทสฺส','kittinandassa'],['เอวเมตํ ธารยามิ','evametaṃ dhārayāmi'],['กฐินํ อตฺถริตุํ','kaṭhinaṃ attharituṃ']]) assert.equal(chantRoman(text),roman);
});
test('ordering permits interchangeable repeated tokens but requires every token exactly once', () => {
  const tokens=['วา','อุปชฺฌาโย','วา'];
  assert.equal(orderCorrect(tokens,[2,1,0]),true);
  for (const indices of [[0,1,0],[0,2,1],[0,1],[0,1,4]]) assert.equal(orderCorrect(tokens,indices),false);
});
test('wrong recall schedules immediate review; correct recall gradually spaces practice', () => {
  let stats; const now=100000;
  for(const hours of [1,12,24,48,48]) { stats=recordRecall(stats,true,now); assert.equal(stats.dueAt,now+hours*3600000); }
  stats=recordRecall(stats,false,now);
  assert.equal(stats.streak,0); assert.equal(stats.correct,5); assert.equal(stats.attempts,6); assert.equal(stats.dueAt,now);
});
test('ceremony date is 1 November 2026 and large or empty transcript input is rejected', () => {
  assert.equal(daysToKathina('2026-10-14'),18);
  assert.equal(daysToKathina('2026-11-01'),0);
  assert.deepEqual(parseChantLines(' สุณาตุ \n\n เม '),['สุณาตุ','เม']);
  for(const text of ['', 'x'.repeat(701), Array(1001).fill('วรรค').join('\n')]) assert.throws(()=>parseChantLines(text));
});
test('both photograph-based packs use the supplied recipient in the right case and keep response out of the third monk part', () => {
  const third=materializePack(chantPacks[0]); const motion=materializePack(chantPacks[1]);
  assert.equal(third.length,9); assert.equal(motion.length,16);
  assert.match(third[0].text,/กิตฺตินนฺโท/);
  assert.match(third[5].text,/อายสฺมโต กิตฺตินนฺทสฺส/);
  assert.equal(third.some(l=>l.text==='รุจฺจติ ภนฺเต'),false);
  assert.equal(motion.at(-1).text,'เอวเมตํ ธารยามิ');
  assert.ok([...third,...motion].every(l=>!/[{}]|สารธมฺม|ปวรสฺส/.test(l.text)));
});
test('backup rejects malformed or oversized lines, keeps real recall data and does not credit invalid results', () => {
  const raw={version:1,...KATHINA_RECIPIENT,packs:{'third-monk':{lines:materializePack(chantPacks[0]),checked:true,complete:true,source:'ภาพจากวัด'}},stats:{'third-monk':{example:{recall:recordRecall(null,true,100000),spoken:true},invalid:{recall:{attempts:1,correct:300}}}}};
  const data=validateChantData(raw);
  assert.equal(data.stats['third-monk'].example.recall.correct,1);
  assert.equal(data.stats['third-monk'].invalid.recall,undefined);
  assert.equal(data.packs['third-monk'].lines[0].text,materializePack(chantPacks[0])[0].text);
  assert.throws(()=>validateChantData({...raw,version:99}));
  assert.throws(()=>validateChantData({...raw,packs:{'third-monk':{lines:[{text:'x'.repeat(701),meaning:'',grammar:''}]}}}));
});
