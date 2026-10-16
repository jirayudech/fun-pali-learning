import { config } from './config.js?v=20261016-chants2';
import { lessons, recommend } from './lessons.js?v=20261016-chants2';
import { paliMarkup, paliText } from './pali-script.js?v=20261016-chants2';
import { selectPair } from './pairing.js?v=20261016-chants2';
import { art, lessonArt } from './art.js?v=20261016-chants2';
import { grammarLessons } from './grammar.js?v=20261016-chants2';
import { createPractice, submitPractice, advancePractice, bangkokDay } from './game-engine.js?v=20261016-chants2';
import { gameLobby, gameQuestion, gameResult, leaderboardView } from './game-ui.js?v=20261016-chants2';
import { OAUTH_KEY, startGoogleOAuth, consumeGoogleVerifier, oauthErrorMessage } from './oauth.js?v=20261016-chants2';
import { createChantController } from './chant-ui.js?v=20261016-chants2';
import { daysToKathina } from './chant-engine.js?v=20261016-chants2';
import { createExamController } from './exam-ui.js?v=20261016-chants2';
import { createDailyController } from './daily-ui.js?v=20261016-chants2';
import { akkharaHub, akkharaTeaser, akkharaLessonExtras } from './akkhara-ui.js?v=20261016-chants2';

