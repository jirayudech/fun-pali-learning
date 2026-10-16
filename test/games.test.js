import test from 'node:test';
import assert from 'node:assert/strict';
import { gameQuestions, grammarLessons } from '../grammar.js';
import { createPractice, submitPractice, advancePractice, learningStreak, bangkokDay } from '../game-engine.js';
test('all four game types have valid answer shapes', () => {
  assert.equal(grammarLessons.length, 35);
  assert.equal(gameQuestions.length, 175);
  assert.equal(new Set(gameQuestions.map(q => q.id)).size, 175);
  assert.deepEqual(new Set(gameQuestions.map(q => q.kind)), new Set(['choose', 'gap', 'build', 'pair']));
  for (const q of gameQuestions) {
    assert.ok(q.answer.every(n => Number.isInteger(n) && n >= 0 && n < q.options.length));
    if (q.kind === 'pair') assert.equal(q.answer.length, q.left.length);
    if (q.kind === 'build') assert.equal(q.answer.length, q.options.length);
    if (q.kind === 'pair' || q.kind === 'build') assert.equal(new Set(q.answer).size, q.answer.length);
    assert.ok(q.why);
  }
});
test('wrong answers return after other questions and do not earn XP', () => {
  const q = gameQuestions[0];
  const state = createPractice([q, gameQuestions[1]]);
  const feedback = submitPractice(state, [2]);
  assert.equal(feedback.correct, false); assert.equal(state.xp, 0);
  assert.equal(state.queue.length, 3); assert.equal(state.queue[2].id, q.id);
  assert.throws(() => submitPractice(state, [0]));
  assert.equal(advancePractice(state), false);
});
test('retries are limited and first-answer score stays distinct from corrected answers', () => {
  const q = gameQuestions[0]; const state = createPractice([q]);
  for (let i = 0; i < 2; i++) { submitPractice(state, [2]); advancePractice(state); }
  assert.equal(state.queue.length, 3);
  submitPractice(state, q.answer);
  assert.equal(state.xp, 10); assert.equal(state.firstTryCorrect, 0);
  assert.equal(advancePractice(state), true);
});
test('correct answer can earn zero XP when daily credit already exists', () => {
  const q = gameQuestions[0]; const state = createPractice([q]);
  const f = submitPractice(state, q.answer, () => 0);
  assert.equal(f.correct, true); assert.equal(f.xp, 0); assert.equal(state.firstTryCorrect, 1);
});
test('ordered answers require all items in the right order', () => {
  const q = gameQuestions.find(q => q.kind === 'build');
  assert.equal(submitPractice(createPractice([q]), [...q.answer].reverse()).correct, false);
  assert.equal(submitPractice(createPractice([q]), q.answer).correct, true);
});
test('streak counts unique Bangkok dates and tolerates not studying yet today', () => {
  assert.equal(learningStreak(['2026-10-13','2026-10-12','2026-10-12','2026-10-11'], '2026-10-13'), 3);
  assert.equal(learningStreak(['2026-10-12','2026-10-11'], '2026-10-13'), 2);
  assert.equal(learningStreak(['2026-10-11'], '2026-10-13'), 0);
  assert.equal(bangkokDay('2026-10-12T18:00:00Z'), '2026-10-13');
});
