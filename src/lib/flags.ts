import * as FS from "flagsmith-nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ctor: any = (FS as any).default?.default ?? (FS as any).default ?? (FS as any).Flagsmith;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
const flagsmith = g.__flagsmith ?? new Ctor({ environmentKey: process.env.FLAGSMITH_SERVER_KEY! });
g.__flagsmith = flagsmith;

export type MenuItem = {
  id: string; name: string; te?: string;
  price_per_kg: number; capacity_kg_per_day: number; enabled: boolean;
};

export async function getFlags(phone: string, traits: Record<string, string | number | boolean> = {}) {
  const f = await flagsmith.getIdentityFlags(`cust_${phone}`, traits);
  let menu: MenuItem[] = [];
  try {
    const raw = f.getFeatureValue("menu");
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    menu = (obj?.items ?? []).filter((m: MenuItem) => m.enabled);
  } catch { /* bad JSON in Flagsmith -> empty menu */ }
  return {
    sarvamLive: Boolean(f.isFeatureEnabled("sarvam_live")),
    voiceReplies: Boolean(f.isFeatureEnabled("voice_replies")),
    replyMode: String(f.getFeatureValue("reply_mode") ?? "text"),
    menu,
    orderCutoff: String(f.getFeatureValue("order_cutoff") ?? ""),
    llmModel: String(f.getFeatureValue("llm_model") ?? "sarvam-105b"),
  };
}