// api/chat.js
// Vercel serverless function — proxies chat messages to Google Gemini.
// Requires the GEMINI_API_KEY environment variable to be set in Vercel
// (Project Settings → Environment Variables).
 
const SYSTEM_PROMPT = `You are the friendly chat assistant for KN Catering Service, a home-style biriyani catering business in Chennai.
 
Menu (priced per kg):
- Chicken Biriyani: ₹1300/kg
- Mutton Biriyani: ₹2000/kg
- Veg Biriyani: ₹900/kg
 
Ordering info:
- Minimum order is 0.5kg per item.
- Orders are dum-cooked fresh; same-day orders are prepared for next-day delivery.
- Customers place final orders via the "Send order on WhatsApp" button on the site, or by calling/WhatsApp at 86681 09314.
- You cannot take payments or confirm exact delivery slots yourself — always point customers to WhatsApp/call for final confirmation.
 
Keep answers short (2-4 sentences), warm, and helpful. If asked something unrelated to the catering business, politely redirect to how you can help with orders, menu, or pricing.`;
 
// Use the free, fast Gemini flash model to keep this cheap/token-efficient.
const GEMINI_MODEL = 'gemini-2.0-flash';
 
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
 
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    return;
  }
 
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing message' });
      return;
    }
 
    // Build Gemini "contents" from prior turns (cap history to keep requests small/cheap).
    const trimmedHistory = Array.isArray(history) ? history.slice(-10) : [];
    const contents = trimmedHistory.map((turn) => ({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(turn.text || '').slice(0, 2000) }],
    }));
    contents.push({ role: 'user', parts: [{ text: message.slice(0, 2000) }] });
 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
 
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0.6,
        },
      }),
    });
 
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      res.status(502).json({ error: 'Upstream chatbot error' });
      return;
    }
 
    const data = await geminiRes.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      "Sorry, I couldn't come up with a reply just now — please call/WhatsApp 86681 09314.";
 
    res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
 
