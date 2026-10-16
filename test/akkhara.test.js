import test from 'node:test';
import assert from 'node:assert/strict';
import { akkharaLessons } from '../akkhara-lessons.js';
import { akkharaProgress } from '../akkhara-ui.js';

test('a separate course advances only its own progress and reports do not invent scores', () => {
  assert.equal(akkharaProgress([]).next.id, 'akkhara-vowels');
  const result = akkharaProgress([
    { id: 'akkhara-vowels', learned: true, reported: true, attempts: 0, latestScore: null },
    { id: 'sounds', learned: true, attempts: 1, latestScore: .1 }
  ]);
  assert.equal(result.learned, 1);
  assert.equal(result.next.id, 'akkhara-weight');
  assert.equal(result.progress[0].stat.latestScore, null);
});
test('weak assessed knowledge is reviewed before unseen topics without affecting other courses', () => {
  const result = akkharaProgress([
    { id: 'akkhara-vowels', learned: true, attempts: 2, latestScore: 1 },
    { id: 'akkhara-rows', learned: true, attempts: 1, latestScore: .6 },
    { id: 'akkhara-bases', learned: true, attempts: 1, latestScore: .2 },
    { id: 'verbs', learned: true, attempts: 1, latestScore: 0 }
  ]);
  assert.equal(result.next.id, 'akkhara-bases');
  assert.equal(result.learned, 3);
});
test('finishing the whole track keeps a review available instead of returning an unknown lesson', () => {
  const stats = akkharaLessons.map((l, i) => ({ id: l.id, learned: true, attempts: 1, latestScore: i === 5 ? .8 : 1 }));
  const result = akkharaProgress(stats);
  assert.equal(result.learned, 8);
  assert.equal(result.next.id, 'akkhara-bases');
});
