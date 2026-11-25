import { chat, translate } from "./sarvam";
import type { MenuItem } from "./flags";

export function istToday() {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    weekday: now.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" }),
  };
}

export function addDays(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export type Extracted = {
  is_order: boolean;
  items: { id: string; qty_kg: number }[];
  delivery_date: string | null;
  area: string | null;
  customer_name: string | null;
  language: "te-IN" | "hi-IN" | "en-IN";
};

export async function extractOrder(model: string, transcript: string, menu: MenuItem[]): Promise<Extracted> {
  const { date, weekday } = istToday();
  const menuList = menu.map(m => `${m.id} = ${m.name}${m.te ? ` / ${m.te}` : ""}`).join("\n");
  const sys = `You are Munshi, the order clerk of a home sweet shop in Hyderabad during Diwali week.
Customers send voice notes mixing Telugu, Hindi/Dakhni and English. Extract their order.
Today is ${weekday}, ${date} (IST). Convert words like "Saturday", "repu" (tomorrow), "ellundi" (day after), "kal" to a YYYY-MM-DD date on or after today.
Menu (use ONLY these ids):
${menuList}
Quantities in kg: 1 box = 1 kg, "ara kilo" / "aadha kilo" = 0.5.
language = the customer's main language: te-IN, hi-IN or en-IN.
Reply with ONLY one JSON object and nothing else:
{"is_order":true,"items":[{"id":"kaju_katli","qty_kg":2}],"delivery_date":"YYYY-MM-DD or null","area":"locality or null","customer_name":"name or null","language":"te-IN"}`;

  const raw = await chat(model, [
    { role: "system", content: sys },
    { role: "user", content: transcript },
  ]);
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("LLM did not return JSON: " + raw.slice(0, 200));
  const j = JSON.parse(raw.slice(s, e + 1));
  const langs = ["te-IN", "hi-IN", "en-IN"];
  return {
    is_order: j.is_order !== false,
    items: Array.isArray(j.items)
      ? j.items.map((i: { id: unknown; qty_kg: unknown }) => ({ id: String(i.id), qty_kg: Number(i.qty_kg) || 0 }))
      : [],
    delivery_date:
      typeof j.delivery_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.delivery_date) ? j.delivery_date : null,
    area: j.area && j.area !== "null" ? String(j.area) : null,
    customer_name: j.customer_name && j.customer_name !== "null" ? String(j.customer_name) : null,
    language: langs.includes(j.language) ? j.language : "te-IN",
  };
}

const LANG_NAME = { "te-IN": "Telugu", "hi-IN": "Hindi", "en-IN": "English" } as const;

export async function composeReply(
  model: string,
  lang: Extracted["language"],
  facts: string,
  plainEnglish: string,
): Promise<{ text: string; by: string }> {
  const sys = `You write WhatsApp replies for "Sri Lakshmi Sweets", a home sweet shop in Hyderabad.
Write in ${LANG_NAME[lang]} script, warm and natural like a friendly shopkeeper (English sweet names are fine).
Maximum 2 short sentences, under 160 characters. Output only the reply text, no thinking.`;
  try {
    const r = (await chat(model, [
      { role: "system", content: sys },
      { role: "user", content: facts },
    ]))
      .replace(/^["']|["']$/g, "")
      .trim();
    if (r) return { text: r.slice(0, 300), by: "Sarvam-105B" };
  } catch (e) {
    console.warn("composeReply LLM failed, falling back to translate", e);
  }
  return { text: await translate(plainEnglish, lang), by: "Sarvam Translate (fallback)" };
}