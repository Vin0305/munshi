import { NextResponse } from "next/server";
import { ensureSchema, sql, bookedKg } from "@/lib/db";
import { getFlags } from "@/lib/flags";
import { transcribe, speak } from "@/lib/sarvam";
import { extractOrder, composeReply, istToday, addDays } from "@/lib/munshi";

const MOCK_TRANSCRIPT =
  "Anna, rendu kilo kaju katli kavali, Saturday ki Kukatpally ki deliver cheyandi. Aur ek kilo motichoor laddu bhi.";

type Line = { id: string; name: string; qty_kg: number; price: number };
type Short = { name: string; asked: number; left: number; next: string | null };

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    await ensureSchema();
    const form = await req.formData();
    const phone = String(form.get("phone") || "").replace(/\D/g, "") || "9999999999";
    const typed = String(form.get("text") || "").trim();
    const audio = form.get("audio");

    const base = await getFlags(phone);

    // 1. HEAR (Sarvam Saaras, code-mixed)
    let transcript = typed;
    let heardBy = "typed";
    if (!transcript && audio instanceof Blob) {
      if (base.sarvamLive) {
        const buf = await audio.arrayBuffer();
        transcript = (await transcribe(new Blob([buf], { type: "audio/webm" }))).transcript;
        heardBy = "Sarvam Saaras (codemix)";
      } else {
        transcript = MOCK_TRANSCRIPT;
        heardBy = "mock: sarvam_live is OFF";
      }
    }
    if (!transcript) {
      return NextResponse.json({ error: "Send a voice note or type a message" }, { status: 400 });
    }

    // 2. UNDERSTAND (Sarvam-105B -> structured order)
    const order = await extractOrder(base.llmModel, transcript, base.menu);
    const lang = order.language;
    const today = istToday().date;
    const date = order.delivery_date && order.delivery_date >= today ? order.delivery_date : addDays(today, 1);

    // 3. CHECK KITCHEN CAPACITY (limits live in Flagsmith remote config)
    const lines: Line[] = [];
    const short: Short[] = [];
    let totalKg = 0;
    let totalPrice = 0;
    for (const it of order.items) {
      const m = base.menu.find(x => x.id === it.id);
      if (!m || it.qty_kg <= 0) continue;
      const left = Math.max(0, m.capacity_kg_per_day - (await bookedKg(m.id, date)));
      lines.push({ id: m.id, name: m.name, qty_kg: it.qty_kg, price: it.qty_kg * m.price_per_kg });
      totalKg += it.qty_kg;
      totalPrice += it.qty_kg * m.price_per_kg;
      if (it.qty_kg > left) {
        let next: string | null = null;
        for (let i = 1; i <= 3; i++) {
          const d = addDays(date, i);
          if ((await bookedKg(m.id, d)) + it.qty_kg <= m.capacity_kg_per_day) {
            next = d;
            break;
          }
        }
        short.push({ name: m.name, asked: it.qty_kg, left, next });
      }
    }
    const pastCutoff = !!base.orderCutoff && date > base.orderCutoff;
    const status =
      !order.is_order || lines.length === 0
        ? "not_understood"
        : pastCutoff
        ? "after_cutoff"
        : short.length
        ? "over_capacity"
        : "confirmed";

    // 4. HOW TO REPLY (Flagsmith: segment override + A/B variant + kill switch)
    const f = await getFlags(phone, { order_kg: totalKg, lang });
    const mode = f.voiceReplies && f.replyMode === "voice" && f.sarvamLive ? "voice" : "text";

    // 5. REPLY in the customer's language (+ Bulbul voice)
    const facts =
      status === "confirmed"
        ? `Order CONFIRMED: ${lines.map(l => `${l.qty_kg} kg ${l.name}`).join(", ")}. Total Rs ${totalPrice}. Delivery ${date}${order.area ? ` to ${order.area}` : ""}. Thank them, wish Happy Diwali.`
        : status === "over_capacity"
        ? `Cannot fully confirm. ${short.map(s => `${s.name}: only ${s.left} kg left for ${date}${s.next ? `, available on ${s.next}` : ""}`).join("; ")}. Politely offer the other date or a smaller quantity.`
        : status === "after_cutoff"
        ? `Sorry, Diwali orders closed after ${base.orderCutoff}. Apologise warmly.`
        : `Could not understand the order. Ask them to repeat item and quantity. Menu: ${base.menu.map(m => m.name).join(", ")}.`;

    const plainEnglish =
      status === "confirmed"
        ? `Thank you! ${lines.map(l => `${l.qty_kg} kg ${l.name}`).join(" and ")} confirmed for ${date}. Total Rs ${totalPrice}. Happy Diwali!`
        : status === "over_capacity"
        ? `Sorry, ${short.map(s => `${s.name} has only ${s.left} kg left on ${date}${s.next ? ` but is available on ${s.next}` : ""}`).join("; ")}. Shall I book that?`
        : status === "after_cutoff"
        ? `Sorry, our Diwali orders are closed. Thank you for thinking of us!`
        : `Sorry, I did not catch that. Please tell me the sweet and how many kilos.`;

    const replyOut = await composeReply(base.llmModel, lang, facts, plainEnglish);
    const reply = replyOut.text;
    const audioOut = mode === "voice" ? await speak(reply, lang) : null;

    // 6. SAVE
    const [row] = await sql`
      insert into orders (phone, customer_name, lang, items, total_kg, total_price, delivery_date, area, status, transcript, reply_text, reply_mode, variant)
      values (${phone}, ${order.customer_name}, ${lang}, ${sql.json(JSON.parse(JSON.stringify(lines)))}, ${totalKg}, ${totalPrice},
              ${date}::date, ${order.area}, ${status}, ${transcript}, ${reply}, ${mode}, ${f.replyMode})
      returning id`;

    return NextResponse.json({
      id: row.id,
      transcript,
      heard_by: heardBy,
      status,
      short,
      reply,
      reply_by: replyOut.by,
      mode,
      variant: f.replyMode,
      order: { ...order, delivery_date: date, lines, totalKg, totalPrice },
      audio: audioOut,
      ms: Date.now() - t0,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}