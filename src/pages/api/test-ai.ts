import type { NextApiRequest, NextApiResponse } from "next";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { message, systemPrompt, model, temperature, maxTokens } = req.body;

  try {
    const completion = await groq.chat.completions.create({
      model: model ?? "llama-3.3-70b-versatile",
      max_tokens: maxTokens ?? 512,
      temperature: temperature ?? 0.7,
      messages: [
        { role: "system", content: systemPrompt ?? "You are a helpful assistant." },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? "No response.";
    res.status(200).json({ reply });
  } catch (err) {
    console.error("[test-ai]", err);
    res.status(500).json({ reply: "AI error. Check your API key." });
  }
}
