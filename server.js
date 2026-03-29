require('dotenv').config(); // load .env locally; on Render, env vars are set in the dashboard
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Render assigns a dynamic PORT

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TURN CHAT  (turns 1-5)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, turnNumber } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No conversation history provided.' });
  }

  const turnGuidance = {
    1: `This is the FIRST response. The patient has just opened up for the first time.
        - Warmly acknowledge what they shared with genuine empathy (2-3 sentences)
        - Add a brief encouraging word about their courage in speaking up
        - Ask ONE open, gentle question to invite them to go deeper about the EMOTION behind their situation`,
    2: `This is the SECOND response. You now have a little more context.
        - Reflect back what you heard in 1-2 sentences — show you truly listened
        - Include a short affirmation or encouragement (e.g., "It takes real courage to face this...")
        - Ask ONE curious, probing question about their RELATIONSHIPS or SUPPORT SYSTEM around this issue`,
    3: `This is the THIRD response. You are building trust.
        - Validate their feelings with clinical warmth (mention specific emotions you noticed)
        - Offer a brief encouraging reframe or normalising statement
        - Ask ONE question about how long they have felt this way, or what triggered these feelings`,
    4: `This is the FOURTH response. Go deeper.
        - Summarise the emotional pattern you are observing across the conversation so far (2 sentences)
        - Provide an encouragement that speaks to their inner strength
        - Ask ONE introspective question about what they wish were different, or what relief would look like`,
    5: `This is the FIFTH and FINAL questioning response before the full assessment.
        - Reflect the journey of the conversation warmly
        - Let them know you have been listening carefully and will share your full thoughts shortly
        - Ask ONE final, meaningful question: what would they most want to feel differently about in their life right now?`,
  };

  const systemPrompt = `You are Dr. Elena Hart, a compassionate and experienced psychiatrist with 20+ years of practice in cognitive behavioral therapy, emotional intelligence, and mental wellness.

You are conducting an INITIAL CONSULTATION SESSION. Your role right now is NOT to give a diagnosis — it is to LISTEN deeply, make the patient feel safe, and ask intuitive questions to help them explore their feelings.

${turnGuidance[turnNumber] || turnGuidance[5]}

CRITICAL RULES:
- Keep your response warm, personal, and conversational — NOT clinical or detached
- NEVER give more than ONE follow-up question per turn
- Do NOT rush to give advice or solutions — this is the exploration phase
- Use "I notice…", "It sounds like…", "I'm curious about…" patterns
- Keep total response length to 3-5 sentences maximum

Respond ONLY with valid JSON in this exact format:
{
  "response": "<Your warm empathetic conversational response as Dr. Hart>",
  "followUpQuestion": "<The single probing question you are asking — extracted separately>",
  "encouragement": "<A short, warm encouragement or affirmation sentence (different from the main response)>",
  "emotionDetected": "<The primary emotion you sense in the latest message>"
}`;

  try {
    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: systemPrompt,
      messages: apiMessages,
    });

    const text = result.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid JSON response');

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Could not process your message. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FINAL ASSESSMENT  (after turn 6 / after 5 exchanges + final answer)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/assess', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length < 2) {
    return res.status(400).json({ error: 'Not enough conversation history to assess.' });
  }

  const systemPrompt = `You are Dr. Elena Hart, a compassionate and experienced psychiatrist with 20+ years of practice.

You have just completed a multi-turn intake conversation with a patient. Review the ENTIRE conversation below and produce a comprehensive psychiatric assessment.

You must:
1. Analyse the emotional arc across ALL messages — not just the last one
2. Identify recurring themes, defence mechanisms, emotional patterns
3. Assess their overall mental state based on everything they shared
4. Provide a warm closing response to the full session
5. Give concrete, actionable recommendations

Respond ONLY with valid JSON in this exact format:
{
  "sentiment": "positive" | "negative" | "neutral" | "mixed",
  "sentimentScore": <number -100 to 100>,
  "primaryEmotion": "<dominant emotion across the session>",
  "secondaryEmotions": ["<emotion1>", "<emotion2>", "<emotion3>"],
  "emotionalIntensity": <0 to 100>,
  "concernLevel": "low" | "moderate" | "high" | "critical",
  "emotionalArc": "<1-2 sentences describing how the patient's emotional state evolved over the conversation>",
  "themes": ["<recurring theme 1>", "<recurring theme 2>", "<recurring theme 3>"],
  "keyInsights": "<2-3 sentence clinical observation synthesising all the patient shared>",
  "psychiatristResponse": "<Your warm, personal closing response to the FULL session — acknowledge the courage it took, summarise what you noticed, and offer hope. 3-5 paragraphs.>",
  "copingStrategies": ["<specific strategy 1 tailored to their situation>", "<specific strategy 2>", "<specific strategy 3>", "<specific strategy 4>"],
  "affirmation": "<A deeply personal affirmation crafted SPECIFICALLY for this person based on the session>",
  "nextSteps": ["<concrete next step 1>", "<concrete next step 2>", "<concrete next step 3>"]
}`;

  try {
    const apiMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: apiMessages,
    });

    const text = result.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid JSON response');

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    console.error('Assessment error:', err);
    res.status(500).json({ error: 'Could not complete assessment. Please try again.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🧠 MindSpace server running at http://localhost:${PORT}\n`);
});
