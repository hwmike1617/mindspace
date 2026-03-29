/* ============================================================
   MindSpace App — Multi-Turn Session Logic
   ============================================================ */

// ── State ──────────────────────────────────────────────────────
const MAX_TURNS = 5;  // 5 exchanges before final assessment

const state = {
  turn: 0,            // current turn (0 = not started, 1-5 = chatting, 6 = assessed)
  messages: [],       // full conversation history [{role, content}]
  isLoading: false,
};

// Encouragement messages shown between turns
const encouragements = [
  "You're doing great — every word you share helps me understand you better. 💛",
  "Thank you for opening up. The more you share, the clearer the picture becomes. 🌿",
  "I can feel your honesty. That courage to express yourself is a true strength. ✨",
  "You're almost there. One more reflection, and I'll have what I need to help you fully. 🌸",
  "This is a brave thing you're doing. Let's go deeper together. 💜",
];

// ── DOM shortcuts ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Auto-grow textarea ─────────────────────────────────────────
const chatInput = $('chat-input');
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
});
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ============================================================
//  BEGIN SESSION
// ============================================================
function beginSession() {
  $('welcome-screen').classList.add('hidden');
  $('chat-screen').classList.remove('hidden');

  // Dr. Hart's opening message
  const opening = {
    role: 'assistant',
    content: `Thank you for being here. I want you to know that this is a completely safe and judgement-free space — whatever you're carrying right now, you don't have to carry it alone.

To start, I'd love to simply hear from you: What's been weighing on your heart lately?`,
  };

  addDrMessage(opening.content, null, null);
  state.messages.push(opening);
  updateProgress(1);
  updateTurnHint(1);
  chatInput.focus();
}

// ============================================================
//  SEND USER MESSAGE
// ============================================================
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || state.isLoading) return;

  // Add user message to UI and history
  addUserMessage(text);
  state.messages.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.style.height = 'auto';

  state.turn++;
  state.isLoading = true;
  $('send-btn').disabled = true;

  // Show encouragement banner between turns (after turn 1+)
  if (state.turn > 1 && state.turn <= MAX_TURNS) {
    showEncouragement(encouragements[state.turn - 2]);
  }

  showTyping();
  scrollToBottom();

  if (state.turn <= MAX_TURNS) {
    // ── Dialogue turn (1–5) ──
    await doConversationTurn(state.turn);
  } else {
    // ── Final assessment (turn 6) ──
    await doFinalAssessment();
  }

  state.isLoading = false;
  $('send-btn').disabled = false;
}

// ── Conversation turn (Dr. asks follow-up) ───────────────────
async function doConversationTurn(turnNumber) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages, turnNumber }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    hideTyping();

    // Push Dr. Hart's response to history
    state.messages.push({ role: 'assistant', content: data.response });

    // Display
    addDrMessage(data.response, data.emotionDetected, data.encouragement);

    // Update progress
    updateProgress(turnNumber + 1);
    updateTurnHint(turnNumber);
    scrollToBottom();

  } catch (err) {
    hideTyping();
    addErrorBubble(err.message || 'I\'m having a moment of difficulty. Please try again.');
  }
}

