const BASE = "https://api.sarvam.ai";

function key() {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error("SARVAM_API_KEY missing in .env.local");
  return k;
}

export async function transcribe(audio: Blob): Promise<{ transcript: string; language: string | null }> {
  const form = new FormData();
  form.append("file", audio, "note.webm");
  form.append("model", "saaras:v3");
  form.append("mode", "codemix");
  const r = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": key() },
    body: form,
  });
  if (!r.ok) throw new Error(`Sarvam STT ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { transcript: j.transcript ?? "", language: j.language_code ?? null };
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export async function chat(model: string, messages: ChatMsg[]): Promise<string> {
  const call = async (withEffort: boolean) =>
    fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "api-subscription-key": key(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 4096,
        ...(withEffort ? { reasoning_effort: "low" } : {}),
      }),
    });

  let r = await call(true);
  if (r.status === 400 || r.status === 422) r = await call(false); // model doesn't accept reasoning_effort
  if (!r.ok) throw new Error(`Sarvam LLM ${r.status}: ${await r.text()}`);

  const j = await r.json();
  const msg = j.choices?.[0]?.message ?? {};
  const raw: string = msg.content ?? "";
  const text = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
  if (!text) {
    console.warn("EMPTY LLM CONTENT. finish_reason:", j.choices?.[0]?.finish_reason,
      "| usage:", JSON.stringify(j.usage), "| keys:", Object.keys(msg).join(","));
  }
  return text;
}

export async function translate(input: string, target: string): Promise<string> {
  if (target === "en-IN") return input;
  const r = await fetch(`${BASE}/translate`, {
    method: "POST",
    headers: { "api-subscription-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({ input, source_language_code: "en-IN", target_language_code: target }),
  });
  if (!r.ok) throw new Error(`Sarvam Translate ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.translated_text ?? input;
}

const ttsCache = new Map<string, string>(); // never pay twice for the same sentence

export async function speak(text: string, lang: string): Promise<string | null> {
  const k = `${lang}|${text}`;
  if (ttsCache.has(k)) return ttsCache.get(k)!;
  const r = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({ text, target_language_code: lang, model: "bulbul:v3" }),
  });
  if (!r.ok) throw new Error(`Sarvam TTS ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const audio: string | null = j.audios?.[0] ?? null;
  if (audio) ttsCache.set(k, audio);
  return audio;
}