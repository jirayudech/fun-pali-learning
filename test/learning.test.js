import test from 'node:test';
import assert from 'node:assert/strict';
import { lessons, publicLessons, recommend } from '../lessons.js';
test('new learners start with sounds', () => assert.equal(recommend([]).lessonId, 'sounds'));
test('a weak latest score takes priority over unseen lessons', () => {
  assert.equal(recommend([{ lesson_id: 'sounds', score: 1, total: 3 }]).lessonId, 'sounds');
});
test('a mastered lesson leads to the next unseen lesson', () => {
  assert.equal(recommend([{ lesson_id: 'sounds', score: 3, total: 3 }]).lessonId, 'words');
});
test('latest attempt controls recommendation instead of earlier results', () => {
  assert.equal(recommend([{ lesson_id: 'sounds', score: 3, total: 3 }, { lesson_id: 'sounds', score: 0, total: 3 }]).lessonId, 'words');
});
test('lowest latest score gets reviewed first', () => {
  assert.equal(recommend([{ lesson_id: 'sounds', score: 2, total: 3 }, { lesson_id: 'words', score: 0, total: 3 }]).lessonId, 'words');
});
test('all mastered lessons continue with least practiced lesson', () => {
  assert.equal(recommend([{ lesson_id: 'sounds', score: 3, total: 3 }, { lesson_id: 'sounds', score: 3, total: 3 }, { lesson_id: 'words', score: 3, total: 3 }, { lesson_id: 'sentences', score: 3, total: 3 }]).lessonId, 'words');
});
test('each lesson has valid questions, explanations and a stable identity', () => {
  assert.equal(new Set(lessons.map(l => l.id)).size, lessons.length);
  for (const l of lessons) {
    assert.equal(l.questions.length, 3);
    for (const q of l.questions) {
      assert.ok(q.answer >= 0 && q.answer < q.options.length);
      assert.ok(q.why.length > 0);
    }
  }
  assert.ok(publicLessons().every(l => !('questions' in l)));
});
