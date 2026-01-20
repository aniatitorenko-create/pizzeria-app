"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  open_time: string; // HH:MM:SS
  close_time: string; // HH:MM:SS
  slot_minutes: number;
};

type OpeningRuleRow = {
  id: string;
  user_id: string;
  start_day: string; // YYYY-MM-DD
  is_closed: boolean;
  open_time: string;
  close_time: string;
  slot_minutes: number;
};

type OrderAggRow = {
  id: string;
  user_id: string;
  day: string;
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

function toTimeHHMMSS(hhmmStr: string) {
  return `${hhmmStr}:00`;
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
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
    setView(startOfMonth(fromYYYYMMDD(props.value)));
  }, [props.value]);

  const gridDays = useMemo(() => {
    const first = startOfMonth(view);
    const firstDayJS = first.getDay(); // 0 dom ... 6 sab
    const mondayBased = (firstDayJS + 6) % 7; // lun=0 ... dom=6
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayBased);

    const grid: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      grid.push(d);
    }
    return grid;
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
    <div style={styles.popWrap}>
      <div style={styles.popHeader}>
        <button onClick={prevMonth} style={styles.popNavBtn} aria-label="Mese precedente">
          ‹
        </button>
        <div style={styles.popTitle}>{formatMonthIT(view)}</div>
        <button onClick={nextMonth} style={styles.popNavBtn} aria-label="Mese successivo">
          ›
        </button>
      </div>

      <div style={styles.popWeekdays}>
        {weekdays.map((w, i) => (
          <div key={`${w}-${i}`} style={styles.popWeekday}>
            {w}
          </div>
        ))}
      </div>

      <div style={styles.popGrid}>
        {gridDays.map((d, idx) => {
          const inMonth = d.getMonth() === view.getMonth();
          const sel = isSameDay(d, selected);
          const today = isToday(d);

          const cellStyle: React.CSSProperties = {
            ...styles.popDay,
            opacity: inMonth ? 1 : 0.35,
            border: sel ? "2px solid black" : "1px solid #e5e5e5",
            fontWeight: sel ? 900 : 800,
          };

          if (today && !sel) cellStyle.border = "1px solid #999";

          return (
            <button key={`${d.toISOString()}-${idx}`} onClick={() => pick(d)} style={cellStyle}>
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

  // date popover
  const [selectedDay, setSelectedDay] = useState<string>(() => toYYYYMMDD(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);

  // hours popover
  const [hoursOpen, setHoursOpen] = useState(false);

  // settings
  const [maxPerSlot, setMaxPerSlot] = useState<number>(10);

  // current effective hours for selectedDay
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [openHHMM, setOpenHHMM] = useState<string>("18:30");
  const [closeHHMM, setCloseHHMM] = useState<string>("22:00");
  const [slotMinutes, setSlotMinutes] = useState<number>(15);

  // orders aggregate
  const [orders, setOrders] = useState<OrderAggRow[]>([]);
  const [loading, setLoading] = useState(false);

  // popover click-outside handler (for both)
  const popWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!calendarOpen && !hoursOpen) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!popWrapRef.current) return;
      if (!popWrapRef.current.contains(target)) {
        setCalendarOpen(false);
        setHoursOpen(false);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [calendarOpen, hoursOpen]);

  const slots = useMemo(() => {
    if (isClosed) return [];
    return generateSlotsHHMM(openHHMM, closeHHMM, slotMinutes);
  }, [openHHMM, closeHHMM, slotMinutes, isClosed]);

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

  async function ensureSettingsRow(uid: string) {
    const s = await supabase
      .from("settings")
      .select("user_id,max_per_slot")
      .eq("user_id", uid)
      .maybeSingle();

    if (s.data) {
      setMaxPerSlot((s.data as SettingsRow).max_per_slot);
    } else {
      await supabase.from("settings").upsert(
        { user_id: uid, max_per_slot: maxPerSlot },
        { onConflict: "user_id" }
      );
    }
  }

  async function loadEffectiveHours(uid: string) {
    // 1) override per singolo giorno?
    const byDate = await supabase
      .from("opening_hours_by_date")
      .select("*")
      .eq("user_id", uid)
      .eq("day", selectedDay)
      .maybeSingle();

    if (byDate.data) {
      const row = byDate.data as OpeningByDateRow;
      setIsClosed(row.is_closed);
      setOpenHHMM(hhmm(row.open_time));
      setCloseHHMM(hhmm(row.close_time));
      setSlotMinutes(row.slot_minutes);
      return;
    }

    // 2) regola "da questo giorno in poi": prendi la più recente <= selectedDay
    const rule = await supabase
      .from("opening_rules")
      .select("*")
      .eq("user_id", uid)
      .lte("start_day", selectedDay)
      .order("start_day", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rule.data) {
      const r = rule.data as OpeningRuleRow;
      setIsClosed(r.is_closed);
      setOpenHHMM(hhmm(r.open_time));
      setCloseHHMM(hhmm(r.close_time));
      setSlotMinutes(r.slot_minutes);
      return;
    }

    // 3) default
    setIsClosed(false);
    setOpenHHMM("18:30");
    setCloseHHMM("22:00");
    setSlotMinutes(15);
  }

  async function loadOrders(uid: string) {
    const o = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", uid)
      .eq("day", selectedDay);

    setOrders((o.data as OrderAggRow[]) ?? []);
  }

  async function loadAll(showSpinner: boolean) {
    if (!user) return;
    if (showSpinner) setLoading(true);

    await ensureSettingsRow(user.id);
    await loadEffectiveHours(user.id);
    await loadOrders(user.id);

    if (showSpinner) setLoading(false);
  }

  function qtyForSlot(slotHHMM: string) {
    const t = toTimeHHMMSS(slotHHMM);
    const row = orders.find((r) => r.slot_time === t);
    return row ? row.qty : 0;
  }

  // AUTH actions
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

  // hours actions (popup)
  async function saveHoursOnlyThisDay() {
    if (!user) return;
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
    setHoursOpen(false);
    await loadAll(false);
  }

  async function applyHoursFromThisDayOnward() {
    if (!user) return;
    setLoading(true);

    const resRule = await supabase.from("opening_rules").upsert(
      {
        user_id: user.id,
        start_day: selectedDay,
        is_closed: isClosed,
        open_time: `${openHHMM}:00`,
        close_time: `${closeHHMM}:00`,
        slot_minutes: slotMinutes,
      },
      { onConflict: "user_id,start_day" }
    );

    setLoading(false);
    if (resRule.error) alert(resRule.error.message);

    setHoursOpen(false);
    await loadAll(false);
  }

  // orders actions (1 riga per slot)
  async function upsertSlotQty(slotHHMM: string, delta: number) {
    if (!user) return;

    const slot_time = toTimeHHMMSS(slotHHMM);
    const current = qtyForSlot(slotHHMM);
    const next = Math.max(0, current + delta);

    if (next > maxPerSlot) {
      alert("SLOT PIENO ❌");
      return;
    }

    if (next === 0) {
      const row = orders.find((r) => r.slot_time === slot_time);
      if (!row) return;
      const res = await supabase.from("orders").delete().eq("id", row.id);
      if (res.error) alert(res.error.message);
      await loadAll(false);
      return;
    }

    const res = await supabase.from("orders").upsert(
      {
        user_id: user.id,
        day: selectedDay,
        slot_time,
        qty: next,
        note: null,
      },
      { onConflict: "user_id,day,slot_time" }
    );

    if (res.error) {
      alert(res.error.message);
      return;
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
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
          <button onClick={doLogin} disabled={loading || !email || !password} style={styles.primaryBtn}>
            {loading ? "..." : "LOGIN"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap} ref={popWrapRef}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div>
          <h1 style={styles.title}>Disponibilità</h1>
          <div style={styles.sub}>Auto refresh: 5s ✅</div>
        </div>
        <button onClick={doLogout} style={styles.ghostBtn}>
          Logout
        </button>
      </div>

      {/* TOP BAR: day + hours */}
      <div style={{ ...styles.panel, position: "relative" }}>
        <div style={{ fontWeight: 900 }}>Giorno</div>

        <button
          onClick={() => {
            setCalendarOpen((v) => !v);
            setHoursOpen(false);
          }}
          style={styles.dateBtn}
          title="Apri calendario"
        >
          {formatDateIT(selectedDay)}
        </button>

        <button onClick={() => goDay(-1)} style={styles.ghostBtn} title="Giorno precedente">
          ←
        </button>
        <button onClick={() => goDay(1)} style={styles.ghostBtn} title="Giorno successivo">
          →
        </button>

        <button
          onClick={() => {
            setHoursOpen((v) => !v);
            setCalendarOpen(false);
          }}
          style={styles.ghostBtn}
          title="Orari"
        >
          Orari
        </button>

        {calendarOpen && (
          <div style={styles.popPos}>
            <CalendarPopover value={selectedDay} onChange={(v) => setSelectedDay(v)} onClose={() => setCalendarOpen(false)} />
          </div>
        )}

        {hoursOpen && (
          <div style={styles.popPos}>
            <HoursPopover
              isClosed={isClosed}
              setIsClosed={setIsClosed}
              openHHMM={openHHMM}
              setOpenHHMM={setOpenHHMM}
              closeHHMM={closeHHMM}
              setCloseHHMM={setCloseHHMM}
              slotMinutes={slotMinutes}
              setSlotMinutes={setSlotMinutes}
              loading={loading}
              onSaveOnlyThisDay={saveHoursOnlyThisDay}
              onApplyFromThisDay={applyHoursFromThisDayOnward}
              onClose={() => setHoursOpen(false)}
            />
          </div>
        )}
      </div>

      {/* MAX + RESET (compatto) */}
      <div style={styles.panelMax}>
        <div style={styles.maxLabel}>Max/slot</div>

        <input
          type="number"
          value={maxPerSlot}
          onChange={(e) => setMaxPerSlot(Number(e.target.value))}
          style={styles.maxInput}
        />

        <button onClick={saveMax} disabled={loading} style={styles.maxSaveBtn}>
          Salva
        </button>

        <button onClick={resetDay} disabled={loading} style={styles.maxResetBtn} title="Reset giorno">
          Reset
        </button>

        {loading && <span style={styles.sub}>…</span>}
      </div>

      {/* SLOTS */}
      {isClosed ? (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #eee" }}>
          <b>Chiuso</b> per questa data.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {slots.map((slot) => {
            const used = qtyForSlot(slot);
            const left = Math.max(0, maxPerSlot - used);

            return (
              <SlotCard
                key={slot}
                slot={slot}
                left={left}
                onInc1={() => upsertSlotQty(slot, +1)}
                onDec1={() => upsertSlotQty(slot, -1)}
                onInc3={() => upsertSlotQty(slot, +3)}
                onDec3={() => upsertSlotQty(slot, -3)}
              />
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 10, ...styles.sub }}>
        Tip: swipe veloce → +1/-1. Swipe lento a sinistra → opzioni +3/-3.
      </div>
    </div>
  );
}

// ---------- HOURS POPOVER ----------
function HoursPopover(props: {
  isClosed: boolean;
  setIsClosed: (v: boolean) => void;
  openHHMM: string;
  setOpenHHMM: (v: string) => void;
  closeHHMM: string;
  setCloseHHMM: (v: string) => void;
  slotMinutes: number;
  setSlotMinutes: (v: number) => void;
  loading: boolean;
  onSaveOnlyThisDay: () => void;
  onApplyFromThisDay: () => void;
  onClose: () => void;
}) {
  const {
    isClosed,
    setIsClosed,
    openHHMM,
    setOpenHHMM,
    closeHHMM,
    setCloseHHMM,
    slotMinutes,
    setSlotMinutes,
    loading,
    onSaveOnlyThisDay,
    onApplyFromThisDay,
    onClose,
  } = props;

  return (
    <div style={styles.popWrap}>
      <div style={styles.hoursHead}>
        <div style={{ fontWeight: 900 }}>Orari</div>
        <button onClick={onClose} style={styles.xBtn} aria-label="Chiudi">
          ✕
        </button>
      </div>

      <label style={styles.chkRow}>
        <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
        <span>Chiuso</span>
      </label>

      {!isClosed && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={styles.row2}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={styles.sub}>Da</div>
              <input type="time" value={openHHMM} onChange={(e) => setOpenHHMM(e.target.value)} style={styles.input} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={styles.sub}>A</div>
              <input type="time" value={closeHHMM} onChange={(e) => setCloseHHMM(e.target.value)} style={styles.input} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={styles.sub}>Slot</div>
            <select value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} style={styles.input}>
              <option value={10}>10 min</option>
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <button onClick={onSaveOnlyThisDay} disabled={loading} style={styles.saveBtn}>
          Salva SOLO questo giorno
        </button>
        <button onClick={onApplyFromThisDay} disabled={loading} style={styles.blackBtn}>
          Applica DA questo giorno in poi
        </button>
      </div>
    </div>
  );
}

// ---------- SLOT CARD (swipe + azioni laterali) ----------
function SlotCard(props: {
  slot: string;
  left: number;
  onInc1: () => void;
  onDec1: () => void;
  onInc3: () => void;
  onDec3: () => void;
}) {
  const { slot, left, onInc1, onDec1, onInc3, onDec3 } = props;

  const start = useRef({ x: 0, y: 0, t: 0, active: false });
  const [dragX, setDragX] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [flash, setFlash] = useState<"inc" | "dec" | null>(null);

  const bg = left === 0 ? "#fecaca" : left <= 2 ? "#fde68a" : "#bbf7d0";

  function begin(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") return;

    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), active: true };
    setDragX(0);
    setReveal(false);
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current.active) return;

    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;

    // se scroll verticale -> ignora
    if (Math.abs(dy) > Math.abs(dx)) return;

    // trascinamento: permetti solo a sinistra (per rivelare azioni)
    const clamped = Math.max(-110, Math.min(0, dx));
    setDragX(clamped);

    const elapsed = Date.now() - start.current.t;
    // swipe lento verso sinistra -> rivela azioni
    if (elapsed > 220 && clamped < -18) setReveal(true);
  }

  async function end(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current.active) return;
    start.current.active = false;

    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    const elapsed = Date.now() - start.current.t;

    // reset drag position (animato via CSS)
    setDragX(0);

    if (Math.abs(dy) > Math.abs(dx)) return;

    // caso: swipe lento a sinistra -> resta reveal
    if (elapsed > 220 && dx < -18) {
      setReveal(true);
      return;
    }

    // swipe veloce: dx > 45 => +1
    if (dx > 45) {
      setFlash("inc");
      onInc1();
      setTimeout(() => setFlash(null), 140);
      return;
    }

    // swipe veloce: dx < -45 => -1
    if (dx < -45) {
      setFlash("dec");
      onDec1();
      setTimeout(() => setFlash(null), 140);
      return;
    }

    // altrimenti chiudi reveal
    setReveal(false);
  }

  function cancel() {
    start.current.active = false;
    setDragX(0);
  }

  const overlayStyle: React.CSSProperties =
    flash === "inc"
      ? { ...styles.flash, opacity: 1, transform: "scale(1)" }
      : flash === "dec"
      ? { ...styles.flashDec, opacity: 1, transform: "scale(1)" }
      : { ...styles.flash, opacity: 0, transform: "scale(0.98)" };

  return (
    <div style={styles.slotOuter}>
      {/* azioni laterali (visibili solo quando reveal=true) */}
      <div style={{ ...styles.slotActions, opacity: reveal ? 1 : 0, pointerEvents: reveal ? "auto" : "none" }}>
        <button style={styles.actionBtn} onClick={() => { onInc3(); setReveal(false); }}>
          +3
        </button>
        <button style={styles.actionBtnGhost} onClick={() => { onDec3(); setReveal(false); }}>
          -3
        </button>
      </div>

      {/* card principale che scorre */}
      <div
        style={{
          ...styles.cardSlide,
          background: bg,
          transform: reveal ? "translateX(-110px)" : `translateX(${dragX}px)`,
          transition: start.current.active ? "none" : "transform 160ms ease",
          touchAction: "pan-y",
        }}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={cancel}
        title="Swipe veloce: +1/-1. Swipe lento a sinistra: +3/-3."
      >
        <div style={overlayStyle} />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.time}>{slot}</div>

          <div style={styles.avail}>
            <span style={styles.availLabel}>Disp.</span>
            <span style={styles.availNum}>{left}</span>
          </div>
        </div>

        {/* piccolo hint quando reveal */}
        <div style={{ fontSize: 12, fontWeight: 900, opacity: reveal ? 1 : 0.35 }}>
          {reveal ? "Azioni" : " "}
        </div>
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
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "black",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  panel: {
    marginTop: 12,
    padding: 10,
    border: "1px solid #eee",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  // MAX COMPACT
  panelMax: {
    marginTop: 12,
    padding: 10,
    border: "1px solid #eee",
    borderRadius: 12,
    display: "grid",
    gridTemplateColumns: "auto 78px 1fr 1fr",
    gap: 8,
    alignItems: "center",
  },

  maxLabel: { fontWeight: 900 },

  maxInput: {
    padding: 8,
    border: "1px solid #ccc",
    borderRadius: 10,
    width: "100%",
    textAlign: "center",
    fontWeight: 900,
  },

  maxSaveBtn: {
    padding: "10px 8px",
    borderRadius: 10,
    border: "none",
    background: "#16a34a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  },

  maxResetBtn: {
    padding: "10px 8px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  },

  saveBtn: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "none",
    background: "#16a34a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  blackBtn: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "none",
    background: "black",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  ghostBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
  },

  dateBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    textTransform: "capitalize",
  },

  // SLOT container with actions
  slotOuter: {
    position: "relative",
    height: 54,
    borderRadius: 12,
    overflow: "hidden",
  },

  slotActions: {
    position: "absolute",
    top: 0,
    right: 0,
    height: "100%",
    width: 110,
    display: "flex",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 8,
  },

  actionBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "rgba(0,0,0,0.06)",
    cursor: "pointer",
    fontWeight: 900,
  },

  actionBtnGhost: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
  },

  cardSlide: {
    height: "100%",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "0 10px",
    position: "relative",
  },

  time: { fontWeight: 900, fontSize: 16, minWidth: 56 },

  // DISP styling
  avail: { display: "flex", alignItems: "baseline", gap: 6 },
  availLabel: { fontSize: 12, fontWeight: 800, color: "#444" },
  availNum: { fontSize: 20, fontWeight: 900 },

  // feedback flash
  flash: {
    position: "absolute",
    inset: 0,
    borderRadius: 12,
    background: "rgba(255,255,255,0.35)",
    opacity: 0,
    transform: "scale(0.98)",
    transition: "opacity 120ms ease, transform 120ms ease",
    pointerEvents: "none",
  },
  flashDec: {
    position: "absolute",
    inset: 0,
    borderRadius: 12,
    background: "rgba(0,0,0,0.08)",
    opacity: 0,
    transform: "scale(0.98)",
    transition: "opacity 120ms ease, transform 120ms ease",
    pointerEvents: "none",
  },

  // popover positioning
  popPos: { position: "absolute", top: 52, left: 10, zIndex: 50 },

  // generic popover wrap
  popWrap: {
    width: 300,
    padding: 10,
    borderRadius: 14,
    border: "1px solid #e5e5e5",
    background: "white",
    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
  },

  // calendar header
  popHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },

  popNavBtn: {
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

  popTitle: { fontWeight: 900, textTransform: "capitalize", fontSize: 14 },

  popWeekdays: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 6,
    marginBottom: 6,
  },

  popWeekday: { textAlign: "center", fontSize: 12, color: "#666", fontWeight: 900 },

  popGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 },

  popDay: { height: 38, borderRadius: 12, background: "white", cursor: "pointer" },

  // hours popover
  hoursHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  xBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
  },

  chkRow: { display: "flex", alignItems: "center", gap: 8, fontWeight: 800 },

  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
};