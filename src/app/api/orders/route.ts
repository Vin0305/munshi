import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { getFlags } from "@/lib/flags";
import { istToday, addDays } from "@/lib/munshi";


export async function GET() {
  await ensureSchema();
  const f = await getFlags("owner");
  const today = istToday().date;
  const orders = await sql`
    select id, phone, customer_name, lang, items, total_kg::float as total_kg, total_price::float as total_price,
           delivery_date::text as delivery_date, area, status, transcript, reply_text, reply_mode, variant, created_at
    from orders order by id desc limit 50`;
  const booked = await sql`
    select delivery_date::text as d, l->>'id' as id, sum((l->>'qty_kg')::numeric)::float as kg
    from orders, jsonb_array_elements(items) l
    where status = 'confirmed' and delivery_date >= ${today}::date group by 1, 2`;
  const capacity = [0, 1, 2, 3, 4].map(i => {
    const d = addDays(today, i);
    return {
      date: d,
      items: f.menu.map(m => ({
        id: m.id, name: m.name, cap: m.capacity_kg_per_day,
        booked: Number(booked.find(b => b.d === d && b.id === m.id)?.kg ?? 0),
      })),
    };
  });
  return NextResponse.json({ orders, capacity, flags: { voiceReplies: f.voiceReplies, sarvamLive: f.sarvamLive, cutoff: f.orderCutoff } });
}