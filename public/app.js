/* ============================================================
   MindSpace — Single Page App Logic
   ============================================================ */

const MAX_TURNS = 5;

const state = {
  turn: 0,
  messages: [],
  busy: false,
};

const encouragements = [
  "You're doing wonderfully — every word helps me understand you better. 💛",
  "Thank you for opening up. Sharing like this takes real courage. 🌿",
  "I can feel your honesty in every line. That's a true strength. ✨",
  "Almost there — one more reflection, and I'll have what I need. 🌸",
  "You've shared so much. Let me now bring it all together for you. 💜",
];

// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);
const log = $('chat-log');
const input = $('msg-input');

// Initialise step data-n attributes
for (let i = 1; i <= 5; i++) $(`ts${i}`).dataset.n = i;

// Auto-grow textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 130) + 'px';
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

// ── Boot: show Dr. Hart's opening message immediately ───────
(function init() {
  setStep(1, 'active');
  const opening = {
    role: 'assistant',
    content: `Thank you for being here. This is a safe, judgement-free space — whatever you're carrying, you don't have to carry it alone.\n\nTo start, I'd love to simply hear from you: What's been weighing on your heart lately?`,
  };
  appendDr(opening.content, null);
  state.messages.push(opening);
  input.focus();
})();

// ============================================================
//  SEND
// ============================================================
async function send() {
  const text = input.value.trim();
  if (!text || state.busy) return;

  appendUser(text);
  state.messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';

  state.turn++;
  state.busy = true;
  $('send-btn').disabled = true;

  // Encouragement between turns
  if (state.turn > 1 && state.turn <= MAX_TURNS) {
    showEnc(encouragements[state.turn - 2]);
  }

  showTyping();
  scrollDown();

  if (state.turn <= MAX_TURNS) {
    await doTurn(state.turn);
  } else {
    await doAssessment();
  }

  state.busy = false;
  $('send-btn').disabled = false;
}

// ── Conversation turn 1-5 ────────────────────────────────────
async function doTurn(n) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages, turnNumber: n }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    hideTyping();
    state.messages.push({ role: 'assistant', content: data.response });
    appendDr(data.response, data.emotionDetected);

    // Progress: mark step n done, activate step n+1
    setStep(n, 'done');
    if (n < MAX_TURNS) setStep(n + 1, 'active');
    else { setStep(6, 'active'); setHint(MAX_TURNS); } // last turn — flag assessment coming
    scrollDown();

  } catch (err) {
    hideTyping();
    appendError(err.message || 'Something went wrong. Please try again.');
  }
}

// ── Final assessment ─────────────────────────────────────────
async function doAssessment() {
  setStep(6, 'active');
  setHint(MAX_TURNS); // ensure hint is updated

  appendTransition();
  scrollDown();

  try {
    const res = await fetch('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    hideTyping();
    setStep(6, 'done');

    // Lock input
    $('input-area').style.opacity = '.35';
    $('input-area').style.pointerEvents = 'none';
    $('turn-hint').textContent = 'Session complete ✦';
    $('turn-hint').style.color = 'var(--amber)';

    await sleep(800);
    renderAssessment(data);
    scrollToAssessment();

  } catch (err) {
    hideTyping();
    appendError(err.message || 'Assessment failed. Please try again.');
  }
}

// ============================================================
//  DOM builders
// ============================================================
function appendDr(text, emotion) {
  const div = document.createElement('div');
  div.className = 'msg dr';
  div.innerHTML = `
    <div class="av" aria-hidden="true">🧠</div>
    <div class="mbody">
      <div class="mname">Dr. Elena Hart</div>
      <div class="bubble dr-b">${nl2p(esc(text))}</div>
      ${emotion ? `<div class="etag">🎯 ${esc(emotion)}</div>` : ''}
    </div>`;
  log.appendChild(div);
}

function appendUser(text) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = `
    <div class="uav" aria-hidden="true">🙋</div>
    <div class="mbody">
      <div class="mname">You</div>
      <div class="bubble user-b">${nl2p(esc(text))}</div>
    </div>`;
  log.appendChild(div);
}