const app = document.querySelector('#app');
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl) && Boolean(config.supabasePublishableKey);
const SESSION_KEY = 'pali-auth-v1';
const DEMO_KEY = 'pali-demo-history-v1';
let session = null, demo = false, dashboard = null, view = 'home', authTab = 'login', quiz = null;
let refreshPromise = null;
let game = null, gameProgress = null, board = null, gameBusy = false;
const DEMO_GAME_KEY = 'pali-demo-games-v1';
const BASELINE_LESSONS = ['sounds','words','sentences','noun-roles','cases','number','verbs','pronouns','grammar-review'];
const chants = createChantController({ storageKey: () => `pali-chants-v1:${demo ? 'demo' : dashboard?.user?.id || session?.user?.id || 'this-device'}`, show: shell, notify: toast });
const exams = createExamController({ storageKey: () => `pali-exams-v1:${demo ? 'demo' : dashboard?.user?.id || session?.user?.id || 'this-device'}`, show: shell, notify: toast });
const daily = createDailyController({ storageKey: () => `pali-daily-v1:${demo ? 'demo' : dashboard?.user?.id || session?.user?.id || 'this-device'}`,
  context: () => ({ history: learningHistory(), reported: dashboard.reportedLessons || [], lessonTitle: id => lessonById(id).title, lessonCount: lessons.length }), show: shell, notify: toast });
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lessonById = id => lessons.find(l => l.id === id);
function entryView() {
  const params = new URLSearchParams(location.search);
  if (params.get('daily') === '1' || sessionStorage.getItem('pali-open-daily') === '1') return 'daily';
  if (params.get('course') === 'akkhara' || sessionStorage.getItem('pali-open-akkhara') === '1') return 'akkhara';
  if (params.get('chants') === '1' || sessionStorage.getItem('pali-open-chants') === '1') return 'chants';
  return 'home';
}
const date = value => new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 4500); }
function saveSession(next) { session = next; if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next)); else localStorage.removeItem(SESSION_KEY); }
async function request(path, { method = 'GET', data, authenticated = true } = {}) {
  if (!configured) throw new Error('ยังไม่ได้เชื่อม Supabase กรุณาใช้โหมดทดลองก่อน');
  if (authenticated && session?.expires_at < Date.now() / 1000 + 60) {
    refreshPromise ||= request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', data: { refresh_token: session.refresh_token }, authenticated: false })
      .then(next => saveSession({ ...next, expires_at: Date.now() / 1000 + next.expires_in })).finally(() => { refreshPromise = null; });
    try { await refreshPromise; } catch { saveSession(null); renderAuth(); throw new Error('การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่'); }
  }
  const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + path, {
    method, headers: { apikey: config.supabasePublishableKey, ...(session && authenticated ? { Authorization: `Bearer ${session.access_token}` } : {}), 'Content-Type': 'application/json' },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && authenticated) { saveSession(null); renderAuth(); }
    const message = result?.msg || result?.message || result?.error_description || result?.error || '';
    if (/Invalid login credentials/i.test(message)) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    if (/Email not confirmed/i.test(message)) throw new Error('กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
    if (/rate limit/i.test(message)) throw new Error('ส่งคำขอบ่อยเกินไป กรุณารอสักครู่');
    throw new Error(message || 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่');
  }
  return result;
}
function button(label, action, extra = '') { return `<button class="button ${extra}" data-action="${action}">${label}</button>`; }
function brand() { return '<a class="brand" href="./"><span class="brand-icon">ป</span><span>บาลีทีละนิด<small>PĀLI LEARNING</small></span></a>'; }
function renderAuth(message = '') {
  app.innerHTML = `<main class="auth-layout"><section class="auth-intro">${brand()}<div class="auth-mark"><img src="${art.guide}" alt="น้องช้างใบลานชวนเรียนบาลี" width="180" height="180"></div><div class="eyebrow">A LITTLE EVERY DAY</div><h1>เปิดประตูสู่ภาษาบาลี<br>ทีละคำ ทีละวัน</h1><p>เริ่มจากเสียงที่คุ้นเคย ไปสู่ความหมายที่ลึกขึ้น<br>มีพื้นที่เรียนรู้ และเส้นทางที่เป็นของคุณเอง</p><span class="badge">${lessons.length} บทเรียน · เรียนฟรี</span></section><section class="panel"><div class="tabs"><button data-action="login-tab" class="${authTab === 'login' ? 'active' : ''}">เข้าสู่ระบบ</button><button data-action="register-tab" class="${authTab === 'register' ? 'active' : ''}">สร้างบัญชี</button></div>${!configured ? '<div class="banner">เว็บไซต์ยังไม่ได้เชื่อมฐานข้อมูล บัญชีและประวัติออนไลน์ยังใช้ไม่ได้ ลองบทเรียนตัวอย่างได้ด้านล่าง</div>' : ''}<div class="social-auth"><button class="button google full" data-action="google-login" ${!configured ? 'disabled' : ''}><span class="google-mark" aria-hidden="true">G</span>เข้าสู่ระบบด้วย Google</button><div class="auth-divider"><span>หรือใช้อีเมล</span></div></div><form id="auth-form">${authTab === 'register' ? '<label for="name">อยากให้เราเรียกคุณว่าอะไร?</label><input id="name" name="name" maxlength="60" required autocomplete="nickname" placeholder="ชื่อเล่นของคุณ">' : ''}<label for="email">อีเมล</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"><label for="password">รหัสผ่าน ${authTab === 'register' ? '(อย่างน้อย 10 ตัว)' : ''}</label><input id="password" name="password" type="password" minlength="${authTab === 'register' ? '10' : '1'}" maxlength="128" required autocomplete="${authTab === 'register' ? 'new-password' : 'current-password'}"><p class="error" id="auth-error" role="alert">${esc(message)}</p><button class="button full" type="submit" ${!configured ? 'disabled' : ''}>${authTab === 'login' ? 'เข้าสู่พื้นที่เรียนรู้ →' : 'สร้างบัญชีของฉัน →'}</button></form><p class="auth-footer">บัญชีและประวัติเก็บที่ Supabase แยกตามผู้เรียน ผู้ดูแลโครงการสามารถเข้าถึงฐานข้อมูลได้ รหัสผ่านจัดการโดย Supabase Auth<br>ไม่มีการเชื่อมบัญชี ChatGPT หรือส่งประวัติไปยัง ChatGPT โดยอัตโนมัติ</p>${button('ลองเรียนโดยไม่สร้างบัญชี', 'demo', 'secondary full')}<p class="auth-footer">โหมดทดลองเก็บประวัติเฉพาะเบราว์เซอร์นี้ ไม่ซิงก์ข้ามเครื่อง</p></section></main>`;
}
function shell(content) {
  const name = dashboard.user.name;
  const active = view === 'game' || view === 'game-result' ? 'games' : view.startsWith('lesson:') || view === 'quiz' || view === 'result' ? 'lessons' : view;
  app.innerHTML = `<div class="shell"><aside class="sidebar">${brand()}<nav class="nav" aria-label="เมนูหลัก">${[['home', '⌂', 'พื้นที่เรียนรู้'], ['daily', '☀', 'ภารกิจประจำวัน'], ['chants', '♫', 'ฝึกท่องบทสวด'], ['lessons', '▤', 'บทเรียนทั้งหมด'], ['akkhara', 'อ', 'อักขรวิธี'], ['exams', '✎', 'ซ้อมสอบประโยค 1–2'], ['games', '⚡', 'เกมไวยากรณ์'], ['leaderboard', '♜', 'อันดับประจำสัปดาห์'], ['history', '◷', 'ประวัติการเรียน'], ['tutor', '✦', 'ติวเตอร์ส่วนตัว']].map(([id, icon, label]) => `<button data-action="nav:${id}" class="${active === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`).join('')}</nav><div class="side-note">“เรียนรู้ทีละน้อย<br>แต่เรียนรู้อย่างสม่ำเสมอ”<p>พื้นที่เล็ก ๆ สำหรับการเติบโต<br>ในทุกวันของคุณ</p></div></aside><main class="main"><header class="topbar"><span>เส้นทางการเรียนรู้ของคุณ</span><div class="account"><span class="avatar">${esc(Array.from(name)[0] || 'ป')}</span><span>${esc(name)}</span>${button(demo ? 'ออกจากโหมดทดลอง' : 'ออกจากระบบ', 'logout', 'secondary small')}</div></header>${demo ? '<div class="banner">โหมดทดลอง • ประวัติอยู่ในเบราว์เซอร์นี้เท่านั้น ยังไม่ใช่บัญชีออนไลน์</div>' : ''}${content}<footer class="footer">บาลีทีละนิด · เรียนด้วยความเข้าใจ เติบโตตามจังหวะของคุณ</footer></main></div>`;
  const nav = app.querySelector('.nav'), activeNav = nav?.querySelector('.active');
  if (nav && activeNav && nav.scrollWidth > nav.clientWidth) {
    const current = activeNav.getBoundingClientRect(), bounds = nav.getBoundingClientRect();
    nav.scrollLeft += current.left - bounds.left - (nav.clientWidth - current.width) / 2;
  }

}
function cards() {
  return `<div class="cards">${lessons.map((l, i) => {
    const stat = dashboard.recommendation.stats.find(s => s.id === l.id);
    return `<article class="lesson-card"><img class="lesson-scene" src="${lessonArt(l.id)}" alt="" loading="lazy" width="400" height="240"><div class="eyebrow">บทที่ ${String(i + 1).padStart(2, '0')}</div><h3>${l.title}</h3><p>${l.intro}</p><div class="card-meta"><span>${l.level} · ${l.minutes} นาที</span><span>${stat.attempts ? `ล่าสุด ${Math.round(stat.latestScore * 100)}%` : stat.reported ? 'เรียนแล้ว · ยังไม่มีคะแนน' : 'ยังไม่ได้ฝึก'}</span></div><progress class="progress" max="100" value="${Math.round((stat.latestScore || 0) * 100)}" aria-label="คะแนนล่าสุดของบทเรียน"></progress><div class="actions">${button(stat.learned ? 'ทบทวนบทเรียน →' : 'เริ่มเรียน →', `lesson:${l.id}`, 'secondary full')}</div></article>`;
  }).join('')}</div>`;
}
function home() {
  const { recommendation, user } = dashboard;
  const history = learningHistory();
  const recommended = lessonById(recommendation.lessonId);
  const mastered = recommendation.stats.filter(s => s.learned).length;
  const average = history.length ? Math.round(history.reduce((n, h) => n + h.score / h.total, 0) / history.length * 100) : 0;
  shell(`<div class="heading"><div><div class="eyebrow">YOUR LEARNING SPACE</div><h1>สวัสดี ${esc(user.name)} <span aria-hidden="true">☀</span></h1><p class="muted">ฝึกบาลีอักษรไทย เพื่อก้าวสู่สนามหลวงทีละขั้น</p></div><span class="badge">ประโยค 1–2 · 3–4 มี.ค. 2570</span></div><section class="bottom-note chant-home"><img src="./assets/kathina.svg" alt="" width="140" height="90"><div><span class="badge">เร่งด่วน · ๑ พ.ย. ๒๕๖๙</span><h2>ซ้อมสวดกฐิน · อีก ${daysToKathina()} วัน</h2><p>บทองค์ที่ ๓ และญัตติทุติยกรรมวาจา · เข้าใจความหมาย จำทีละวรรค</p></div>${button('ไปซ้อมบทสวด →', 'nav:chants')}</section>${daily.teaser()}${akkharaTeaser()}<section class="hero"><div><div class="eyebrow">บทเรียนที่แนะนำสำหรับคุณ</div><h2>${recommended.title}</h2><p>${recommendation.reason}</p><p><span class="badge">${recommended.minutes} นาที · ${recommended.level}</span></p>${button('เริ่มเรียนต่อ →', `lesson:${recommended.id}`, 'light')}</div><div class="hero-art"><img src="${art.guide}" alt="น้องช้างใบลานถือหนังสือ" width="180" height="180"></div></section><div class="stats"><div class="stat"><span class="muted">บทเรียนที่เรียนแล้ว</span><div class="value">${mastered}<small>/ ${lessons.length} บท</small></div><span class="muted">จากผลฝึกและการแจ้งว่าเรียนแล้ว</span></div><div class="stat"><span class="muted">ฝึกฝนแล้ว</span><div class="value">${history.length}<small>ครั้ง</small></div><span class="muted">ทุกครั้งคืออีกหนึ่งก้าว</span></div><div class="stat"><span class="muted">คะแนนเฉลี่ย</span><div class="value">${average}<small>%</small></div><span class="muted">${history.length ? 'จากแบบฝึกหัดของคุณ' : 'เริ่มฝึกเพื่อดูความก้าวหน้า'}</span></div></div><section class="bottom-note"><img src="./assets/exam.svg" alt="" width="130" height="90"><div><h3>ซ้อมสอบประโยค 1–2</h3><p>วัดพื้นฐาน เขียนตอบ ฝึกแปล และข้อสอบจริงคัดข้อความย้อนหลังสิบปี</p></div>${button('เข้าห้องซ้อมสอบ →', 'nav:exams')}</section><section class="bottom-note"><div class="symbol">⚡</div><div><h3>ฝึกไวยากรณ์ผ่านเกม</h3><p>เรียงคำ จับคู่ เติมรูปศัพท์ · มี XP และอันดับประจำสัปดาห์</p></div>${button('ไปสนามฝึก →', 'nav:games')}</section><div class="section-head"><h2>ค่อย ๆ เรียนรู้ ทีละบท</h2><span class="muted">พื้นฐานที่มั่นคง เริ่มจากตรงนี้</span></div>${cards()}<section class="bottom-note"><div class="symbol" aria-hidden="true">✦</div><div><h3>มีคำถามระหว่างเรียนไหม?</h3><p>เตรียมบริบทการเรียน แล้วนำไปคุยกับ ChatGPT ของคุณ</p></div>${button('พบติวเตอร์ของคุณ →', 'nav:tutor', 'secondary')}</section>`);
}
function render() {
  if (!dashboard) return renderAuth();
  if (view === 'daily') { sessionStorage.removeItem('pali-open-daily'); return daily.render(); }
  if (view === 'akkhara') { sessionStorage.removeItem('pali-open-akkhara'); return shell(akkharaHub(dashboard.recommendation.stats)); }
  if (view === 'chants') { sessionStorage.removeItem('pali-open-chants'); return chants.render(); }
  if (view === 'exams') return exams.render();
  if (view === 'home') return home();
  if (view === 'games') return shell(gameLobby(gameProgress, learningHistory(), demo, dashboard.reportedLessons || []));
  if (view === 'game') return shell(gameQuestion(game));
  if (view === 'game-result') return shell(gameResult(game));
  if (view === 'leaderboard') return shell(leaderboardView(board, gameProgress, demo));
  if (view === 'lessons') return shell(`<div class="heading"><div><div class="eyebrow">THE FIRST STEPS</div><h1>บทเรียนทั้งหมด</h1><p class="muted">อ่าน ทำแบบฝึกหัด แล้วทบทวนในจังหวะของคุณ</p></div></div>${akkharaTeaser()}${cards()}`);
  if (view.startsWith('lesson:')) {
    const l = lessonById(view.split(':')[1]);
    shell(`<div class="heading"><div><div class="eyebrow">${l.level} · ${l.minutes} นาที</div><h1>${l.title}</h1><p class="muted">${l.intro}</p></div></div><section class="lesson-intro-art"><img src="${lessonArt(l.id)}" alt="" width="400" height="240"><div><span class="eyebrow">เรียนรู้ทีละนิด</span><h2>อ่านให้เข้าใจ แล้วลองใช้จริง</h2><p>ค่อย ๆ สังเกตรูปคำและความหมาย<br>พร้อมแล้วไปฝึกท้ายบทกัน</p></div></section><article class="panel">${l.blocks.map(([title, text]) => `<section class="content-block"><h3>${title}</h3><p>${paliMarkup(text)}</p></section>`).join('')}${akkharaLessonExtras(l)}</article><div class="actions">${button(grammarLessons.some(g => g.id === l.id) ? (!demo && gameProgress?.unavailable ? 'เล่นฝึกในเครื่อง →' : 'เล่นเกมฝึกบทนี้ →') : 'ลองทำแบบฝึกหัด →', `${grammarLessons.some(g => g.id === l.id) ? 'game-start' : 'quiz'}:${l.id}`)}${button('ฉันเรียนบทนี้แล้ว', `learned:${l.id}`, 'secondary')}${button(l.track === 'akkhara' ? 'กลับเส้นทางอักขรวิธี' : 'กลับไปบทเรียนทั้งหมด', l.track === 'akkhara' ? 'nav:akkhara' : 'nav:lessons', 'secondary')}</div>`);
    return;
  }
  if (view === 'quiz') {
    shell(`<div class="heading"><div><div class="eyebrow">PRACTICE MAKES PROGRESS</div><h1>ลองทดสอบความเข้าใจ</h1><p class="muted">${lessonById(quiz.lessonId).title} · ${quiz.questions.length} ข้อ</p></div></div><form id="quiz-form" class="panel">${quiz.questions.map((q, i) => `<fieldset class="question"><legend>${i + 1}. ${paliMarkup(q.text)}</legend><div class="options">${q.options.map((option, n) => `<label class="option"><input type="radio" name="q${i}" value="${n}" required><span>${paliMarkup(option)}</span></label>`).join('')}</div></fieldset>`).join('')}<p class="error" id="quiz-error" role="alert"></p><button class="button" type="submit">ตรวจคำตอบและบันทึกผล →</button></form>`);
    return;
  }
  if (view === 'result') {
    shell(`<div class="heading"><div><div class="eyebrow">ANOTHER STEP FORWARD</div><h1>${quiz.result.score === quiz.result.total ? 'ทำได้ดีมาก!' : 'เรียนรู้อีกนิด จำได้อีกหน่อย'}</h1><p class="muted">บันทึกผลแล้ว${demo ? 'ในเบราว์เซอร์นี้' : 'ในบัญชีของคุณ'} · ${quiz.result.score} / ${quiz.result.total} คะแนน</p></div></div><section class="panel">${quiz.result.feedback.map(f => `<div class="feedback ${f.correct ? '' : 'wrong'}"><h3>${f.correct ? '✓' : '↻'} ${paliMarkup(f.text)}</h3><p>คำตอบ: ${paliMarkup(f.answer)}</p><p>${paliMarkup(f.why)}</p></div>`).join('')}</section><div class="actions">${button('ดูบทเรียนที่แนะนำต่อ →', 'nav:home')}${button('ทบทวนบทนี้', `lesson:${quiz.lessonId}`, 'secondary')}${button('ถามติวเตอร์เพิ่มเติม', 'nav:tutor', 'secondary')}</div>`);
    return;
  }
  if (view === 'history') {
    shell(`<div class="heading"><div><div class="eyebrow">YOUR JOURNEY</div><h1>ประวัติการเรียน</h1><p class="muted">ทุกครั้งที่ฝึก ช่วยให้เราเลือกบททบทวนที่เหมาะกับคุณ</p></div></div><section class="panel">${learningHistory().length ? `<ul class="history-list">${learningHistory().map(h => `<li><div><h3>${lessonById(h.lesson_id)?.title || esc(h.lesson_id)}</h3><span class="muted">${esc(date(h.created_at))}${h.local ? ' · เก็บในเครื่อง' : ''}</span></div><span class="score">${h.score} / ${h.total}</span></li>`).join('')}</ul>` : '<div class="empty"><img class="empty-art" src="./assets/thinking.svg" alt="" width="220" height="132"><p>ยังไม่มีประวัติ เริ่มทำแบบฝึกหัดแรกได้เลย</p></div>'}</section><div class="actions">${button('ดาวน์โหลดประวัติของฉัน', 'export', 'secondary')}</div>`);
    return;
  }
  if (view === 'tutor') {
    shell(`<div class="heading"><div><div class="eyebrow">LEARN WITH YOUR CHATGPT</div><h1>ติวเตอร์ส่วนตัวของคุณ</h1><p class="muted">ใช้บัญชี ChatGPT ของคุณเอง โดยไม่ต้องเชื่อมรหัสผ่านกับเว็บนี้</p></div></div><div class="tutor-info"><section class="panel"><h2>นำบทเรียนไปคุยต่อ</h2><ol><li>คัดลอกข้อความบริบทด้านล่าง</li><li>เปิด ChatGPT แล้วเข้าสู่บัญชีของคุณ</li><li>วางข้อความในแชตใหม่ แล้วเริ่มเรียนได้เลย</li></ol><p class="muted">เว็บไม่สามารถใช้โควตา Plus ผ่าน API ได้ การสนทนาจะเกิดใน ChatGPT และอยู่ภายใต้โควตาของบัญชีนั้น ผลสนทนาไม่ซิงก์กลับมายังเว็บ</p><div class="actions">${button('คัดลอกบริบท', 'copy')}<a class="button secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">เปิด ChatGPT ↗</a></div></section><section class="panel"><h2>ปรับตามความก้าวหน้าของคุณ</h2><p class="muted">ระบบเลือกบทที่ควรทบทวนจากคะแนนล่าสุด หากไม่มีจุดที่ต้องทบทวน จะเลือกบทที่ยังไม่ได้เรียน การแนะนำนี้ใช้กติกาจากคะแนน ไม่ได้เรียก AI</p><h3>แนะนำ: ${lessonById(dashboard.recommendation.lessonId).title}</h3><p class="muted">ข้อความที่คัดลอกมีเฉพาะบทเรียนและคะแนน ไม่ใส่อีเมลหรือรหัสผ่าน คุณตรวจแก้ก่อนนำไปส่งได้</p></section></div><section class="panel"><h3>บริบทที่คุณจะนำไปวางใน ChatGPT</h3><pre class="prompt" id="tutor-prompt">${esc(paliText(tutorPrompt()))}</pre></section>`);
  }
}
function tutorPrompt() {
  const recommended = lessonById(dashboard.recommendation.lessonId);
  return `ช่วยเป็นติวเตอร์ภาษาบาลีสำหรับผู้เริ่มต้น สอนเป็นภาษาไทยอย่างใจเย็น\nเป้าหมายหลัก: เตรียมสอบบาลีสนามหลวง วันที่ 3–4 มีนาคม 2570 ตามเป้าหมายที่ฉันกำหนด ระดับประโยค 1–2 เน้นไวยากรณ์พื้นฐาน การแยกรูปศัพท์ การสัมพันธ์หน้าที่คำ และการแปลบาลีเป็นไทย ประเมินพื้นฐานจากคำตอบก่อนเพิ่มความยาก อย่าอ้างว่าโจทย์แต่งเป็นข้อสอบจริง\nใช้บาลีอักษรไทยเป็นหลัก และกำกับอักษรโรมัน\nบทเรียนที่ควรฝึก: ${recommended.title}\nเหตุผล: ${dashboard.recommendation.reason}\n\nความก้าวหน้าล่าสุด:\n${dashboard.recommendation.stats.map(s => `${lessonById(s.id).title}: ${s.attempts ? `ฝึก ${s.attempts} ครั้ง คะแนนล่าสุด ${Math.round(s.latestScore * 100)}%` : s.reported ? 'เรียนแล้วตามที่ฉันแจ้ง (ยังไม่มีคะแนนแบบฝึกหัด)' : 'ยังไม่ได้ฝึก'}`).join('\n')}\n\nเนื้อหาที่กำลังเรียน:\n${recommended.blocks.map(([h, t]) => `${h}: ${t}`).join('\n')}\n\nช่วยถามประเมินความเข้าใจทีละข้อ รอให้ฉันตอบก่อนเฉลย อธิบายรูปศัพท์และหน้าที่คำด้วยตัวอย่างง่าย ๆ แยกตัวอย่างแต่งเพื่อเรียนจากคำอ้างในคัมภีร์ ถ้าไม่แน่ใจให้บอกตรง ๆ และอย่าแต่งแหล่งอ้างอิงขึ้นเอง เริ่มจากคำถามสั้นหนึ่งข้อ`;
}
function demoGameData(storageKey = DEMO_GAME_KEY) {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return { credits: data.credits && typeof data.credits === 'object' ? data.credits : {}, days: Array.isArray(data.days) ? data.days : [], completedLessons: Array.isArray(data.completedLessons) ? data.completedLessons.filter(id => lessonById(id)) : [], history: Array.isArray(data.history) ? data.history.filter(h => lessonById(h.lesson_id) && Number.isInteger(h.score) && Number.isInteger(h.total) && h.total > 0 && h.score >= 0 && h.score <= h.total && !Number.isNaN(Date.parse(h.created_at))) : [] };
  } catch { return { credits: {}, days: [], history: [], completedLessons: [] }; }
}
function localGameKey() {
  return demo ? DEMO_GAME_KEY : `pali-local-games-v1:${dashboard?.user?.id || session?.user?.id || 'this-device'}`;
}
function learningHistory() {
  return [...dashboard.history, ...(dashboard.localHistory || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
function localProgress(data) {
  const today = bangkokDay();
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const week = d.toISOString().slice(0, 10);
  const entries = Object.entries(data.credits).filter(([, v]) => v === 10);
  const creditedIds = new Set(entries.map(([key]) => key.slice(11)));
  return { totalXP: entries.length * 10, weekXP: entries.filter(([key]) => key.slice(0, 10) >= week).length * 10, days: data.days, joined: false,
    practicedLessons: grammarLessons.filter(l => l.questions.some(q => creditedIds.has(q.id))).map(l => l.id) };
}
async function loadGameProgress() {
  const data = demoGameData(localGameKey());
  if (demo) gameProgress = localProgress(data);
  else {
    try { gameProgress = await request('/rest/v1/rpc/get_game_progress', { method: 'POST', data: {} }); }
    catch { gameProgress = { ...localProgress(data), unavailable: true }; }
  }
}
async function loadBoard() {
  if (demo || gameProgress?.unavailable) { board = null; return; }
  board = await request('/rest/v1/rpc/get_leaderboard', { method: 'POST', data: {} });
}
function resetGameSelection() {
  game.selected = game.question.kind === 'pair' ? Array(game.question.left.length).fill(null) : [];
  game.activeLeft = null;
  game.activeRight = null;
}
function localGame(lessonId) {
  const questions = [...grammarLessons.find(l => l.id === lessonId).questions];
  for (let i = questions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [questions[i], questions[j]] = [questions[j], questions[i]]; }
  const practice = createPractice(questions);
  return { lessonId, demo: true, storageKey: localGameKey(), practice, question: questions[0], step: 0, total: questions.length, initialTotal: questions.length, xp: 0, combo: 0, bestCombo: 0 };
}
async function handleGameAction(action) {
  if (gameBusy) return;
  if (action.startsWith('game-start:')) {
    gameBusy = true;
    try {
      const lessonId = action.split(':')[1];
      if (!demo && gameProgress?.unavailable) await loadGameProgress();
      const localPractice = demo || Boolean(gameProgress?.unavailable);
      if (localPractice) {
        game = localGame(lessonId);
      } else {
        try {
          const run = await request('/rest/v1/rpc/start_game', { method: 'POST', data: { p_lesson_id: lessonId } });
          game = { ...run, lessonId, demo: false, xp: 0, combo: 0, bestCombo: 0 };
        } catch (error) {
          if (!session || lessonById(lessonId)?.level !== 'ประโยค 1–2') throw error;
          game = localGame(lessonId);
          toast('ชุดออนไลน์ของบทใหม่ยังไม่พร้อม เริ่มฝึกและเก็บคะแนนในเครื่องนี้ได้');
        }
      }
      resetGameSelection(); view = 'game'; render(); window.scrollTo(0, 0);
    } finally { gameBusy = false; }
    return;
  }
  if (!game || view !== 'game') return;
  const index = Number(action.split(':')[1]);
  if (action === 'game-next' && game.feedback) {
    gameBusy = true;
    try {
      if (game.done) { await loadDashboard(); view = 'game-result'; }
      else {
        if (game.demo) { advancePractice(game.practice); game.step = game.practice.step; game.question = game.practice.queue[game.step]; }
        else { game.step = game.nextState.step; game.question = game.nextState.nextQuestion; }
        game.feedback = null; resetGameSelection();
      }
      render(); window.scrollTo(0, 0);
    } finally { gameBusy = false; }
    return;
  }
  if (game.feedback) return;
  if (action.startsWith('game-left:')) {
    if (game.question.kind === 'pair') Object.assign(game, selectPair(game, 'left', index, game.question.options.length));
    render(); return;
  }
  if (action.startsWith('game-pick:')) {
    if (index < 0 || index >= game.question.options.length) return;
    if (game.question.kind === 'build') { if (!game.selected.includes(index)) game.selected.push(index); }
    else if (game.question.kind === 'pair') {
      Object.assign(game, selectPair(game, 'right', index, game.question.options.length));
    } else game.selected = [index];
    render(); return;
  }
  if (action.startsWith('game-remove:')) { game.selected.splice(index, 1); render(); return; }
  if (action === 'game-reset') { resetGameSelection(); render(); return; }
  if (action !== 'game-check') return;
  gameBusy = true;
  const checkButton = app.querySelector('[data-action="game-check"]');
  if (checkButton) checkButton.disabled = true;
  try {
    let result;
    if (game.demo) {
      const data = demoGameData(game.storageKey);
      const day = bangkokDay();
      result = submitPractice(game.practice, game.selected, q => {
        const key = `${day}:${q.id}`;
        if (data.credits[key]) return 0;
        data.credits[key] = 10; return 10;
      });
      if (!data.days.includes(day)) data.days.push(day);
      game.total = game.practice.queue.length;
      game.done = game.practice.step + 1 >= game.total;
      game.firstTryCorrect = game.practice.firstTryCorrect;
      if (game.done) {
        const attempt = { id: crypto.randomUUID(), lesson_id: game.lessonId, score: game.firstTryCorrect, total: game.initialTotal, created_at: new Date().toISOString(), local: true };
        if (demo) { dashboard.history.unshift(attempt); localStorage.setItem(DEMO_KEY, JSON.stringify(dashboard.history)); }
        else data.history.unshift(attempt);
      }
      localStorage.setItem(game.storageKey, JSON.stringify(data));
      if (!demo) dashboard.localHistory = data.history;
      dashboard.recommendation = recommend(learningHistory(), dashboard.reportedLessons || []);
      if (demo || gameProgress?.unavailable) gameProgress = { ...localProgress(data), ...(!demo ? { unavailable: true } : {}) };
    } else {
      result = await request('/rest/v1/rpc/answer_game', { method: 'POST', data: { p_token: game.token, p_step: game.step, p_answer: game.selected } });
      game.nextState = result; game.total = result.total; game.done = result.done; game.firstTryCorrect = result.firstTryCorrect;
    }
    game.feedback = result; game.xp += result.xp;
    game.combo = result.correct ? game.combo + 1 : 0;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    render();
  } catch (error) {
    const errorEl = app.querySelector('#game-error'); if (errorEl) errorEl.textContent = error.message;
    if (checkButton?.isConnected) checkButton.disabled = false;
  } finally { gameBusy = false; }
}
async function loadDashboard() {
  if (demo) {
    let history = []; try { history = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch { /* reset invalid local demo data */ }
    if (!Array.isArray(history)) history = [];
    history = history.filter(h => lessonById(h.lesson_id) && Number.isInteger(h.score) && h.score >= 0 && h.score <= h.total && Number.isInteger(h.total) && h.total > 0 && h.total <= 5 && !Number.isNaN(Date.parse(h.created_at)));
    dashboard = { user: { name: 'เพื่อนผู้เรียน' }, history, recommendation: recommend(history) };
  } else {
    const [profile, history] = await Promise.all([
      request('/rest/v1/profiles?select=user_id,display_name&limit=1'),
      request('/rest/v1/attempts?select=id,lesson_id,score,total,created_at&order=created_at.desc&limit=1000')
    ]);
    dashboard = { user: { id: profile[0]?.user_id, name: profile[0]?.display_name || 'ผู้เรียน' }, history, recommendation: recommend(history) };
  }
  dashboard.localHistory = demo ? [] : demoGameData(localGameKey()).history;
  dashboard.recommendation = recommend(learningHistory(), dashboard.reportedLessons || []);
  await loadGameProgress();
  let serverCompletions = [];
  if (!demo && !gameProgress?.unavailable) {
    try { serverCompletions = await request('/rest/v1/lesson_completions?select=lesson_id'); } catch {}
  }
  dashboard.reportedLessons = [...new Set([...demoGameData(localGameKey()).completedLessons, ...serverCompletions.map(c => c.lesson_id)])];
  dashboard.recommendation = recommend(learningHistory(), dashboard.reportedLessons);
  if (sessionStorage.getItem('pali-restore-basics') === '1') {
    sessionStorage.removeItem('pali-restore-basics');
    await markLessonsLearned(BASELINE_LESSONS);
  }
}
async function markLessonsLearned(ids) {
  const data = demoGameData(localGameKey());
  data.completedLessons = [...new Set([...data.completedLessons, ...ids])];
  localStorage.setItem(localGameKey(), JSON.stringify(data));
  dashboard.reportedLessons = [...new Set([...(dashboard.reportedLessons || []), ...ids])];
  dashboard.recommendation = recommend(learningHistory(), dashboard.reportedLessons);
  let synced = false;
  if (!demo && !gameProgress?.unavailable) {
    try { await request('/rest/v1/rpc/mark_learned', { method: 'POST', data: { p_lesson_ids: ids } }); synced = true; } catch {}
  }
  toast(synced ? 'บันทึกว่าเรียนแล้วในบัญชี โดยไม่เพิ่มคะแนนหรือ XP' : 'บันทึกว่าเรียนแล้วในเครื่องนี้ โดยไม่เพิ่มคะแนนหรือ XP');
}
app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  try {
    if (view === 'daily' && !action.startsWith('daily-')) daily.leave();
    if (action.startsWith('daily-')) { await daily.action(action); return; }
    if (view === 'exams' && !action.startsWith('exam-')) exams.leave();
    if (action.startsWith('exam-')) { await exams.action(action); return; }
    if (action.startsWith('chant-')) { await chants.action(action); return; }
    if (action.startsWith('learned:')) { await markLessonsLearned([action.split(':')[1]]); render(); return; }
    if (action === 'board-retry') {
      target.disabled = true;
      const alias = app.querySelector('#board-alias')?.value || '';
      const joined = app.querySelector('input[name=join]')?.checked || false;
      await loadGameProgress(); await loadBoard(); render();
      app.querySelector('#board-alias').value = alias;
      app.querySelector('input[name=join]').checked = joined;
      if (gameProgress?.unavailable) toast('ระบบอันดับยังไม่พร้อม ชื่อที่กรอกยังอยู่ กรุณาให้ผู้ดูแลเปิดระบบก่อน');
      return;
    }
    if (action.startsWith('game-')) { await handleGameAction(action); return; }
    if (action === 'google-login') {
      target.disabled = true;
      document.querySelector('#auth-error').textContent = '';
      const settings = await request('/auth/v1/settings', { authenticated: false });
      if (!settings.external?.google) throw new Error('ผู้ดูแลยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google กรุณาใช้อีเมลหรือโหมดทดลองก่อน');
      const redirectTo = new URL(location.pathname, location.origin).href;
      const url = await startGoogleOAuth({ supabaseUrl: config.supabaseUrl, redirectTo, storage: sessionStorage });
      location.assign(url);
      return;
    }
    if (action.endsWith('-tab')) { authTab = action === 'login-tab' ? 'login' : 'register'; return renderAuth(); }
    if (action === 'demo') { demo = true; view = entryView(); await loadDashboard(); return render(); }
    if (action === 'logout') {
      exams.leave();
      chants.leave();
      if (!demo) await request('/auth/v1/logout', { method: 'POST', data: {} });
      saveSession(null); demo = false; dashboard = null; quiz = null; return renderAuth();
    }
    if (action.startsWith('nav:')) { if (view === 'chants') chants.leave(); view = action.split(':')[1]; if (view === 'leaderboard') await loadBoard(); render(); window.scrollTo(0, 0); return; }
    if (action.startsWith('lesson:')) { view = action; render(); window.scrollTo(0, 0); return; }
    if (action.startsWith('quiz:')) {
      target.disabled = true;
      const id = action.split(':')[1];
      quiz = demo ? { lessonId: id, questions: lessonById(id).questions } : { ...(await request('/rest/v1/rpc/start_quiz', { method: 'POST', data: { p_lesson_id: id } })), lessonId: id };
      view = 'quiz'; render(); window.scrollTo(0, 0); return;
    }
    if (action === 'copy') {
      try { await navigator.clipboard.writeText(paliText(tutorPrompt())); toast('คัดลอกแล้ว นำไปวางใน ChatGPT ได้เลย'); }
      catch { const range = document.createRange(); range.selectNodeContents(document.querySelector('#tutor-prompt')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); toast('เลือกข้อความแล้ว กรุณาคัดลอกด้วยเมนูของอุปกรณ์'); }
    }
    if (action === 'export') {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), mode: demo ? 'demo' : 'account', history: learningHistory() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'pali-learning-history.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    if (action === 'google-login') document.querySelector('#auth-error').textContent = error.message;
    else toast(error.message);
  } finally { if (target.isConnected) target.disabled = false; }
});
app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.id.startsWith('exam-')) {
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try { await exams.submit(form); } catch (error) { form.querySelector('.error').textContent = error.message; }
    finally { if (submit.isConnected) submit.disabled = false; }
    return;
  }
  if (form.id.startsWith('chant-')) {
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try { await chants.submit(form); } catch (error) { form.querySelector('.error').textContent = error.message; }
    finally { if (submit.isConnected) submit.disabled = false; }
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  const errorEl = form.querySelector('.error'); errorEl.textContent = '';
  try {
    const data = new FormData(form);
    if (form.id === 'auth-form') {
      const payload = { email: data.get('email').trim(), password: data.get('password') };
      let result;
      if (authTab === 'register') {
        payload.data = { display_name: data.get('name').trim() };
        result = await request('/auth/v1/signup', { method: 'POST', authenticated: false, data: payload });
        if (!result.access_token) { authTab = 'login'; renderAuth('ส่งคำขอแล้ว กรุณาตรวจอีเมลและกดยืนยันก่อนเข้าสู่ระบบ (หากอีเมลนี้สมัครแล้ว ให้เข้าสู่ระบบ)'); return; }
      } else result = await request('/auth/v1/token?grant_type=password', { method: 'POST', data: payload, authenticated: false });
      saveSession({ ...result, expires_at: Date.now() / 1000 + result.expires_in }); demo = false; view = entryView(); await loadDashboard(); render();
    } else if (form.id === 'leaderboard-form') {
      await request('/rest/v1/rpc/set_leaderboard', { method: 'POST', data: { p_alias: data.get('alias'), p_join: data.get('join') === 'on' } });
      await loadGameProgress(); await loadBoard(); render(); toast('บันทึกการเข้าร่วมแล้ว');
    } else if (form.id === 'quiz-form') {
      const answers = quiz.questions.map((_, i) => Number(data.get(`q${i}`)));
      if (demo) {
        const feedback = quiz.questions.map((q, i) => ({ text: q.text, correct: answers[i] === q.answer, answer: q.options[q.answer], why: q.why }));
        quiz.result = { feedback, score: feedback.filter(f => f.correct).length, total: feedback.length };
        dashboard.history.unshift({ lesson_id: quiz.lessonId, score: quiz.result.score, total: quiz.result.total, created_at: new Date().toISOString() });
        localStorage.setItem(DEMO_KEY, JSON.stringify(dashboard.history));
      } else quiz.result = await request('/rest/v1/rpc/submit_quiz', { method: 'POST', data: { p_token: quiz.token, p_answers: answers } });
      await loadDashboard(); view = 'result'; render(); window.scrollTo(0, 0);
    }
  } catch (error) { errorEl.textContent = error.message; } finally { if (submit.isConnected) submit.disabled = false; }
});
app.addEventListener('change', async event => {
  if (event.target.id === 'daily-time') {
    try { daily.change(event); } catch (error) { toast(error.message); }
  }
  if (event.target.id.startsWith('exam-') || event.target.matches('[data-exam-answer],[data-exam-rubric]')) {
    try { await exams.change(event); } catch (error) { toast(error.message); }
  }
  if (event.target.id.startsWith('chant-')) {
    try { await chants.change(event); } catch (error) { toast(error.message); }
  }
});
app.addEventListener('input', event => { try { exams.input(event); } catch (error) { toast(error.message); } });
window.addEventListener('pagehide', () => { try { exams.leave(); } catch {} });
async function initialize() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('daily') === '1') sessionStorage.setItem('pali-open-daily', '1');
    if (params.get('course') === 'akkhara') sessionStorage.setItem('pali-open-akkhara', '1');
    if (params.get('chants') === '1') sessionStorage.setItem('pali-open-chants', '1');
    if (params.get('learned') === 'basics') {
      sessionStorage.setItem('pali-restore-basics', '1');
      params.delete('learned');
      const remaining = params.toString();
      history.replaceState(null, '', location.pathname + (remaining ? '?' + remaining : '') + location.hash);
    }
    const fragment = new URLSearchParams(location.hash.slice(1));
    const callbackError = params.get('error') || fragment.get('error');
    if (callbackError) {
      sessionStorage.removeItem(OAUTH_KEY);
      history.replaceState(null, '', location.pathname);
      renderAuth(oauthErrorMessage(callbackError));
      return;
    }
    if (params.has('code') && configured) {
      const code = params.get('code');
      // Remove credentials from the address bar before any further requests.
      history.replaceState(null, '', location.pathname);
      const verifier = consumeGoogleVerifier(sessionStorage);
      app.innerHTML = '<div class="loading">กำลังเข้าสู่ระบบด้วย Google…</div>';
      const result = await request('/auth/v1/token?grant_type=pkce', {
        method: 'POST', authenticated: false, data: { auth_code: code, code_verifier: verifier }
      });
      saveSession({ ...result, expires_at: Date.now() / 1000 + result.expires_in });
    } else if (fragment.has('access_token') && configured) {
      // Keep the existing email-confirmation callback compatible with Supabase.
      history.replaceState(null, '', location.pathname);
      if (sessionStorage.getItem(OAUTH_KEY)) {
        sessionStorage.removeItem(OAUTH_KEY);
        throw new Error('การเข้าสู่ระบบ Google ไม่สมบูรณ์ กรุณาลองใหม่');
      }
      saveSession({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token'), expires_at: Date.now() / 1000 + Number(fragment.get('expires_in') || 3600) });
    } else {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) session = JSON.parse(stored);
    }
    view = entryView();
    if (session && configured) { app.innerHTML = '<div class="loading">กำลังเปิดพื้นที่เรียนรู้ของคุณ…</div>'; await loadDashboard(); render(); }
    else renderAuth();
  } catch (error) { saveSession(null); renderAuth(error.message); }
}
initialize();
for (const type of ['pointerover', 'pointerout', 'focusin', 'focusout', 'keydown']) {
  document.addEventListener(type, event => { if (view === 'chants') chants.wordEvent(event); });
}
window.addEventListener('scroll', event => { if (view === 'chants') chants.wordEvent(event); }, true);
window.addEventListener('resize', event => { if (view === 'chants') chants.wordEvent(event); });

let visibleDay = bangkokDay();
document.addEventListener('visibilitychange', () => {
  const nextDay = bangkokDay();
  if (document.visibilityState === 'visible' && nextDay !== visibleDay) {
    visibleDay = nextDay;
    if (dashboard && ['daily', 'home'].includes(view)) {
      daily.leave();
      try { render(); } catch (error) { toast(error.message); }
    }
  }
});
