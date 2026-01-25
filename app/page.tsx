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

// battery helpers
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// prefers dark mode
function usePrefersDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!m) return;
    const onChange = () => setDark(!!m.matches);
    onChange();
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);
  return dark;
}

// p=1 pieno (verde) -> p=0 vuoto (rosso) | versione più tenue + leggibile in dark
function batteryColor(p: number, dark: boolean) {
  const hue = 120 * clamp01(p); // 0=rosso, 120=verde
  const sat = dark ? 45 : 55;
  const light = dark ? 32 : 78;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// CSS vars per light/dark automatico
function ThemeVars() {
  return (
    <style>{`
      :root{
        --bg:#fafafa;
        --fg:#111827;
        --muted:#6b7280;

        --panel-bg:#ffffff;
        --card-bg:#ffffff;
        --border:rgba(17,24,39,.10);

        --btn-bg:rgba(17,24,39,.06);
        --btn-bg-strong:rgba(17,24,39,.10);

        --shadow:0 10px 25px rgba(0,0,0,.10);
        --battery-track:rgba(17,24,39,.06);
      }
      @media (prefers-color-scheme: dark){
        :root{
          --bg:#0b0c10;
          --fg:#f3f4f6;
          --muted:rgba(243,244,246,.70);

          --panel-bg:rgba(255,255,255,.05);
          --card-bg:rgba(255,255,255,.06);
          --border:rgba(255,255,255,.12);

          --btn-bg:rgba(255,255,255,.08);
          --btn-bg-strong:rgba(255,255,255,.12);

          --shadow:0 10px 25px rgba(0,0,0,.35);
          --battery-track:rgba(255,255,255,.08);
        }
      }
    `}</style>
  );
}

// ---------- MINI CALENDAR ----------
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
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
            border: sel ? "2px solid var(--fg)" : "1px solid var(--border)",
            fontWeight: sel ? 900 : 800,
          };

          if (today && !sel) cellStyle.border = "1px solid rgba(127,127,127,0.65)";

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
  const dark = usePrefersDark();

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
    const s = await supabase.from("settings").select("user_id,max_per_slot").eq("user_id", uid).maybeSingle();

    if (s.data) {
      setMaxPerSlot((s.data as SettingsRow).max_per_slot);
    } else {
      await supabase.from("settings").upsert({ user_id: uid, max_per_slot: maxPerSlot }, { onConflict: "user_id" });
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
    const o = await supabase.from("orders").select("*").eq("user_id", uid).eq("day", selectedDay);
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
    const res = await supabase
      .from("settings")
      .upsert({ user_id: user.id, max_per_slot: maxPerSlot }, { onConflict: "user_id" });
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
    const res = await supabase.from("orders").delete().eq("user_id", user.id).eq("day", selectedDay);
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
        <ThemeVars />
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
      <ThemeVars />

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
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-bg)" }}>
          <b>Chiuso</b> per questa data.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {slots.map((slot) => {
            const used = qtyForSlot(slot);
            const left = Math.max(0, maxPerSlot - used);

            return (
              <SlotCard
                key={slot}
                slot={slot}
                left={left}
                max={maxPerSlot}
                dark={dark}
                onDelta={(delta) => upsertSlotQty(slot, delta)}
              />
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 10, ...styles.sub }}>
        Tip: tasti +/− = +1/−1. <b>Tieni premuto</b> sulla riga per aprire +2… / −2… (tap sull’orario per chiudere).
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

// ---------- SLOT CARD (tasti +/- + tap lungo per menu “+2.. / -2..”) ----------
function SlotCard(props: {
  slot: string;
  left: number;
  max: number;
  dark: boolean;
  onDelta: (delta: number) => void;
}) {
  const { slot, left, max, dark, onDelta } = props;

  const [menuOpen, setMenuOpen] = useState(false);

  // long press
  const press = useRef<{
    active: boolean;
    x: number;
    y: number;
    timer: number | null;
  }>({ active: false, x: 0, y: 0, timer: null });

  const used = Math.max(0, max - left);

  // menu options: +2..+left, -2..-used
  const incOptions = useMemo(() => {
    const n = Math.max(0, left);
    const arr: number[] = [];
    for (let k = 2; k <= n; k++) arr.push(k);
    return arr;
  }, [left]);

  const decOptions = useMemo(() => {
    const n = Math.max(0, used);
    const arr: number[] = [];
    for (let k = 2; k <= n; k++) arr.push(k);
    return arr;
  }, [used]);

  // batteria
  const pct = clamp01(max > 0 ? left / max : 0);
  const fillW = `${Math.round(pct * 100)}%`;
  const fillColor = batteryColor(pct, dark);

  function clearTimer() {
    if (press.current.timer) {
      window.clearTimeout(press.current.timer);
      press.current.timer = null;
    }
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON") return;
    if (menuOpen) return;

    press.current.active = true;
    press.current.x = e.clientX;
    press.current.y = e.clientY;

    clearTimer();
    press.current.timer = window.setTimeout(() => {
      setMenuOpen(true);
      press.current.active = false;
      clearTimer();
    }, 420);
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!press.current.active) return;

    const dx = Math.abs(e.clientX - press.current.x);
    const dy = Math.abs(e.clientY - press.current.y);

    if (dx > 10 || dy > 10) {
      press.current.active = false;
      clearTimer();
    }
  }

  function onCardPointerUp() {
    press.current.active = false;
    clearTimer();
  }

  function onCardPointerCancel() {
    press.current.active = false;
    clearTimer();
  }

  return (
    <div style={styles.slotOuter}>
      {/* card */}
      <div
        style={styles.cardSlide}
        onPointerDown={onCardPointerDown}
        onPointerMove={onCardPointerMove}
        onPointerUp={onCardPointerUp}
        onPointerCancel={onCardPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        title="Tasti: +1/-1. Tieni premuto sulla riga: +2.. / -2.."
      >
        {/* barra batteria */}
        <div style={styles.batteryTrack} aria-hidden="true">
          <div
            style={{
              ...styles.batteryFill,
              width: fillW,
              background: fillColor,
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative", width: "100%" }}>
          {/* orario: tap per chiudere menu */}
          <div
            style={styles.time}
            onPointerDown={(e) => {
              if (menuOpen) {
                e.stopPropagation();
                setMenuOpen(false);
              }
            }}
            onClick={() => {
              if (menuOpen) setMenuOpen(false);
            }}
            role="button"
            aria-label={menuOpen ? "Chiudi menu" : "Orario"}
            tabIndex={0}
          >
            {slot}
          </div>

          <div style={styles.avail}>
            <span style={styles.availLabel}>Disp.</span>
            <span style={styles.availNum}>{left}</span>
          </div>

          {/* tasti sempre visibili per -1 / +1 */}
          <div style={styles.stepper}>
            <button
              type="button"
              style={styles.stepBtnMinus}
              onClick={(e) => {
                e.stopPropagation();
                onDelta(-1);
              }}
              aria-label="Meno 1"
              title="-1"
            >
              −
            </button>

            <button
              type="button"
              style={styles.stepBtnPlus}
              onClick={(e) => {
                e.stopPropagation();
                onDelta(+1);
              }}
              aria-label="Più 1"
              title="+1"
            >
              +
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 900, opacity: menuOpen ? 1 : 0.35, position: "relative", color: "var(--muted)" }}>
          {menuOpen ? "Menu rapido (tap su orario per chiudere)" : " "}
        </div>
      </div>

      {/* menu a comparsa sotto */}
      <div
        style={{
          ...styles.menuPanel,
          maxHeight: menuOpen ? 220 : 0,
          opacity: menuOpen ? 1 : 0,
          transform: menuOpen ? "translateY(0px)" : "translateY(-6px)",
          pointerEvents: menuOpen ? "auto" : "none",
        }}
        aria-hidden={!menuOpen}
      >
        <div style={styles.menuHint}>
          Opzioni rapide: <b>−2…</b> (fino a {used}) &nbsp; | &nbsp; <b>+2…</b> (fino a {left})
        </div>

        <div style={styles.menuRow}>
          {/* decrementi */}
          {decOptions.length === 0 ? (
            <span style={styles.menuEmpty}>Nessun −2 disponibile</span>
          ) : (
            decOptions.map((n) => (
              <button
                key={`dec-${n}`}
                style={styles.menuChipGhost}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelta(-n);
                  setMenuOpen(false); // ✅ chiusura automatica
                }}
                title={`-${n}`}
              >
                −{n}
              </button>
            ))
          )}

          <div style={styles.menuSep} />

          {/* incrementi */}
          {incOptions.length === 0 ? (
            <span style={styles.menuEmpty}>Nessun +2 disponibile</span>
          ) : (
            incOptions.map((n) => (
              <button
                key={`inc-${n}`}
                style={styles.menuChip}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelta(+n);
                  setMenuOpen(false); // ✅ chiusura automatica
                }}
                title={`+${n}`}
              >
                +{n}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- STYLES ----------
const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 420,
    margin: "0 auto",
    padding: 12,
    background: "var(--bg)",
    color: "var(--fg)",
    minHeight: "100vh",
  },
  title: { fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: -0.2 },
  sub: { color: "var(--muted)", fontSize: 12 },

  input: {
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--panel-bg)",
    color: "var(--fg)",
  },

  primaryBtn: {
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "var(--fg)",
    color: "var(--bg)",
    fontWeight: 900,
    cursor: "pointer",
  },

  panel: {
    marginTop: 10,
    padding: 8,
    border: "1px solid var(--border)",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    background: "var(--panel-bg)",
    boxShadow: "var(--shadow)",
  },

  panelMax: {
    marginTop: 10,
    padding: 8,
    border: "1px solid var(--border)",
    borderRadius: 12,
    display: "grid",
    gridTemplateColumns: "auto 70px 1fr 1fr",
    gap: 6,
    alignItems: "center",
    background: "var(--panel-bg)",
    boxShadow: "var(--shadow)",
  },

  maxLabel: { fontWeight: 900 },

  maxInput: {
    padding: 7,
    border: "1px solid var(--border)",
    borderRadius: 10,
    width: "100%",
    textAlign: "center",
    fontWeight: 900,
    background: "var(--card-bg)",
    color: "var(--fg)",
  },

  maxSaveBtn: {
    padding: "9px 8px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--btn-bg-strong)",
    color: "var(--fg)",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  },

  maxResetBtn: {
    padding: "9px 8px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  },

  saveBtn: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--btn-bg-strong)",
    color: "var(--fg)",
    fontWeight: 900,
    cursor: "pointer",
  },

  blackBtn: {
    padding: "10px 10px",
    borderRadius: 10,
    border: "none",
    background: "var(--fg)",
    color: "var(--bg)",
    fontWeight: 900,
    cursor: "pointer",
  },

  ghostBtn: {
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    cursor: "pointer",
    fontWeight: 800,
  },

  dateBtn: {
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    cursor: "pointer",
    fontWeight: 900,
    textTransform: "capitalize",
  },

  slotOuter: { display: "grid", gap: 6 },

  // ✅ slot più compatti
  cardSlide: {
    height: 46,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "0 8px",
    position: "relative",
    background: "var(--card-bg)",
    border: "1px solid var(--border)",
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
  },

  // batteria tenue
  batteryTrack: {
    position: "absolute",
    inset: 5,
    borderRadius: 10,
    background: "var(--battery-track)",
    overflow: "hidden",
    pointerEvents: "none",
  },

  batteryFill: {
    height: "100%",
    borderRadius: 10,
    width: "0%",
    transition: "width 220ms ease, background-color 220ms ease",
    willChange: "width",
    opacity: 0.55,
  },

  time: {
    fontWeight: 900,
    fontSize: 15,
    minWidth: 48,
    position: "relative",
    cursor: "pointer",
    letterSpacing: -0.2,
  },

  avail: { display: "flex", alignItems: "baseline", gap: 6, position: "relative" },
  availLabel: { fontSize: 12, fontWeight: 800, color: "var(--muted)" },
  availNum: { fontSize: 18, fontWeight: 900 },

  stepper: { marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", position: "relative" },

  stepBtnMinus: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    fontWeight: 900,
    fontSize: 18,
    cursor: "pointer",
    lineHeight: "18px",
  },

  stepBtnPlus: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--btn-bg)",
    color: "var(--fg)",
    fontWeight: 900,
    fontSize: 18,
    cursor: "pointer",
    lineHeight: "18px",
  },

  menuPanel: {
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--panel-bg)",
    padding: 10,
    overflow: "hidden",
    transition: "max-height 180ms ease, opacity 180ms ease, transform 180ms ease",
    boxShadow: "var(--shadow)",
  },

  menuHint: { fontSize: 12, color: "var(--muted)", fontWeight: 800, marginBottom: 8 },

  menuRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 2,
    WebkitOverflowScrolling: "touch",
  },

  menuSep: { width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 2px", flex: "0 0 auto" },

  menuChip: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--btn-bg)",
    color: "var(--fg)",
    cursor: "pointer",
    fontWeight: 900,
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  },

  menuChipGhost: {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    cursor: "pointer",
    fontWeight: 900,
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  },

  menuEmpty: { fontSize: 12, color: "var(--muted)", fontWeight: 800, whiteSpace: "nowrap", flex: "0 0 auto" },

  popPos: { position: "absolute", top: 46, left: 8, zIndex: 50 },

  popWrap: {
    width: 300,
    padding: 10,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--panel-bg)",
    boxShadow: "var(--shadow)",
    color: "var(--fg)",
  },

  popHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },

  popNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 18,
    lineHeight: "18px",
  },

  popTitle: { fontWeight: 900, textTransform: "capitalize", fontSize: 14 },

  popWeekdays: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 },
  popWeekday: { textAlign: "center", fontSize: 12, color: "var(--muted)", fontWeight: 900 },

  popGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 },

  popDay: {
    height: 38,
    borderRadius: 12,
    background: "transparent",
    color: "var(--fg)",
    cursor: "pointer",
  },

  hoursHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },

  xBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    cursor: "pointer",
    fontWeight: 900,
  },

  chkRow: { display: "flex", alignItems: "center", gap: 8, fontWeight: 800 },

  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
};