function appendTransition() {
  hideTyping();
  const div = document.createElement('div');
  div.className = 'msg dr';
  div.innerHTML = `
    <div class="av" aria-hidden="true">🧠</div>
    <div class="mbody" style="max-width:92%">
      <div class="mname">Dr. Elena Hart</div>
      <div class="trans-bubble">
        Thank you so deeply for everything you've shared today.
        I've been listening carefully to every word, every feeling, every layer.
        Give me just a moment to reflect… I'll share my full assessment shortly.
      </div>
    </div>`;
  log.appendChild(div);
}

function appendError(msg) {
  const div = document.createElement('div');
  div.className = 'msg dr';
  div.innerHTML = `
    <div class="av" style="background:var(--rose)" aria-hidden="true">⚠️</div>
    <div class="mbody">
      <div class="bubble dr-b" style="color:var(--rose)">${esc(msg)}</div>
    </div>`;
  log.appendChild(div);
}

// ── Encouragement strip ──────────────────────────────────────
function showEnc(text) {
  const strip = $('enc-strip');
  $('enc-text').textContent = text;
  strip.classList.remove('hidden');
  setTimeout(() => strip.classList.add('hidden'), 5500);
}

// ── Typing indicator ─────────────────────────────────────────
function showTyping() { $('typing-row').classList.remove('hidden'); }
function hideTyping()  { $('typing-row').classList.add('hidden'); }

// ── Progress steps ───────────────────────────────────────────
function setStep(n, state) {
  const el = $(`ts${n}`);
  el.classList.remove('active', 'done');
  if (state) el.classList.add(state);
}

function setHint(turn) {
  const hint = $('turn-hint');
  if (turn >= MAX_TURNS) {
    hint.textContent = 'Your next reply will complete the session — Dr. Hart will then share her full assessment ✦';
    hint.style.color = 'var(--amber)';
  } else {
    hint.textContent = `Turn ${turn} of ${MAX_TURNS} — share as much or as little as you'd like`;
    hint.style.color = '';
  }
}

