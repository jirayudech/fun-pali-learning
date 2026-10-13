import test from 'node:test';
import assert from 'node:assert/strict';
import { paliText, paliMarkup, paliSpellings } from '../pali-script.js';
import { gameQuestions } from '../grammar.js';
test('the existing Roman-only sentence has Thai Pali spellings', () => {
  assert.equal(paliText('Buddho dhammaṃ deseti'), 'พุทฺโธ (Buddho) ธมฺมํ (dhammaṃ) เทเสติ (deseti)');
});
test('all Roman words in game options have a reviewed Thai counterpart', () => {
  for (const q of gameQuestions) for (const option of q.options) {
    if (/^[a-zāīūṅñṭḍṇḷṃ]+$/i.test(option)) assert.ok(paliSpellings[option.toLowerCase()], option);
  }
});
test('Thai uses phinthu and nikkhahit, rather than a pronunciation respelling', () => {
  assert.equal(paliSpellings.gacchati, 'คจฺฉติ');
  assert.equal(paliSpellings['ahaṃ'], 'อหํ');
  assert.equal(paliSpellings['tvaṃ'], 'ตฺวํ');
});
test('markup escapes untrusted text while keeping Thai primary and Roman secondary', () => {
  const out = paliMarkup('<script>Buddho</script>');
  assert.ok(!out.includes('<script>'));
  assert.match(out, /pi-Thai.*พุทฺโธ/);
  assert.match(out, /pi-Latn.*Buddho/);
});
test('existing annotations and a-stem terminology are not duplicated', () => {
  assert.equal(paliText('พุทฺโธ (buddho) และ a-stem'), 'พุทฺโธ (buddho) และ a-stem');
});
