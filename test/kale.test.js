import test from 'node:test';
import assert from 'node:assert/strict';
import { KALE_PACK } from '../kale-content.js';
import { chantPacks, materializePack, KATHINA_RECIPIENT } from '../chant-content.js';
import { chantRoman, compareChant, recordRecall } from '../chant-engine.js';
import { chantShareUrl, requestedChant } from '../chant-public.js';
import { validateChantData } from '../chant-ui.js';

test('a shared chant link contains only a known public pack and retains the GitHub Pages path', () => {
  const url = new URL(chantShareUrl(KALE_PACK.id, 'https://jirayudech.github.io/fun-pali-learning/?code=private&daily=1#access_token=private'));
  assert.equal(url.pathname, '/fun-pali-learning/');
  assert.deepEqual([...url.searchParams], [['chants','1'],['pack','kale-anumodana']]);
  assert.equal(url.hash, '');
  assert.equal(requestedChant(url.search), KALE_PACK.id);
  assert.equal(requestedChant('?pack=custom-private123'), null);
  assert.equal(requestedChant('?pack=not-a-pack', 'third-monk'), 'third-monk');
  assert.throws(() => chantShareUrl('custom-private123', url));
});

test('the Thai Pali iṃ allograph reads and compares correctly without accepting a missing nikkhahit', () => {
  assert.equal(chantRoman('ปรโลกสฺมึ'), 'paralokasmiṃ');
  assert.equal(chantRoman('ตสฺมึ'), 'tasmiṃ');
  assert.equal(compareChant('ปรโลกสฺมึ', 'ปรโลกสฺมิํ').correct, true);
  for (const wrong of ['ปรโลกสฺมิ', 'ปรโลกสฺมี', 'ปรโลกสมึ']) assert.equal(compareChant('ปรโลกสฺมึ', wrong).correct, false);
});

test('reporting memorization survives backup without creating recall scores or marking another chant complete', () => {
  const lines = materializePack(KALE_PACK), text = lines.map(l => l.text).join('\n');
  const raw = {version:1, ...KATHINA_RECIPIENT, reported:{[KALE_PACK.id]:{at:1000,text}}, stats:{'third-monk':{real:{recall:recordRecall(null,true,100)}}}};
  const restored = validateChantData(JSON.parse(JSON.stringify(raw)));
  assert.equal(restored.reported[KALE_PACK.id].at, 1000);
  assert.equal(restored.reported['third-monk'], undefined);
  assert.deepEqual(restored.stats[KALE_PACK.id], {});
  assert.equal(restored.stats['third-monk'].real.recall.correct, 1);
  assert.deepEqual(validateChantData({version:1,...KATHINA_RECIPIENT}).reported, {});
  const changed = {...raw, packs:{[KALE_PACK.id]:{lines:[{id:'unused',text:'กาเล',meaning:'ตามกาล',grammar:''}],complete:false}}};
  assert.equal(validateChantData(changed).reported[KALE_PACK.id], undefined);
  assert.equal(chantPacks.filter(p=>p.hasRecipient).length, 2);
});