// ============================================================
//  RENDER ASSESSMENT
// ============================================================
function renderAssessment(d) {
  // Sentiment
  const smap = {
    positive: { icon:'😊', grad:'linear-gradient(90deg,#56e39f,#4ecdc4)' },
    negative: { icon:'😔', grad:'linear-gradient(90deg,#ff6b8a,#c94b4b)' },
    neutral:  { icon:'😐', grad:'linear-gradient(90deg,#a0aec0,#718096)' },
    mixed:    { icon:'🌊', grad:'linear-gradient(90deg,#7c6cf0,#ff6b8a)' },
  };
  const s = (d.sentiment||'neutral').toLowerCase();
  const sm = smap[s] || smap.neutral;
  $('sent-icon').textContent = sm.icon;
  $('sent-label').textContent = s.charAt(0).toUpperCase() + s.slice(1);
  const pct = ((Number(d.sentimentScore)+100)/200)*100;
  const bar = $('sent-bar');
  bar.style.width = pct + '%';
  bar.style.background = sm.grad;

  // Intensity
  const iv = Math.min(100, Math.max(0, Number(d.emotionalIntensity)||0));
  $('int-num').textContent = iv;
  setTimeout(() => { $('ring-fill').style.strokeDashoffset = 276 - (iv/100)*276; }, 200);
  $('int-label').textContent = iv>=80?'Very High':iv>=60?'High':iv>=40?'Moderate':iv>=20?'Low':'Very Low';

  // Concern
  const cmap = { low:'🟢', moderate:'🟡', high:'🟠', critical:'🔴' };
  const ccol = { low:'var(--green)', moderate:'var(--amber)', high:'var(--rose)', critical:'#ff3860' };
  const levels = ['low','moderate','high','critical'];
  const cl = (d.concernLevel||'low').toLowerCase();
  $('con-icon').textContent = cmap[cl]||'🟢';
  const conLbl = $('con-label');
  conLbl.textContent = cl.charAt(0).toUpperCase()+cl.slice(1);
  conLbl.style.color = ccol[cl]||ccol.low;
  const idx = levels.indexOf(cl);
  document.querySelectorAll('.cl-row').forEach((r,i) => r.classList.toggle('active', i<=idx));

  // Emotions
  $('prim-badge').textContent = d.primaryEmotion||'—';
  const se = $('sec-emotions');
  se.innerHTML = '';
  (d.secondaryEmotions||[]).forEach(e => {
    const t = document.createElement('span');
    t.className = 'sec-tag';
    t.textContent = e;
    se.appendChild(t);
  });

  // Themes
  const th = $('themes');
  th.innerHTML = '';
  (d.themes||[]).forEach(t => {
    const r = document.createElement('div');
    r.className = 'theme-row';
    r.innerHTML = `<div class="tdot"></div><span>${esc(t)}</span>`;
    th.appendChild(r);
  });

  // Arc
  $('arc-text').textContent = d.emotionalArc||'';

  // Observation
  $('obs-text').textContent = d.keyInsights||'';

  // Response
  const rt = $('resp-text');
  rt.innerHTML = '';
  (d.psychiatristResponse||'').split(/\n+/).filter(p=>p.trim()).forEach((para, i) => {
    const p = document.createElement('p');
    p.textContent = para.trim();
    p.style.cssText = `opacity:0;transform:translateY(10px);transition:opacity .5s ease ${i*.16}s,transform .5s ease ${i*.16}s`;
    rt.appendChild(p);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ p.style.opacity='1'; p.style.transform='translateY(0)'; }));
  });

  // Coping
  const cp = $('coping');
  cp.innerHTML = '';
  (d.copingStrategies||[]).forEach((s,i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="cnum">${i+1}</div><span>${esc(s)}</span>`;
    cp.appendChild(li);
  });

  // Next steps
  const ns = $('next-steps');
  ns.innerHTML = '';
  (d.nextSteps||[]).forEach((s,i) => {
    const r = document.createElement('div');
    r.className = 'ns-row';
    r.innerHTML = `<div class="nsnum">${i+1}</div><span>${esc(s)}</span>`;
    ns.appendChild(r);
  });

  // Affirmation
  $('affirm-text').textContent = d.affirmation||'';

  // Show section
  $('assessment-section').classList.remove('hidden');
}

// ============================================================
//  RESTART
// ============================================================
function restart() {
  state.turn = 0;
  state.messages = [];
  state.busy = false;

  log.innerHTML = '';
  $('enc-strip').classList.add('hidden');
  $('typing-row').classList.add('hidden');
  $('assessment-section').classList.add('hidden');
  $('input-area').style.opacity = '';
  $('input-area').style.pointerEvents = '';
  $('turn-hint').textContent = "Turn 1 of 5 — share as much or as little as you'd like";
  $('turn-hint').style.color = '';

  for (let i=1;i<=6;i++) setStep(i, '');
  setStep(1, 'active');

  // Re-boot opening message
  const opening = {
    role: 'assistant',
    content: `Welcome back. Remember, this is still your safe space.\n\nWhat's on your mind today?`,
  };
  appendDr(opening.content, null);
  state.messages.push(opening);
  window.scrollTo({top:0,behavior:'smooth'});
  input.focus();
}

// ============================================================
//  UTILITIES
// ============================================================
function scrollDown() {
  requestAnimationFrame(() => window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}));
}
function scrollToAssessment() {
  setTimeout(()=>$('assessment-section').scrollIntoView({behavior:'smooth',block:'start'}), 300);
}
function esc(s) {
  const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML;
}
function nl2p(html) {
  return html.split(/\n\n+/).map(c=>`<p>${c.replace(/\n/g,'<br>')}</p>`).join('')||html;
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
