import postgres from "postgres";

const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
export const sql = g.__sql ?? postgres(process.env.DATABASE_URL!, { ssl: "require", max: 5 });
g.__sql = sql;

let ready: Promise<void> | null = null;
export function ensureSchema() {
  ready ??= (async () => {
    await sql`create table if not exists orders (
      id serial primary key,
      phone text not null,
      customer_name text,
      lang text,
      items jsonb not null default '[]',
      total_kg numeric not null default 0,
      total_price numeric not null default 0,
      delivery_date date,
      area text,
      status text not null,
      transcript text,
      reply_text text,
      reply_mode text,
      variant text,
      created_at timestamptz default now()
    )`;
  })();
  return ready;
}

export async function bookedKg(itemId: string, date: string): Promise<number> {
  const rows = await sql`
    select coalesce(sum((l->>'qty_kg')::numeric), 0)::float as kg
    from orders, jsonb_array_elements(items) l
    where status = 'confirmed' and delivery_date = ${date}::date and l->>'id' = ${itemId}`;
  return Number(rows[0]?.kg ?? 0);
}