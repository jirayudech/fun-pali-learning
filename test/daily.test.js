import test from 'node:test';
import assert from 'node:assert/strict';
import { grammarLessons, gameQuestions } from '../grammar.js';
import { bangkokDay } from '../game-engine.js';
import { courseDay, makeDailyPlan, startDaily, replayDaily, reminderEvent } from '../daily-engine.js';
const day = '2026-10-16';
test('daily plan selects weak assessed knowledge before harder unseen lessons', () => {
  const reported = grammarLessons.map(l => l.id);
  const plan = makeDailyPlan({ day, reported, history: [
    { lesson_id: 'verbs', score: 4, total: 5, created_at: '2026-10-15T10:00:00Z' },
    { lesson_id: 'verb-person-drill', score: 1, total: 5, created_at: '2026-10-15T11:00:00Z' }
  ] });
  assert.equal(plan.lessonId, 'verb-person-drill');
  assert.equal(plan.questionIds.filter(id => gameQuestions.find(q => q.id === id).lessonId === plan.lessonId).length, 3);
  assert.equal(new Set(plan.questionIds).size, 5);
});
test('latest evidence takes precedence and completion reports do not invent a score', () => {
  const old = grammarLessons.slice(0, 21).map(l => l.id);
  assert.equal(makeDailyPlan({ day, reported: old }).lessonId, 'adjective-agreement');
  const plan = makeDailyPlan({ day, reported: old, history: [
    { lesson_id: 'verbs', score: 0, total: 5, created_at: '2026-10-14T10:00:00Z' },
    { lesson_id: 'verbs', score: 5, total: 5, created_at: '2026-10-15T10:00:00Z' }
  ] });
  assert.equal(plan.lessonId, 'adjective-agreement');
});
test('same day gives a stable plan and Bangkok midnight reveals the next reading', () => {
  const before = bangkokDay('2026-10-16T16:59:59Z'), after = bangkokDay('2026-10-16T17:00:00Z');
  assert.equal(courseDay(day, before), 1); assert.equal(courseDay(day, after), 2);
  const one = makeDailyPlan({ day: before, startDay: day });
  assert.deepEqual(one, makeDailyPlan({ day: before, startDay: day }));
  const two = makeDailyPlan({ day: after, startDay: day });
  assert.notEqual(one.note.title, two.note.title);
  assert.notDeepEqual(one.questionIds, two.questionIds);
  assert.ok(makeDailyPlan({ day: '2026-11-01', startDay: day }).note);
});
test('saved answers reconstruct feedback, retries and first-answer scores after reload', () => {
  let record = startDaily(makeDailyPlan({ day }));
  let { state } = replayDaily(record);
  const q = state.queue[0];
  const wrong = q.answer.map(n => (n + 1) % q.options.length);
  record.answers.push(wrong);
  let replay = replayDaily(JSON.parse(JSON.stringify(record)));
  assert.equal(replay.state.feedback.correct, false);
  assert.equal(replay.state.queue.length, 6);
  record.acknowledged = true;
  while (!replayDaily(record).done) {
    state = replayDaily(record).state;
    record.answers.push(state.queue[state.step].answer);
    record.acknowledged = false;
    const result = replayDaily(record);
    if (!result.done) record.acknowledged = true;
  }
  replay = replayDaily(JSON.parse(JSON.stringify(record)));
  assert.equal(replay.score, 4); assert.equal(replay.total, 5); assert.equal(replay.state.xp, 0);
  assert.equal(replay.state.feedback.correct, true);
  record.acknowledged = true;
  assert.equal(replayDaily(record).state.step, 6);
});
test('repeated incorrect answers stop after two retries and malformed saved answers fail', () => {
  const record = startDaily(makeDailyPlan({ day }));
  let result;
  do {
    const state = replayDaily(record).state, q = state.queue[state.step];
    record.answers.push(q.answer.map(n => (n + 1) % q.options.length));
    record.acknowledged = false;
    result = replayDaily(record);
    if (!result.done) record.acknowledged = true;
  } while (!result.done);
  assert.equal(record.answers.length, 15); assert.equal(result.score, 0);
  assert.throws(() => replayDaily({ ...record, questionIds: Array(5).fill('verbs-1') }));
  assert.throws(() => replayDaily({ ...record, answers: [[999]] }));
});
test('09:00 daily reminders start on the next occurrence in Bangkok, with a real calendar alarm', () => {
  const event = reminderEvent('09:00', new Date('2026-10-16T01:59:00Z'));
  assert.equal(event.start, '2026-10-16T02:00:00.000Z');
  assert.equal(reminderEvent('09:00', new Date('2026-10-16T02:01:00Z')).start, '2026-10-17T02:00:00.000Z');
  const params = new URL(event.googleUrl).searchParams;
  assert.equal(params.get('ctz'), 'Asia/Bangkok'); assert.equal(params.get('recur'), 'RRULE:FREQ=DAILY');
  assert.equal(params.get('dates'), '20261016T020000Z/20261016T021500Z');
  assert.match(event.ics, /RRULE:FREQ=DAILY\r\n/); assert.match(event.ics, /BEGIN:VALARM\r\nTRIGGER:PT0M/);
  assert.match(event.ics, /\?daily=1/);
  for (const line of event.ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.throws(() => reminderEvent('25:00'));
});
