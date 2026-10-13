import { config } from './config.js';
import { lessons, recommend } from './lessons.js';

const app = document.querySelector('#app');
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl) && Boolean(config.supabasePublishableKey);
const SESSION_KEY = 'pali-auth-v1';
const DEMO_KEY = 'pali-demo-history-v1';
let session = null, demo = false, dashboard = null, view = 'home', authTab = 'login', quiz = null;
let refreshPromise = null;
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lessonById = id => lessons.find(l => l.id === id);
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
  app.innerHTML = `<main class="auth-layout"><section class="auth-intro">${brand()}<div class="auth-mark">ธ</div><div class="eyebrow">A LITTLE EVERY DAY</div><h1>เปิดประตูสู่ภาษาบาลี<br>ทีละคำ ทีละวัน</h1><p>เริ่มจากเสียงที่คุ้นเคย ไปสู่ความหมายที่ลึกขึ้น<br>มีพื้นที่เรียนรู้ และเส้นทางที่เป็นของคุณเอง</p><span class="badge">3 บทเรียนเริ่มต้น · เรียนฟรี</span></section><section class="panel"><div class="tabs"><button data-action="login-tab" class="${authTab === 'login' ? 'active' : ''}">เข้าสู่ระบบ</button><button data-action="register-tab" class="${authTab === 'register' ? 'active' : ''}">สร้างบัญชี</button></div>${!configured ? '<div class="banner">เว็บไซต์ยังไม่ได้เชื่อมฐานข้อมูล บัญชีและประวัติออนไลน์ยังใช้ไม่ได้ ลองบทเรียนตัวอย่างได้ด้านล่าง</div>' : ''}<form id="auth-form">${authTab === 'register' ? '<label for="name">อยากให้เราเรียกคุณว่าอะไร?</label><input id="name" name="name" maxlength="60" required autocomplete="nickname" placeholder="ชื่อเล่นของคุณ">' : ''}<label for="email">อีเมล</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"><label for="password">รหัสผ่าน ${authTab === 'register' ? '(อย่างน้อย 10 ตัว)' : ''}</label><input id="password" name="password" type="password" minlength="${authTab === 'register' ? '10' : '1'}" maxlength="128" required autocomplete="${authTab === 'register' ? 'new-password' : 'current-password'}"><p class="error" id="auth-error" role="alert">${esc(message)}</p><button class="button full" type="submit" ${!configured ? 'disabled' : ''}>${authTab === 'login' ? 'เข้าสู่พื้นที่เรียนรู้ →' : 'สร้างบัญชีของฉัน →'}</button></form><p class="auth-footer">บัญชีและประวัติเก็บที่ Supabase แยกตามผู้เรียน ผู้ดูแลโครงการสามารถเข้าถึงฐานข้อมูลได้ รหัสผ่านจัดการโดย Supabase Auth<br>ไม่มีการเชื่อมบัญชี ChatGPT หรือส่งประวัติไปยัง ChatGPT โดยอัตโนมัติ</p>${button('ลองเรียนโดยไม่สร้างบัญชี', 'demo', 'secondary full')}<p class="auth-footer">โหมดทดลองเก็บประวัติเฉพาะเบราว์เซอร์นี้ ไม่ซิงก์ข้ามเครื่อง</p></section></main>`;
}
function shell(content) {
  const name = dashboard.user.name;
  const active = view.startsWith('lesson:') || view === 'quiz' || view === 'result' ? 'lessons' : view;
  app.innerHTML = `<div class="shell"><aside class="sidebar">${brand()}<nav class="nav" aria-label="เมนูหลัก">${[['home', '⌂', 'พื้นที่เรียนรู้'], ['lessons', '▤', 'บทเรียนทั้งหมด'], ['history', '◷', 'ประวัติการเรียน'], ['tutor', '✦', 'ติวเตอร์ส่วนตัว']].map(([id, icon, label]) => `<button data-action="nav:${id}" class="${active === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`).join('')}</nav><div class="side-note">“เรียนรู้ทีละน้อย<br>แต่เรียนรู้อย่างสม่ำเสมอ”<p>พื้นที่เล็ก ๆ สำหรับการเติบโต<br>ในทุกวันของคุณ</p></div></aside><main class="main"><header class="topbar"><span>เส้นทางการเรียนรู้ของคุณ</span><div class="account"><span class="avatar">${esc(Array.from(name)[0] || 'ป')}</span><span>${esc(name)}</span>${button(demo ? 'ออกจากโหมดทดลอง' : 'ออกจากระบบ', 'logout', 'secondary small')}</div></header>${demo ? '<div class="banner">โหมดทดลอง • ประวัติอยู่ในเบราว์เซอร์นี้เท่านั้น ยังไม่ใช่บัญชีออนไลน์</div>' : ''}${content}<footer class="footer">บาลีทีละนิด · เรียนด้วยความเข้าใจ เติบโตตามจังหวะของคุณ</footer></main></div>`;
}
function cards() {
  return `<div class="cards">${lessons.map((l, i) => {
    const stat = dashboard.recommendation.stats.find(s => s.id === l.id);
    return `<article class="lesson-card"><div class="icon">${l.icon}</div><div class="eyebrow">บทที่ 0${i + 1}</div><h3>${l.title}</h3><p>${l.intro}</p><div class="card-meta"><span>${l.level} · ${l.minutes} นาที</span><span>${stat.attempts ? `ล่าสุด ${Math.round(stat.latestScore * 100)}%` : 'ยังไม่ได้ฝึก'}</span></div><progress class="progress" max="100" value="${Math.round((stat.latestScore || 0) * 100)}" aria-label="คะแนนล่าสุดของบทเรียน"></progress><div class="actions">${button(stat.attempts ? 'ทบทวนบทเรียน →' : 'เริ่มเรียน →', `lesson:${l.id}`, 'secondary full')}</div></article>`;
  }).join('')}</div>`;
}
function home() {
  const { history, recommendation, user } = dashboard;
  const recommended = lessonById(recommendation.lessonId);
  const mastered = recommendation.stats.filter(s => s.latestScore >= 0.8).length;
  const average = history.length ? Math.round(history.reduce((n, h) => n + h.score / h.total, 0) / history.length * 100) : 0;
  shell(`<div class="heading"><div><div class="eyebrow">YOUR LEARNING SPACE</div><h1>สวัสดี ${esc(user.name)} <span aria-hidden="true">☀</span></h1><p class="muted">วันนี้มาเติมความรู้ภาษาบาลีกันอีกนิดนะ</p></div><span class="badge">เส้นทางส่วนตัวของคุณ</span></div><section class="hero"><div><div class="eyebrow">บทเรียนที่แนะนำสำหรับคุณ</div><h2>${recommended.title}</h2><p>${recommendation.reason}</p><p><span class="badge">${recommended.minutes} นาที · ${recommended.level}</span></p>${button('เริ่มเรียนต่อ →', `lesson:${recommended.id}`, 'light')}</div><div class="hero-art" aria-hidden="true"><div class="ring">${recommended.icon}</div></div></section><div class="stats"><div class="stat"><span class="muted">บทเรียนที่ทำได้ดี</span><div class="value">${mastered}<small>/ 3 บท</small></div><span class="muted">คะแนนล่าสุดอย่างน้อย 80%</span></div><div class="stat"><span class="muted">ฝึกฝนแล้ว</span><div class="value">${history.length}<small>ครั้ง</small></div><span class="muted">ทุกครั้งคืออีกหนึ่งก้าว</span></div><div class="stat"><span class="muted">คะแนนเฉลี่ย</span><div class="value">${average}<small>%</small></div><span class="muted">${history.length ? 'จากแบบฝึกหัดของคุณ' : 'เริ่มฝึกเพื่อดูความก้าวหน้า'}</span></div></div><div class="section-head"><h2>ค่อย ๆ เรียนรู้ ทีละบท</h2><span class="muted">พื้นฐานที่มั่นคง เริ่มจากตรงนี้</span></div>${cards()}<section class="bottom-note"><div class="symbol" aria-hidden="true">✦</div><div><h3>มีคำถามระหว่างเรียนไหม?</h3><p>เตรียมบริบทการเรียน แล้วนำไปคุยกับ ChatGPT ของคุณ</p></div>${button('พบติวเตอร์ของคุณ →', 'nav:tutor', 'secondary')}</section>`);
}
function render() {
  if (!dashboard) return renderAuth();
  if (view === 'home') return home();
  if (view === 'lessons') return shell(`<div class="heading"><div><div class="eyebrow">THE FIRST STEPS</div><h1>บทเรียนทั้งหมด</h1><p class="muted">อ่าน ทำแบบฝึกหัด แล้วทบทวนในจังหวะของคุณ</p></div></div>${cards()}`);
  if (view.startsWith('lesson:')) {
    const l = lessonById(view.split(':')[1]);
    shell(`<div class="heading"><div><div class="eyebrow">${l.level} · ${l.minutes} นาที</div><h1>${l.title}</h1><p class="muted">${l.intro}</p></div></div><article class="panel">${l.blocks.map(([title, text]) => `<section class="content-block"><h3>${title}</h3><p>${text}</p></section>`).join('')}</article><div class="actions">${button('ลองทำแบบฝึกหัด →', `quiz:${l.id}`)}${button('กลับไปบทเรียนทั้งหมด', 'nav:lessons', 'secondary')}</div>`);
    return;
  }
  if (view === 'quiz') {
    shell(`<div class="heading"><div><div class="eyebrow">PRACTICE MAKES PROGRESS</div><h1>ลองทดสอบความเข้าใจ</h1><p class="muted">${lessonById(quiz.lessonId).title} · ${quiz.questions.length} ข้อ</p></div></div><form id="quiz-form" class="panel">${quiz.questions.map((q, i) => `<fieldset class="question"><legend>${i + 1}. ${esc(q.text)}</legend><div class="options">${q.options.map((option, n) => `<label class="option"><input type="radio" name="q${i}" value="${n}" required><span>${esc(option)}</span></label>`).join('')}</div></fieldset>`).join('')}<p class="error" id="quiz-error" role="alert"></p><button class="button" type="submit">ตรวจคำตอบและบันทึกผล →</button></form>`);
    return;
  }
  if (view === 'result') {
    shell(`<div class="heading"><div><div class="eyebrow">ANOTHER STEP FORWARD</div><h1>${quiz.result.score === quiz.result.total ? 'ทำได้ดีมาก!' : 'เรียนรู้อีกนิด จำได้อีกหน่อย'}</h1><p class="muted">บันทึกผลแล้ว${demo ? 'ในเบราว์เซอร์นี้' : 'ในบัญชีของคุณ'} · ${quiz.result.score} / ${quiz.result.total} คะแนน</p></div></div><section class="panel">${quiz.result.feedback.map(f => `<div class="feedback ${f.correct ? '' : 'wrong'}"><h3>${f.correct ? '✓' : '↻'} ${esc(f.text)}</h3><p>คำตอบ: ${esc(f.answer)}</p><p>${esc(f.why)}</p></div>`).join('')}</section><div class="actions">${button('ดูบทเรียนที่แนะนำต่อ →', 'nav:home')}${button('ทบทวนบทนี้', `lesson:${quiz.lessonId}`, 'secondary')}${button('ถามติวเตอร์เพิ่มเติม', 'nav:tutor', 'secondary')}</div>`);
    return;
  }
  if (view === 'history') {
    shell(`<div class="heading"><div><div class="eyebrow">YOUR JOURNEY</div><h1>ประวัติการเรียน</h1><p class="muted">ทุกครั้งที่ฝึก ช่วยให้เราเลือกบททบทวนที่เหมาะกับคุณ</p></div></div><section class="panel">${dashboard.history.length ? `<ul class="history-list">${dashboard.history.map(h => `<li><div><h3>${lessonById(h.lesson_id)?.title || esc(h.lesson_id)}</h3><span class="muted">${esc(date(h.created_at))}</span></div><span class="score">${h.score} / ${h.total}</span></li>`).join('')}</ul>` : '<div class="empty">ยังไม่มีประวัติ เริ่มทำแบบฝึกหัดแรกได้เลย</div>'}</section><div class="actions">${button('ดาวน์โหลดประวัติของฉัน', 'export', 'secondary')}</div>`);
    return;
  }
  if (view === 'tutor') {
    shell(`<div class="heading"><div><div class="eyebrow">LEARN WITH YOUR CHATGPT</div><h1>ติวเตอร์ส่วนตัวของคุณ</h1><p class="muted">ใช้บัญชี ChatGPT ของคุณเอง โดยไม่ต้องเชื่อมรหัสผ่านกับเว็บนี้</p></div></div><div class="tutor-info"><section class="panel"><h2>นำบทเรียนไปคุยต่อ</h2><ol><li>คัดลอกข้อความบริบทด้านล่าง</li><li>เปิด ChatGPT แล้วเข้าสู่บัญชีของคุณ</li><li>วางข้อความในแชตใหม่ แล้วเริ่มเรียนได้เลย</li></ol><p class="muted">เว็บไม่สามารถใช้โควตา Plus ผ่าน API ได้ การสนทนาจะเกิดใน ChatGPT และอยู่ภายใต้โควตาของบัญชีนั้น ผลสนทนาไม่ซิงก์กลับมายังเว็บ</p><div class="actions">${button('คัดลอกบริบท', 'copy')}<a class="button secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">เปิด ChatGPT ↗</a></div></section><section class="panel"><h2>ปรับตามความก้าวหน้าของคุณ</h2><p class="muted">ระบบเลือกบทที่ควรทบทวนจากคะแนนล่าสุด หากไม่มีจุดที่ต้องทบทวน จะเลือกบทที่ยังไม่ได้เรียน การแนะนำนี้ใช้กติกาจากคะแนน ไม่ได้เรียก AI</p><h3>แนะนำ: ${lessonById(dashboard.recommendation.lessonId).title}</h3><p class="muted">ข้อความที่คัดลอกมีเฉพาะบทเรียนและคะแนน ไม่ใส่อีเมลหรือรหัสผ่าน คุณตรวจแก้ก่อนนำไปส่งได้</p></section></div><section class="panel"><h3>บริบทที่คุณจะนำไปวางใน ChatGPT</h3><pre class="prompt" id="tutor-prompt">${esc(tutorPrompt())}</pre></section>`);
  }
}
function tutorPrompt() {
  const recommended = lessonById(dashboard.recommendation.lessonId);
  return `ช่วยเป็นติวเตอร์ภาษาบาลีสำหรับผู้เริ่มต้น สอนเป็นภาษาไทยอย่างใจเย็น\nเป้าหมาย: อ่านคำบาลีและเข้าใจประโยคพื้นฐาน\nบทเรียนที่ควรฝึก: ${recommended.title}\nเหตุผล: ${dashboard.recommendation.reason}\n\nความก้าวหน้าล่าสุด:\n${dashboard.recommendation.stats.map(s => `${lessonById(s.id).title}: ${s.attempts ? `ฝึก ${s.attempts} ครั้ง คะแนนล่าสุด ${Math.round(s.latestScore * 100)}%` : 'ยังไม่ได้ฝึก'}`).join('\n')}\n\nเนื้อหาที่กำลังเรียน:\n${recommended.blocks.map(([h, t]) => `${h}: ${t}`).join('\n')}\n\nช่วยถามประเมินความเข้าใจทีละข้อ รอให้ฉันตอบก่อนเฉลย อธิบายรูปศัพท์และหน้าที่คำด้วยตัวอย่างง่าย ๆ แยกตัวอย่างแต่งเพื่อเรียนจากคำอ้างในคัมภีร์ ถ้าไม่แน่ใจให้บอกตรง ๆ และอย่าแต่งแหล่งอ้างอิงขึ้นเอง เริ่มจากคำถามสั้นหนึ่งข้อ`;
}
async function loadDashboard() {
  if (demo) {
    let history = []; try { history = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch { /* reset invalid local demo data */ }
    if (!Array.isArray(history)) history = [];
    history = history.filter(h => lessonById(h.lesson_id) && Number.isInteger(h.score) && h.score >= 0 && h.score <= 3 && h.total === 3 && !Number.isNaN(Date.parse(h.created_at)));
    dashboard = { user: { name: 'เพื่อนผู้เรียน' }, history, recommendation: recommend(history) };
  } else {
    const [profile, history] = await Promise.all([
      request('/rest/v1/profiles?select=display_name&limit=1'),
      request('/rest/v1/attempts?select=id,lesson_id,score,total,created_at&order=created_at.desc&limit=1000')
    ]);
    dashboard = { user: { name: profile[0]?.display_name || 'ผู้เรียน' }, history, recommendation: recommend(history) };
  }
}
app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  try {
    if (action.endsWith('-tab')) { authTab = action === 'login-tab' ? 'login' : 'register'; return renderAuth(); }
    if (action === 'demo') { demo = true; view = 'home'; await loadDashboard(); return render(); }
    if (action === 'logout') {
      if (!demo) await request('/auth/v1/logout', { method: 'POST', data: {} });
      saveSession(null); demo = false; dashboard = null; quiz = null; return renderAuth();
    }
    if (action.startsWith('nav:')) { view = action.split(':')[1]; render(); window.scrollTo(0, 0); return; }
    if (action.startsWith('lesson:')) { view = action; render(); window.scrollTo(0, 0); return; }
    if (action.startsWith('quiz:')) {
      target.disabled = true;
      const id = action.split(':')[1];
      quiz = demo ? { lessonId: id, questions: lessonById(id).questions } : { ...(await request('/rest/v1/rpc/start_quiz', { method: 'POST', data: { p_lesson_id: id } })), lessonId: id };
      view = 'quiz'; render(); window.scrollTo(0, 0); return;
    }
    if (action === 'copy') {
      try { await navigator.clipboard.writeText(tutorPrompt()); toast('คัดลอกแล้ว นำไปวางใน ChatGPT ได้เลย'); }
      catch { const range = document.createRange(); range.selectNodeContents(document.querySelector('#tutor-prompt')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); toast('เลือกข้อความแล้ว กรุณาคัดลอกด้วยเมนูของอุปกรณ์'); }
    }
    if (action === 'export') {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), mode: demo ? 'demo' : 'account', history: dashboard.history }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'pali-learning-history.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) { toast(error.message); } finally { if (target.isConnected) target.disabled = false; }
});
app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
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
      saveSession({ ...result, expires_at: Date.now() / 1000 + result.expires_in }); demo = false; view = 'home'; await loadDashboard(); render();
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
async function initialize() {
  try {
    // Supabase email confirmation redirects back with a session in the URL fragment.
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.has('access_token') && configured) {
      saveSession({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token'), expires_at: Date.now() / 1000 + Number(fragment.get('expires_in') || 3600) });
      history.replaceState(null, '', location.pathname);
    } else {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) session = JSON.parse(stored);
    }
    if (session && configured) { app.innerHTML = '<div class="loading">กำลังเปิดพื้นที่เรียนรู้ของคุณ…</div>'; await loadDashboard(); render(); }
    else renderAuth();
  } catch (error) { saveSession(null); renderAuth(error.message); }
}
initialize();
