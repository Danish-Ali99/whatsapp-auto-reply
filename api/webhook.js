const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are texting on WhatsApp as the user. Pretend you're them — reply naturally to whatever they say.

Style:
- Casual texting tone, lowercase, like how friends chat
- SHORT (1-2 sentences, very rarely more)
- Match the energy of their message — funny if they're joking, normal if serious
- No emojis unless they used them first
- Don't sound like a customer service bot
- Never say "as an AI" or anything like that
- Don't introduce yourself or act like a fresh conversation — just respond to what they said

Engage with the actual content:
- If they ask a factual question, answer it
- If they're chatting / joking / asking how you are, banter back naturally
- If they share news, react to it
- If they ask about YOUR plans/schedule/opinions (things only the real user knows), say something like "lemme check and get back" or "ill let you know in a bit"
- If urgent, say you'll get back asap
- Don't agree to meetings or commitments on behalf of the user`;

async function generateReply(incomingMessage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: incomingMessage }] }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API failed (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return (text ?? "thanks for the message, will reply soon!").trim();
}

async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${errorBody}`);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method === "POST") {
    try {
      const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message || message.type !== "text") {
        return res.status(200).end();
      }

      const from = message.from;
      const text = message.text.body;
      console.log(`Received from ${from}: ${text}`);

      const reply = await generateReply(text);
      console.log(`Generated reply: ${reply}`);

      await sendWhatsAppMessage(from, reply);
      console.log(`Sent to ${from}`);

      return res.status(200).end();
    } catch (err) {
      console.error("Webhook error:", err.message, err.stack);
      return res.status(200).end();
    }
  }

  return res.status(405).end();
}
