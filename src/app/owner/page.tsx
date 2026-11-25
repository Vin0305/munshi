"use client";
import { useEffect, useState } from "react";

type Cap = { date: string; items: { id: string; name: string; cap: number; booked: number }[] };
type Order = { id: number; phone: string; lang: string; items: { name: string; qty_kg: number }[]; total_price: number;
  delivery_date: string; area: string | null; status: string; transcript: string; reply_text: string; reply_mode: string; variant: string };

export default function Owner() {
  const [data, setData] = useState<{ orders: Order[]; capacity: Cap[]; flags: Record<string, unknown> } | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/orders").then(r => r.json()).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  if (!data) return <main className="p-6">Loading…</main>;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🪔 Munshi · Owner desk</h1>
        <div className="text-xs text-gray-500">Flags: {JSON.stringify(data.flags)}</div>
      </div>
      <section>
        <h2 className="mb-2 font-semibold">Kitchen capacity (kg booked / daily limit from Flagsmith)</h2>
        <div className="grid gap-3 md:grid-cols-5">
          {data.capacity.map(day => (
            <div key={day.date} className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-medium">{day.date}</div>
              {day.items.map(it => {
                const pct = Math.min(100, Math.round((it.booked / it.cap) * 100));
                return (
                  <div key={it.id} className="mb-2 text-xs">
                    <div className="flex justify-between"><span>{it.name}</span><span>{it.booked}/{it.cap}</span></div>
                    <div className="h-2 rounded bg-gray-200">
                      <div className={`h-2 rounded ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Latest orders</h2>
        <table className="w-full text-left text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:px-2">
          <thead><tr className="border-b"><th>#</th><th>Phone</th><th>Lang</th><th>Items</th><th>₹</th><th>Date</th><th>Area</th><th>Status</th><th>Reply</th><th>Heard</th></tr></thead>
          <tbody>
            {data.orders.map(o => (
              <tr key={o.id} className="border-b align-top">
                <td>{o.id}</td><td>{o.phone}</td><td>{o.lang}</td>
                <td>{o.items.map(i => `${i.qty_kg}kg ${i.name}`).join(", ")}</td>
                <td>{o.total_price}</td><td>{o.delivery_date}</td><td>{o.area}</td>
                <td className={o.status === "confirmed" ? "text-green-700" : "text-amber-700"}>{o.status}</td>
                <td>{o.reply_mode} ({o.variant})</td>
                <td className="max-w-xs text-gray-600">{o.transcript}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}