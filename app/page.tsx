"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

// ---------- TYPES ----------
type SettingsRow = { user_id: string; max_per_slot: number };

type OpeningByDateRow = {
  id: string;
  user_id: string;
  day: string; // YYYY-MM-DD
  is_closed: boolean;
  open_time: string;  // HH:MM:SS
  close_time: string; // HH:MM:SS
  slot_minutes: number;
};

type OrderRow = {
  id: string;
  user_id: string;
  day: string;       // YYYY-MM-DD
  slot_time: string; // HH:MM:SS
  qty: number;
  created_at: string;
};

// ---------- HELPERS ----------
function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function toYYYYMMDD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromYYYYMMDD(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function hhmm(t: string) {
  return t.slice(0, 5);
}

function formatDateIT(yyyyMmDd: string) {
  const d = fromYYYYMMDD(yyyyMmDd);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
    .format(d)
    .replace(/\./g, "")
    .toLowerCase();
}

function formatMonthIT(d: Date) {
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" })
    .format(d)
    .replace(/\./g, "");
}

function generateSlotsHHMM(openHHMM: string, closeHHMM: string, slotMinutes: number) {
  const slots: string[] = [];
  let [h, m] = openHHMM.split(":").map(Number);
  const [endH, endM] = closeHHMM.split(":").map(Number);

  while (h < endH || (h === endH && m < endM)) {
    slots.push(`${pad2(h)}:${pad2(m)}`);
    m += slotMinutes;
    if (m >= 60) {
      h += Math.floor(m / 60);
      m = m % 60;
    }
  }
  return slots;
}

// ---------- MINI CALENDAR ----------
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(d: Date) {
  return isSameDay(d, new Date());
}

function CalendarPopover(props: {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const selected = fromYYYYMMDD(props.value);
  const [view, setView] = useState<Date>(() => startOfMonth(selected));

  useEffect(() => {
    // quando cambia la data selezionata, allinea il mese visibile
    setView(startOfMonth(fromYYYYMMDD(props.value)));
  }, [props.value]);

  const days = useMemo(() => {
    const first = startOfMonth(view);
    const last = endOfMonth(view);

    // In Italia la settimana parte da lunedì.
    // JS: getDay() => 0 dom, 1 lun, ... 6 sab
    const firstDayJS = first.getDay();
    const mondayBased = (firstDayJS + 6) % 7; // lun=0 ... dom=6
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayBased);

    const grid: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      grid.push(d);
    }

    return { grid, first, last };
  }, [view]);

  const weekdays = ["L", "M", "M", "G", "V", "S", "D"];

  function prevMonth() {
    const d = new Date(view);
    d.setMonth(d.getMonth() - 1);
    setView(startOfMonth(d));
  }

  function nextMonth() {
    const d = new Date(view);
    d.setMonth(d.getMonth() + 1);
    setView(startOfMonth(d));
  }

  function pick(d: Date) {
    props.onChange(toYYYYMMDD(d));
    props.onClose();
  }

  return (
    <div style={styles.calWrap}>
      <div style={styles.calHeader}>
        <button onClick={prevMonth} style={styles.calNavBtn} aria-label="Mese precedente">‹</button>
        <div style={styles.calTitle}>{formatMonthIT(view)}</div>
        <button onClick={nextMonth} style={styles.calNavBtn} aria-label="Mese successivo">›</button>
      </div>

      <div style={styles.calWeekdays}>
        {weekdays.map((w) => (
          <div key={w} style={styles.calWeekday}>{w}</div>
        ))}
      </div>

      <div style={styles.calGrid}>
        {days.grid.map((d, idx) => {
          const inMonth = d.getMonth() === view.getMonth();
          const sel = isSameDay(d, selected);
          const today = isToday(d);

          const cellStyle: React.CSSProperties = {
            ...styles.calDay,
            opacity: inMonth ? 1 : 0.35,
            border: sel ? "2px solid black" : "1px solid #e5e5e5",
            fontWeight: sel ? 900 : 700,
          };

          // evidenzia oggi (se non selezionato)
          if (today && !sel) {
            cellStyle.border = "1px solid #999";
          }

          return (
            <button
              key={`${d.toISOString()}-${idx}`}
              onClick={() => pick(d)}
              style={cellStyle}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- PAGE ----------
export default function Page() {
  const [user, setUser] = useState<User | null>(null);

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // date
  const [selectedDay, setSelectedDay] = useState<string>(() => toYYYYMMDD(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);

  // settings
  const [maxPerSlot, setMaxPerSlot] = useState<number>(10);

  // opening hours by date
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [openHHMM, setOpenHHMM] = useState<string>("18:30");
  const [closeHHMM, setCloseHHMM] = useState<string>("22:00");
  const [slotMinutes, setSlotMinutes] = useState<number>(15);

  // orders
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const slots = useMemo(() => {
    if (isClosed) return [];
    return generateSlotsHHMM(openHHMM, closeHHMM, slotMinutes);
  }, [openHHMM, closeHHMM, slotMinutes, isClosed]);

  // close calendar clicking outside
  const calBoxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!calendarOpen) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!calBoxRef.current) return;
      if (!calBoxRef.current.contains(target)) setCalendarOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [calendarOpen]);

  // AUTH
  useEffect(() => {
    supabase.auth.getUser().then((res) => setUser(res.data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // LOAD on login & day change
  useEffect(() => {
    if (!user) return;
    void loadAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedDay]);

  // AUTO REFRESH every 5s
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => void loadAll(false), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedDay]);

  async function loadAll(showSpinner: boolean) {
    if (!user) return;
    if (showSpinner) setLoading(true);

    // settings
    const s = await supabase
      .from("settings")
      .select("user_id,max_per_slot")
      .eq("user_id", user.id)
      .maybeSingle();

    if (s.data) {
      setMaxPerSlot((s.data as SettingsRow).max_per_slot);
    } else {
      await supabase.from("settings").upsert(
        { user_id: user.id, max_per_slot: maxPerSlot },
        { onConflict: "user_id" }
      );
    }

    // opening hours by date
    const oh = await supabase
      .from("opening_hours_by_date")
      .select("*")
      .eq("user_id", user.id)
      .eq("day", selectedDay)
      .maybeSingle();

    if (oh.data) {
      const row = oh.data as OpeningByDateRow;
      setIsClosed(row.is_closed);
      setOpenHHMM(hhmm(row.open_time));
      setCloseHHMM(hhmm(row.close_time));
      setSlotMinutes(row.slot_minutes);
    } else {
      await supabase.from("opening_hours_by_date").upsert(
        {
          user_id: user.id,
          day: selectedDay,
          is_closed: false,
          open_time: "18:30",
          close_time: "22:00",
          slot_minutes: 15,
        },
        { onConflict: "user_id,day" }
      );
      setIsClosed(false);
      setOpenHHMM("18:30");
      setCloseHHMM("22:00");
      setSlotMinutes(15);
    }

    // orders
    const o = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .eq("day", selectedDay)
      .order("created_at", { ascending: true });

    setOrders((o.data as OrderRow[]) ?? []);

    if (showSpinner) setLoading(false);
  }

  function usedFor(slotHHMM: string) {
    return orders
      .filter((o) => hhmm(o.slot_time) === slotHHMM)
      .reduce((sum, o) => sum + o.qty, 0);
  }

  // auth actions
  async function doLogin() {
    setLoading(true);
    const res = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (res.error) alert(res.error.message);
  }
  async function doLogout() {
    await supabase.auth.signOut();
  }

  // settings actions
  async function saveMax() {
    if (!user) return;
    setLoading(true);
    const res = await supabase.from("settings").upsert(
      { user_id: user.id, max_per_slot: maxPerSlot },
      { onConflict: "user_id" }
    );
    setLoading(false);
    if (res.error) alert(res.error.message);
  }

  async function saveOpeningByDate() {
    if (!user) return;
    if (!isClosed && (!openHHMM || !closeHHMM)) {
      alert("Inserisci orario apertura/chiusura");
      return;
    }

    setLoading(true);
    const res = await supabase.from("opening_hours_by_date").upsert(
      {
        user_id: user.id,
        day: selectedDay,
        is_closed: isClosed,
        open_time: `${openHHMM}:00`,
        close_time: `${closeHHMM}:00`,
        slot_minutes: slotMinutes,
      },
      { onConflict: "user_id,day" }
    );
    setLoading(false);
    if (res.error) alert(res.error.message);
    await loadAll(false);
  }

  // orders actions
  async function increment(slotHHMM: string, qty: number) {
    if (!user) return;
    const used = usedFor(slotHHMM);
    if (used + qty > maxPerSlot) {
      alert("SLOT PIENO ❌");
      return;
    }

    const res = await supabase.from("orders").insert({
      user_id: user.id,
      day: selectedDay,
      slot_time: `${slotHHMM}:00`,
      qty,
      note: null,
    });

    if (res.error) {
      alert(res.error.message);
      return;
    }
    await loadAll(false);
  }

  async function decrementOne(slotHHMM: string) {
    if (!user) return;
    const same = orders.filter((o) => hhmm(o.slot_time) === slotHHMM);
    if (same.length === 0) return;

    const last = same[same.length - 1];
    if (last.qty > 1) {
      const res = await supabase.from("orders").update({ qty: last.qty - 1 }).eq("id", last.id);
      if (res.error) alert(res.error.message);
    } else {
      const res = await supabase.from("orders").delete().eq("id", last.id);
      if (res.error) alert(res.error.message);
    }
  }

  async function decrement(slotHHMM: string, qty: number) {
    for (let i = 0; i < qty; i++) {
      // eslint-disable-next-line no-await-in-loop
      await decrementOne(slotHHMM);
    }
    await loadAll(false);
  }

  async function resetDay() {
    if (!user) return;
    if (!confirm("Sicuro di azzerare tutti gli ordini di questo giorno?")) return;

    setLoading(true);
    const res = await supabase
      .from("orders")
      .delete()
      .eq("user_id", user.id)
      .eq("day", selectedDay);
    setLoading(false);

    if (res.error) alert(res.error.message);
    await loadAll(false);
  }

  function goDay(delta: number) {
    const d = fromYYYYMMDD(selectedDay);
    d.setDate(d.getDate() + delta);
    setSelectedDay(toYYYYMMDD(d));
  }

  // UI
  if (!user) {
    return (
      <div style={styles.wrap}>
        <h1 style={styles.title}>Pizzeria - Slot</h1>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} />
          <button onClick={doLogin} disabled={loading || !email || !password} style={styles.primaryBtn}>
            {loading ? "..." : "LOGIN"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <h1 style={styles.title}>Disponibilità</h1>
          <div style={styles.sub}>Auto refresh: 5s ✅</div>
        </div>
        <button onClick={doLogout} style={styles.ghostBtn}>Logout</button>
      </div>

      {/* DATE SELECTOR + MINI CALENDAR */}
      <div style={{ ...styles.panel, position: "relative" }} ref={calBoxRef}>
        <div style={{ fontWeight: 900 }}>Giorno</div>

        <button
          onClick={() => setCalendarOpen((v) => !v)}
          style={styles.dateBtn}
          title="Apri calendario"
        >
          {formatDateIT(selectedDay)}
        </button>

        <button onClick={() => goDay(-1)} style={styles.ghostBtn} title="Giorno precedente">←</button>
        <button onClick={() => goDay(1)} style={styles.ghostBtn} title="Giorno successivo">→</button>

        {calendarOpen && (
          <div style={styles.calPopup}>
            <CalendarPopover
              value={selectedDay}
              onChange={(v) => setSelectedDay(v)}
              onClose={() => setCalendarOpen(false)}
            />
          </div>
        )}
      </div>

      {/* MAX + RESET */}
      <div style={styles.panel}>
        <div style={{ fontWeight: 900 }}>Max/slot</div>
        <input
          type="number"
          value={maxPerSlot}
          onChange={(e) => setMaxPerSlot(Number(e.target.value))}
          style={{ ...styles.input, width: 90, padding: 8 }}
        />
        <button onClick={saveMax} disabled={loading} style={styles.saveBtn}>Salva</button>
        <button onClick={resetDay} disabled={loading} style={styles.ghostBtn}>Reset giorno</button>
        {loading && <span style={styles.sub}>…</span>}
      </div>

      {/* OPENING HOURS FOR THIS DATE */}
      <div style={styles.panelCol}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Orari (per questa data)</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
            Chiuso
          </label>
        </div>

        {!isClosed && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.sub}>Da</span>
              <input type="time" value={openHHMM} onChange={(e) => setOpenHHMM(e.target.value)} style={{ ...styles.input, padding: 8 }} />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.sub}>a</span>
              <input type="time" value={closeHHMM} onChange={(e) => setCloseHHMM(e.target.value)} style={{ ...styles.input, padding: 8 }} />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={styles.sub}>Slot</span>
              <select value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} style={{ ...styles.input, padding: 8 }}>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={20}>20 min</option>
                <option value={30}>30 min</option>
              </select>
            </div>
          </div>
        )}

        <button onClick={saveOpeningByDate} disabled={loading} style={styles.saveBtn}>
          Salva orari
        </button>
      </div>

      {/* SLOTS */}
      {isClosed ? (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #eee" }}>
          <b>Chiuso</b> per questa data.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {slots.map((slot) => {
            const left = Math.max(0, maxPerSlot - usedFor(slot));
            return (
              <SlotCard
                key={slot}
                slot={slot}
                left={left}
                onSwipeRight={() => increment(slot, 1)}
                onSwipeLeft={() => decrement(slot, 1)}
                onPlus3={() => increment(slot, 3)}
                onMinus3={() => decrement(slot, 3)}
              />
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 10, ...styles.sub }}>
        Tip: swipe → destra +1, sinistra -1
      </div>
    </div>
  );
}

// ---------- Slot Card with swipe ----------
function SlotCard(props: {
  slot: string;
  left: number;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onPlus3: () => void;
  onMinus3: () => void;
}) {
  const { slot, left, onSwipeRight, onSwipeLeft, onPlus3, onMinus3 } = props;
  const startX = useRef<number | null>(null);

  const bg = left === 0 ? "#fecaca" : left <= 2 ? "#fde68a" : "#bbf7d0";

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null) return;
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX.current;
    startX.current = null;

    if (dx > 35) onSwipeRight();
    else if (dx < -35) onSwipeLeft();
  }

  return (
    <div style={{ ...styles.card, background: bg }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={styles.time}>{slot}</div>
        <div style={styles.avail}>
          Disponibili: <span style={{ fontWeight: 900 }}>{left}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onPlus3} style={styles.smallBtn}>+3</button>
        <button onClick={onMinus3} style={styles.smallBtnGhost}>-3</button>
      </div>
    </div>
  );
}

// ---------- STYLES ----------
const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 420, margin: "0 auto", padding: 14 },
  title: { fontSize: 20, fontWeight: 900, margin: 0 },
  sub: { color: "#555", fontSize: 12 },

  input: { padding: 10, border: "1px solid #ccc", borderRadius: 10 },

  primaryBtn: {
    padding: 12, borderRadius: 10, border: "none",
    background: "black", color: "white", fontWeight: 900, cursor: "pointer"
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

  panelCol: {
    marginTop: 12,
    padding: 10,
    border: "1px solid #eee",
    borderRadius: 12,
    display: "grid",
    gap: 10
  },

  saveBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "none",
    background: "#16a34a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    width: "fit-content"
  },

  ghostBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer"
  },

  dateBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    textTransform: "capitalize"
  },

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

  smallBtn: {
    padding: "7px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "rgba(255,255,255,0.55)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13
  },

  smallBtnGhost: {
    padding: "7px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13
  },

  // calendar popover
  calPopup: {
    position: "absolute",
    top: 52,
    left: 10,
    zIndex: 50,
  },

  calWrap: {
    width: 300,
    padding: 10,
    borderRadius: 14,
    border: "1px solid #e5e5e5",
    background: "white",
    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
  },

  calHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },

  calNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 18,
    lineHeight: "18px",
  },

  calTitle: {
    fontWeight: 900,
    textTransform: "capitalize",
    fontSize: 14,
  },

  calWeekdays: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
    marginBottom: 6,
  },

  calWeekday: {
    textAlign: "center",
    fontSize: 12,
    color: "#666",
    fontWeight: 900,
  },

  calGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
  },

  calDay: {
    height: 38,
    borderRadius: 12,
    background: "white",
    cursor: "pointer",
  },
};