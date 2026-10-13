export function checkAnswer(question, answer) {
  return Array.isArray(answer) && answer.length === question.answer.length && answer.every((value, i) => value === question.answer[i]);
}
export function createPractice(questions) {
  return { queue: [...questions], step: 0, initialCount: questions.length, correct: 0, firstTryCorrect: 0, combo: 0, bestCombo: 0, xp: 0, feedback: null, tries: {} };
}
export function submitPractice(state, answer, award = () => 10) {
  const q = state.queue[state.step];
  if (!q || state.feedback) throw new Error('ไม่มีข้อที่พร้อมตรวจ');
  const correct = checkAnswer(q, answer);
  const tries = state.tries[q.id] || 0;
  state.tries[q.id] = tries + 1;
  if (correct) {
    state.correct++;
    if (!tries) state.firstTryCorrect++;
    state.combo++;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
  } else {
    state.combo = 0;
    if (tries < 2) state.queue.push(q);
  }
  const xp = correct ? award(q) : 0;
  state.xp += xp;
  state.feedback = { correct, answer: q.answer, why: q.why, xp, retried: !correct && tries < 2 };
  return state.feedback;
}
export function advancePractice(state) {
  if (!state.feedback) throw new Error('ตรวจคำตอบก่อน');
  state.feedback = null;
  state.step++;
  return state.step >= state.queue.length;
}
export function bangkokDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function learningStreak(days, today = bangkokDay()) {
  const set = new Set(days);
  let d = new Date(`${today}T12:00:00Z`);
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let count = 0;
  while (set.has(d.toISOString().slice(0, 10))) { count++; d.setUTCDate(d.getUTCDate() - 1); }
  return count;
}