// ── Final assessment ─────────────────────────────────────────
async function doFinalAssessment() {
  // Update progress to assessment step
  updateProgress(6);
  updateTurnHint(6);

  // Show transition message in chat
  addAssessmentTransitionMsg();
  scrollToBottom();

  try {
    const res = await fetch('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    hideTyping();

    // Short delay for drama, then reveal assessment
    await sleep(1200);
    renderAssessment(data);

  } catch (err) {
    hideTyping();
    addErrorBubble(err.message || 'Assessment failed. Please try again.');
  }
}

// ============================================================
//  RENDER CHAT MESSAGES
// ============================================================
function addDrMessage(text, emotionDetected, encouragement) {
  const wrap = $('chat-messages');

  const msg = document.createElement('div');
  msg.className = 'msg dr';
  msg.innerHTML = `
    <div class="dr-avatar" aria-hidden="true">🧠</div>
    <div class="msg-body">
      <div class="msg-name">Dr. Elena Hart</div>
      <div class="bubble dr-bubble">${nl2p(escHtml(text))}</div>
      ${emotionDetected ? `<div class="emotion-tag">🎯 ${escHtml(emotionDetected)}</div>` : ''}
    </div>`;
  wrap.appendChild(msg);
}

function addUserMessage(text) {
  const wrap = $('chat-messages');
  const msg = document.createElement('div');
  msg.className = 'msg user';
  msg.innerHTML = `
    <div class="user-icon" aria-hidden="true">🙋</div>
    <div class="msg-body">
      <div class="msg-name" style="text-align:right">You</div>
      <div class="bubble user-bubble">${nl2p(escHtml(text))}</div>
    </div>`;
  wrap.appendChild(msg);
}

function addAssessmentTransitionMsg() {
  hideTyping();
  const wrap = $('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg dr';
  div.innerHTML = `
    <div class="dr-avatar" aria-hidden="true">🧠</div>
    <div class="msg-body" style="max-width:100%">
      <div class="msg-name">Dr. Elena Hart</div>
      <div class="assessment-msg-bubble">
        Thank you so deeply for everything you've shared with me today.
        I've been listening carefully to every word, every feeling, every layer of what you've expressed.
        Give me just a moment to reflect… and I'll share my full assessment with you.
      </div>
    </div>`;
  wrap.appendChild(div);
}

function addErrorBubble(msg) {
  const wrap = $('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg dr';
  div.innerHTML = `
    <div class="dr-avatar" style="background:var(--rose)" aria-hidden="true">⚠️</div>
    <div class="msg-body">
      <div class="bubble dr-bubble" style="color:var(--rose)">${escHtml(msg)}</div>
    </div>`;
  wrap.appendChild(div);
}

function showEncouragement(text) {
  const banner = $('encouragement-banner');
  $('encouragement-text').textContent = text;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 5000);
}

// ============================================================
//  PROGRESS & HINTS
// ============================================================
function updateProgress(activeStep) {
  for (let i = 1; i <= 6; i++) {
    const el = $(`step-${i}`);
    el.classList.remove('active', 'done');
    if (i < activeStep) el.classList.add('done');
    else if (i === activeStep) el.classList.add('active');
  }
}

function updateTurnHint(turnNumber) {
  const hint = $('turn-hint');
  if (turnNumber >= MAX_TURNS) {
    hint.textContent = 'After this response, Dr. Hart will share her full assessment ✦';
    hint.style.color = 'var(--amber)';
  } else {
    hint.textContent = `Turn ${turnNumber} of ${MAX_TURNS} — Feel free to share as much or as little as you'd like`;
    hint.style.color = '';
  }
}

// ============================================================
//  TYPING INDICATOR
// ============================================================
function showTyping() {
  const t = $('typing-indicator');
  t.classList.remove('hidden');
  scrollToBottom();
}
function hideTyping() {
  $('typing-indicator').classList.add('hidden');
}

// ============================================================
//  RENDER ASSESSMENT
// ============================================================
function renderAssessment(data) {
  // Switch screens
  $('chat-screen').classList.add('hidden');
  $('assessment-screen').classList.remove('hidden');

  // Mark assessment step done
  updateProgress(6);
  const step6 = $('step-6');
  step6.classList.remove('active');
  step6.classList.add('done');

  renderSentiment(data.sentiment, data.sentimentScore);
  renderIntensity(data.emotionalIntensity);
  renderConcernLevel(data.concernLevel);
  renderEmotions(data.primaryEmotion, data.secondaryEmotions);
  renderThemes(data.themes);
  renderArc(data.emotionalArc);
  renderInsight(data.keyInsights);
  renderResponse(data.psychiatristResponse);
  renderCoping(data.copingStrategies);
  renderNextSteps(data.nextSteps);
  renderAffirmation(data.affirmation);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Sentiment ────────────────────────────────────────────────
function renderSentiment(sentiment, score) {
  const map = {
    positive: { icon:'😊', label:'Positive', grad:'linear-gradient(90deg,#56e39f,#4ecdc4)' },
    negative: { icon:'😔', label:'Negative',  grad:'linear-gradient(90deg,#ff6b8a,#c94b4b)' },
    neutral:  { icon:'😐', label:'Neutral',  grad:'linear-gradient(90deg,#a0aec0,#718096)' },
    mixed:    { icon:'🌊', label:'Mixed',    grad:'linear-gradient(90deg,#7c6cf0,#ff6b8a)' },
  };
  const s = (sentiment||'neutral').toLowerCase();
  const m = map[s] || map.neutral;
  $('sentiment-icon').textContent  = m.icon;
  $('sentiment-label').textContent = m.label;
  const pct = ((Number(score) + 100) / 200) * 100;
  const bar = $('sentiment-bar');
  bar.style.width      = pct + '%';
  bar.style.background = m.grad;
}

// ── Intensity ring ───────────────────────────────────────────
function renderIntensity(intensity) {
  const val = Math.min(100, Math.max(0, Number(intensity) || 0));
  $('intensity-value').textContent = val;
  setTimeout(() => {
    $('intensity-ring-fill').style.strokeDashoffset = 314 - (val / 100) * 314;
  }, 200);
  const lbl = val >= 80 ? 'Very High' : val >= 60 ? 'High' : val >= 40 ? 'Moderate' : val >= 20 ? 'Low' : 'Very Low';
  $('intensity-label').textContent = lbl;
}

// ── Concern level ────────────────────────────────────────────
function renderConcernLevel(level) {
  const map = { low:'🟢', moderate:'🟡', high:'🟠', critical:'🔴' };
  const colors = { low:'var(--green)', moderate:'var(--amber)', high:'var(--rose)', critical:'#ff3860' };
  const levels = ['low','moderate','high','critical'];
  const l = (level||'low').toLowerCase();
  $('concern-icon').textContent = map[l] || '🟢';
  $('concern-label').textContent = l.charAt(0).toUpperCase() + l.slice(1);
  $('concern-label').style.color = colors[l] || colors.low;
  const idx = levels.indexOf(l);
  document.querySelectorAll('.concern-bar-item').forEach((el, i) => {
    el.classList.toggle('active', i <= idx);
  });
}

// ── Emotions ─────────────────────────────────────────────────
function renderEmotions(primary, secondary) {
  $('primary-emotion-badge').textContent = primary || 'Neutral';
  const c = $('secondary-emotions');
  c.innerHTML = '';
  (secondary || []).forEach(e => {
    const tag = document.createElement('span');
    tag.className = 'sec-emotion-tag';
    tag.textContent = e;
    c.appendChild(tag);
  });
}

// ── Themes ───────────────────────────────────────────────────
function renderThemes(themes) {
  const list = $('themes-list');
  list.innerHTML = '';
  (themes || []).forEach(t => {
    const item = document.createElement('div');
    item.className = 'theme-item';
    item.innerHTML = `<div class="theme-dot"></div><span>${escHtml(t)}</span>`;
    list.appendChild(item);
  });
}

// ── Emotional Arc ─────────────────────────────────────────────
function renderArc(text) {
  $('emotional-arc').textContent = text || '';
}

// ── Clinical Insight ─────────────────────────────────────────
function renderInsight(text) {
  $('key-insights').textContent = text || '';
}

// ── Closing Response ──────────────────────────────────────────
function renderResponse(text) {
  const el = $('psychiatrist-response');
  el.innerHTML = '';
  (text || '').split(/\n+/).filter(p => p.trim()).forEach((para, i) => {
    const p = document.createElement('p');
    p.textContent = para.trim();
    p.style.opacity = '0';
    p.style.transform = 'translateY(10px)';
    p.style.transition = `opacity .5s ease ${i * 0.18}s, transform .5s ease ${i * 0.18}s`;
    el.appendChild(p);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      p.style.opacity = '1';
      p.style.transform = 'translateY(0)';
    }));
  });
}

