"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

const OPEN_TIME = "18:30";
const CLOSE_TIME = "22:00";
const SLOT_MINUTES = 15;

type SettingsRow = {
  user_id: string;
  max_per_slot: number;
  open_time: string;
  close_time: string;
  slot_minutes: number;
};

type OrderRow = {
  id: string;
  user_id: string;
  day: string;       // YYYY-MM-DD
  slot_time: string; // "HH:MM:SS"
  qty: number;
  note: string | null;
  created_at: string;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function hhmmFromTime(t: string) {
  // "18:30:00" -> "18:30"
  return t.slice(0, 5);
}

function generateSlotsHHMM() {
  const slots: string[] = [];
  let [h, m] = OPEN_TIME.split(":").map(Number);
  const [endH, endM] = CLOSE_TIME.split(":").map(Number);

  while (h < endH || (h === endH && m < endM)) {
    slots.push(`${pad2(h)}:${pad2(m)}`);
    m += SLOT_MINUTES;
    if (m >= 60) {
      h += 1;
      m -= 60;
    }
  }
  return slots;
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [maxPerSlot, setMaxPerSlot] = useState<number>(10);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const slots = useMemo(() => generateSlotsHHMM(), []);
  const day = useMemo(() => todayYYYYMMDD(), []);

  // ----- AUTH -----
  useEffect(() => {
    supabase.auth.getUser().then((res) => setUser(res.data.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // ----- LOAD DATA -----
  useEffect(() => {
    if (!user) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadAll() {
    if (!user) return;
    setLoading(true);

    // 1) SETTINGS
    const s = await supabase
      .from("settings")
      .select("user_id,max_per_slot,open_time,close_time,slot_minutes")
      .eq("user_id", user.id)
      .maybeSingle();

    if (s.data) {
      const row = s.data as SettingsRow;
      setMaxPerSlot(row.max_per_slot);
    } else {
      // Se non esiste, la creiamo (UP SERT con onConflict user_id)
      await supabase.from("settings").upsert(
        {
          user_id: user.id,
          max_per_slot: maxPerSlot,
          open_time: OPEN_TIME,
          close_time: CLOSE_TIME,
          slot_minutes: SLOT_MINUTES
        },
        { onConflict: "user_id" }
      );
    }

    // 2) ORDERS DI OGGI
    const o = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("day", day)
      .order("created_at", { ascending: true });

    setOrders((o.data as OrderRow[]) ?? []);
    setLoading(false);
  }

  // ----- HELPERS -----
  function usedFor(slotHHMM: string) {
    return orders
      .filter((o) => hhmmFromTime(o.slot_time) === slotHHMM)
      .reduce((sum, o) => sum + o.qty, 0);
  }

  // ----- ACTIONS -----
  async function doLogin() {
    setLoading(true);
    const res = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (res.error) alert(res.error.message);
  }

  async function doLogout() {
    await supabase.auth.signOut();
  }

  async function saveMax() {
    if (!user) return;
    setLoading(true);

    const res = await supabase.from("settings").upsert(
      {
        user_id: user.id,
        max_per_slot: maxPerSlot,
        open_time: OPEN_TIME,
        close_time: CLOSE_TIME,
        slot_minutes: SLOT_MINUTES
      },
      { onConflict: "user_id" }
    );

    setLoading(false);

    if (res.error) {
      alert("Errore salvataggio max: " + res.error.message);
      return;
    }

    alert("Max salvato ✅");
    // ricarico da DB (così sei sicura che resta)
    await loadAll();
  }

  async function add(slotHHMM: string, qty: number) {
    if (!user) return;

    // Controllo capienza prima di inserire
    const used = usedFor(slotHHMM);
    if (used + qty > maxPerSlot) {
      alert("SLOT PIENO ❌");
      return;
    }

    setLoading(true);

    const res = await supabase.from("orders").insert({
      user_id: user.id,
      day,
      slot_time: `${slotHHMM}:00`,
      qty,
      note: null
    });

    setLoading(false);

    if (res.error) {
      alert("Errore inserimento ordine: " + res.error.message);
      return;
    }

    await loadAll();
  }

  async function removeOne(slotHHMM: string) {
    if (!user) return;

    const same = orders.filter((o) => hhmmFromTime(o.slot_time) === slotHHMM);
    if (same.length === 0) return;

    const last = same[same.length - 1];

    setLoading(true);
    const res = await supabase.from("orders").delete().eq("id", last.id);
    setLoading(false);

    if (res.error) {
      alert("Errore rimozione: " + res.error.message);
      return;
    }

    await loadAll();
  }

  async function resetToday() {
    if (!user) return;
    if (!confirm("Sicuro di azzerare tutti gli ordini di oggi?")) return;

    setLoading(true);
    const res = await supabase
      .from("orders")
      .delete()
      .eq("user_id", user.id)
      .eq("day", day);
    setLoading(false);

    if (res.error) {
      alert("Errore reset: " + res.error.message);
      return;
    }

    await loadAll();
  }

  // ----- UI -----
  if (!user) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto", padding: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Pizzeria - Slot</h1>
        <p style={{ color: "#555", marginTop: 6 }}>
          Login con l’utente creato su Supabase.
        </p>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10, border: "1px solid #ccc", borderRadius: 10 }}
          />
          <button
            onClick={doLogin}
            disabled={loading || !email || !password}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "black",
              color: "white",
              fontWeight: 800,
              cursor: "pointer"
            }}
          >
            {loading ? "..." : "LOGIN"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Disponibilità (oggi)</h1>
          <div style={{ color: "#555", marginTop: 4 }}>
            {OPEN_TIME}–{CLOSE_TIME} • slot 15 min • {day}
          </div>
        </div>

        <button
          onClick={doLogout}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
            height: 42
          }}
        >
          Logout
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          border: "1px solid #eee",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap"
        }}
      >
        <div style={{ fontWeight: 800 }}>Max pizze/slot:</div>
        <input
          type="number"
          value={maxPerSlot}
          onChange={(e) => setMaxPerSlot(Number(e.target.value))}
          style={{
            width: 90,
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 10
          }}
        />
        <button
          onClick={saveMax}
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: "#16a34a",
            color: "white",
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          Salva
        </button>

        <button
          onClick={resetToday}
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer"
          }}
        >
          Reset oggi
        </button>

        {loading && <span style={{ color: "#555" }}>aggiorno…</span>}
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
        {slots.map((slot) => {
          const used = usedFor(slot);
          const left = Math.max(0, maxPerSlot - used);
          const bg = left === 0 ? "#fecaca" : left <= 2 ? "#fde68a" : "#bbf7d0";

          return (
            <div
              key={slot}
              style={{
                background: bg,
                padding: 12,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10
              }}
            >
              <div style={{ display: "grid" }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{slot}</div>
                <div>
                  Disponibili: <b>{left}</b> (usate: {used})
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => add(slot, 1)} style={btnStyle}>
                  +1
                </button>
                <button onClick={() => add(slot, 2)} style={btnStyle}>
                  +2
                </button>
                <button onClick={() => add(slot, 3)} style={btnStyle}>
                  +3
                </button>
                <button
                  onClick={() => removeOne(slot)}
                  style={{ ...btnStyle, background: "white" }}
                  title="Togli l'ultimo inserimento di questo slot"
                >
                  –1
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, color: "#555", fontSize: 13 }}>
        Se usi due dispositivi con lo stesso account, vedrai gli stessi dati (dopo
        refresh o quando rientri nella pagina).
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "rgba(255,255,255,0.55)",
  cursor: "pointer",
  fontWeight: 900
};