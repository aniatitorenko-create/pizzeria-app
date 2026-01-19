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

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then((res) => setUser(res.data.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // LOAD ON LOGIN
  useEffect(() => {
    if (!user) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // AUTO REFRESH (ogni 2 secondi)
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      void loadAll(false); // refresh silenzioso
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, day]);

  async function loadAll(showSpinner: boolean = true) {
    if (!user) return;
    if (showSpinner) setLoading(true);

    // SETTINGS
    const s = await supabase
      .from("settings")
      .select("user_id,max_per_slot,open_time,close_time,slot_minutes")
      .eq("user_id", user.id)
      .maybeSingle();

    if (s.data) {
      const row = s.data as SettingsRow;
      setMaxPerSlot(row.max_per_slot);
    } else {
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

    // ORDERS
    const o = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("day", day)
      .order("created_at", { ascending: true });

    setOrders((o.data as OrderRow[]) ?? []);

    if (showSpinner) setLoading(false);
  }

  function usedFor(slotHHMM: string) {
    return orders
      .filter((o) => hhmmFromTime(o.slot_time) === slotHHMM)
      .reduce((sum, o) => sum + o.qty, 0);
  }

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

    // ricarico
    await loadAll(false);
  }

  async function add(slotHHMM: string, qty: number) {
    if (!user) return;

    const used = usedFor(slotHHMM);
    if (used + qty > maxPerSlot) {
      alert("SLOT PIENO ❌");
      return;
    }

    // UI reattiva: aggiorno subito localmente
    setOrders((prev) => [
      ...prev,
      {
        id: "tmp-" + Math.random().toString(16).slice(2),
        user_id: user.id,
        day,
        slot_time: `${slotHHMM}:00`,
        qty,
        note: null,
        created_at: new Date().toISOString()
      }
    ]);

    const res = await supabase.from("orders").insert({
      user_id: user.id,
      day,
      slot_time: `${slotHHMM}:00`,
      qty,
      note: null
    });

    if (res.error) {
      alert("Errore inserimento: " + res.error.message);
      await loadAll(false);
      return;
    }
  }

  async function removeOne(slotHHMM: string) {
    if (!user) return;

    const same = orders.filter((o) => hhmmFromTime(o.slot_time) === slotHHMM);
    if (same.length === 0) return;

    const last = same[same.length - 1];

    // UI reattiva
    setOrders((prev) => prev.filter((o) => o.id !== last.id));

    // Se era un "tmp" (non ancora salvato), basta ricaricare
    if (last.id.startsWith("tmp-")) {
      await loadAll(false);
      return;
    }

    const res = await supabase.from("orders").delete().eq("id", last.id);

    if (res.error) {
      alert("Errore rimozione: " + res.error.message);
      await loadAll(false);
      return;
    }
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

    await loadAll(false);
  }

  // UI - LOGIN
  if (!user) {
    return (
      <div style={styles.wrap}>
        <h1 style={styles.title}>Pizzeria - Slot</h1>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button
            onClick={doLogin}
            disabled={loading || !email || !password}
            style={styles.primaryBtn}
          >
            {loading ? "..." : "LOGIN"}
          </button>
        </div>
      </div>
    );
  }

  // UI - DASHBOARD
  return (
    <div style={styles.wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={styles.title}>Disponibilità</h1>
          <div style={styles.sub}>
            {OPEN_TIME}–{CLOSE_TIME} • {day}
          </div>
        </div>
        <button onClick={doLogout} style={styles.ghostBtn}>
          Logout
        </button>
      </div>

      <div style={styles.panel}>
        <div style={{ fontWeight: 800 }}>Max/slot</div>
        <input
          type="number"
          value={maxPerSlot}
          onChange={(e) => setMaxPerSlot(Number(e.target.value))}
          style={{ ...styles.input, width: 90, padding: 8 }}
        />
        <button onClick={saveMax} disabled={loading} style={styles.saveBtn}>
          Salva
        </button>
        <button onClick={resetToday} disabled={loading} style={styles.ghostBtn}>
          Reset
        </button>
        {loading && <span style={styles.sub}>…</span>}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {slots.map((slot) => {
          const left = Math.max(0, maxPerSlot - usedFor(slot));

          // colori
          const bg =
            left === 0 ? "#fecaca" : left <= 2 ? "#fde68a" : "#bbf7d0";

          return (
            <div key={slot} style={{ ...styles.card, background: bg }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={styles.time}>{slot}</div>
                <div style={styles.avail}>
                  Disponibili: <span style={{ fontWeight: 900 }}>{left}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => add(slot, 1)} style={styles.smallBtn}>
                  +1
                </button>
                <button onClick={() => add(slot, 2)} style={styles.smallBtn}>
                  +2
                </button>
                <button onClick={() => add(slot, 3)} style={styles.smallBtn}>
                  +3
                </button>
                <button onClick={() => removeOne(slot)} style={styles.smallBtnGhost}>
                  –1
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, ...styles.sub }}>
        Aggiornamento automatico attivo ✅
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // più stretto: “non troppo largo”
  wrap: { maxWidth: 420, margin: "0 auto", padding: 14 },
  title: { fontSize: 20, fontWeight: 900, margin: 0 },
  sub: { color: "#555", fontSize: 12 },

  input: {
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 10
  },

  primaryBtn: {
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "black",
    color: "white",
    fontWeight: 900,
    cursor: "pointer"
  },

  panel: {
    marginTop: 12,
    padding: 10,
    border: "1px solid #eee",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },

  saveBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#16a34a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer"
  },

  ghostBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer"
  },

  // card più compatta
  card: {
    padding: 10,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },

  time: { fontWeight: 900, fontSize: 16, minWidth: 56 },
  avail: { fontSize: 13 },

  // bottoni più piccoli
  smallBtn: {
    padding: "7px 9px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "rgba(255,255,255,0.55)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13
  },

  smallBtnGhost: {
    padding: "7px 9px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13
  }
};