// ── Coping Strategies ─────────────────────────────────────────
function renderCoping(strategies) {
  const list = $('coping-list');
  list.innerHTML = '';
  (strategies || []).forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'coping-item';
    li.innerHTML = `<div class="coping-num">${i + 1}</div><span>${escHtml(s)}</span>`;
    list.appendChild(li);
  });
}

// ── Next Steps ────────────────────────────────────────────────
function renderNextSteps(steps) {
  const container = $('next-steps');
  container.innerHTML = '';
  (steps || []).forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'nextstep-item';
    div.innerHTML = `<div class="nextstep-num">${i + 1}</div><span>${escHtml(s)}</span>`;
    container.appendChild(div);
  });
}

// ── Affirmation ───────────────────────────────────────────────
function renderAffirmation(text) {
  $('affirmation-text').textContent = text || '';
}

// ============================================================
//  RESET
// ============================================================
function resetSession() {
  state.turn = 0;
  state.messages = [];
  state.isLoading = false;

  $('chat-messages').innerHTML = '';
  $('encouragement-banner').classList.add('hidden');
  $('typing-indicator').classList.add('hidden');
  $('assessment-screen').classList.add('hidden');
  $('chat-screen').classList.add('hidden');
  $('welcome-screen').classList.remove('hidden');

  for (let i = 1; i <= 6; i++) {
    const el = $(`step-${i}`);
    el.classList.remove('active', 'done');
  }
  updateTurnHint(1);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
//  UTILITIES
// ============================================================
function scrollToBottom() {
  const msgs = $('chat-messages');
  setTimeout(() => msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' }), 80);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function nl2p(html) {
  // Convert newlines to paragraph breaks — html is already escaped
  return html.split(/\n\n+/).map(chunk =>
    `<p style="margin-bottom:10px;line-height:1.75">${chunk.replace(/\n/g, '<br/>')}</p>`
  ).join('') || html;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
