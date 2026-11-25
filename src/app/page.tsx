"use client";
import { useRef, useState } from "react";

type Msg = { from: "customer" | "munshi"; text: string; meta?: string };

export default function Home() {
  const [phone, setPhone] = useState("9876543210");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typed, setTyped] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function send(fd: FormData) {
    setBusy(true);
    try {
      const r = await fetch("/api/voice-order", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed");
      setMsgs(m => [
        ...m,
        { from: "customer", text: j.transcript, meta: `heard by: ${j.heard_by}` },
        { from: "munshi", text: j.reply, meta: `${j.status} · reply ${j.mode} · A/B variant ${j.variant} · by ${j.reply_by} · ${j.ms} ms` },
      ]);
      if (j.audio) new Audio(`data:audio/wav;base64,${j.audio}`).play().catch(() => {});
    } catch (e) {
      setMsgs(m => [...m, { from: "munshi", text: "⚠️ " + (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  async function startRec() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunks.current = [];
    rec.ondataavailable = e => chunks.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const fd = new FormData();
      fd.append("phone", phone);
      fd.append("audio", new Blob(chunks.current, { type: "audio/webm" }), "note.webm");
      send(fd);
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
    timer.current = setTimeout(stopRec, 25000); // Sarvam REST limit is 30 s
  }
  function stopRec() {
    if (timer.current) clearTimeout(timer.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
    setRecording(false);
  }
  function sendText() {
    if (!typed.trim()) return;
    const fd = new FormData();
    fd.append("phone", phone);
    fd.append("text", typed);
    setTyped("");
    send(fd);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-[#efeae2]">
      <header className="flex items-center gap-3 bg-[#075e54] p-3 text-white">
        <div className="text-2xl">🪔</div>
        <div className="flex-1">
          <div className="font-semibold">Sri Lakshmi Sweets · Munshi</div>
          <div className="text-xs opacity-80">Send a voice note in Telugu, Hindi or English</div>
        </div>
        <a href="/owner" className="rounded bg-white/20 px-2 py-1 text-xs">Owner →</a>
      </header>
      <div className="flex items-center gap-2 bg-white/70 px-3 py-2 text-xs">
        Customer phone:
        <input value={phone} onChange={e => setPhone(e.target.value)} className="flex-1 rounded border px-2 py-1" />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-lg p-2 text-sm shadow ${m.from === "customer" ? "ml-auto bg-[#dcf8c6]" : "bg-white"}`}>
            <div>{m.text}</div>
            {m.meta && <div className="mt-1 text-[10px] text-gray-500">{m.meta}</div>}
          </div>
        ))}
        {busy && <div className="text-xs text-gray-500">Munshi is writing…</div>}
      </div>
      <div className="flex gap-2 bg-[#f0f0f0] p-2">
        <input value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => e.key === "Enter" && sendText()}
          placeholder="or type: rendu kilo kaju katli Saturday ki…" className="flex-1 rounded-full border px-3 py-2 text-sm" />
        {typed ? (
          <button onClick={sendText} disabled={busy} className="rounded-full bg-[#075e54] px-4 text-white">➤</button>
        ) : (
          <button onClick={recording ? stopRec : startRec} disabled={busy}
            className={`rounded-full px-4 text-white ${recording ? "animate-pulse bg-red-600" : "bg-[#075e54]"}`}>
            {recording ? "■ Stop" : "🎤"}
          </button>
        )}
      </div>
    </main>
  );
}