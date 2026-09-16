// api/chat.js
// Vercel serverless function — proxies chat messages to Google Gemini.
// Requires the GEMINI_API_KEY environment variable to be set in Vercel
// (Project Settings → Environment Variables).

const SYSTEM_PROMPT = `You are the friendly chat assistant for KN Catering Service, a home-style biriyani catering business in Chennai.

Official menu (priced per kg):
- Chicken Biriyani: ₹1300/kg
- Mutton Biriyani: ₹2000/kg
- Veg Biriyani: ₹900/kg

Portion guide (use this for quantity calculations — always show the math):
- 1 kg of biriyani serves 5 people.
- To calculate kg needed for N people: kg = N / 5.
- Example: for 150 people → 150 / 5 = 30 kg.
- If the customer is ordering more than one biriyani type for the same event, ask how many people per type, or split the total evenly if they don't specify.

Ordering info:
- Minimum order is 0.5kg per item.
- Orders are dum-cooked fresh; same-day orders are prepared for next-day delivery.
- Customers place final orders via the "Send order on WhatsApp" button on the site, or by calling/WhatsApp at 86681 09314.
- You cannot take payments or confirm exact delivery slots yourself — always point customers to WhatsApp/call for final confirmation.

You can freely and helpfully answer ANY catering- or food-related question, even if it's not directly about the fixed menu above — for example:
- Custom requests (extra spicy, less oil, egg biriyani, jeera rice, side dishes, sweets, bulk event catering, etc.) — use your general food/catering knowledge to give a helpful, realistic answer, and mention that final availability/pricing for custom items needs to be confirmed on WhatsApp/call.
- Spice level, ingredients, allergens, portion sizing (how much biriyani per person, etc.), how many kg to order for a given number of guests, storage/reheating tips, common combos.
- General questions about biriyani styles, ingredients, or catering logistics.

Keep answers short (2-5 sentences), warm, and practical. Only redirect to WhatsApp/call when the question needs a final confirmed price, availability check, or an actual order — for open-ended food/catering questions, just answer helpfully yourself first.

When a customer asks how much to order for a number of guests, always show the kg calculation (N / 5) AND the estimated total price using the menu rate for the biriyani type they mentioned (or ask which type if not mentioned).`;

// Use the free, fast Gemini flash-lite model to keep this cheap/token-efficient.
const GEMINI_MODEL = 'gemini-3.5-flash-lite';

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
