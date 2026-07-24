import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, Moon, Settings2, RotateCcw, Check, Loader2,
  Square, CheckSquare, BarChart3, CalendarDays, Bot, RefreshCw, Sparkles, BookOpen, LogOut,
  Lock, Send,
} from "lucide-react";
import { COLORS, CATEGORY_ICON, CATEGORY_LABEL, TRACKABLE_CATEGORIES, GlobalStyle } from "./theme.jsx";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { api } from "./api.js";
import { Login } from "./Login.jsx";
import { Signup } from "./Signup.jsx";
import { Locked } from "./Locked.jsx";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WAKE_HOUR = 7; // fixed wake time used to derive sleep blocks
const STUDY_WINDOW = { start: 8 * 60, end: 22 * 60 }; // 08:00–22:00 in minutes

/* ---------------------------------------------------------------------- */
/*  Date helpers                                                           */
/* ---------------------------------------------------------------------- */
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const startOfWeekMonday = (d) => {
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), diff);
};
const fmtShort = (d) => `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
const fmtDayNum = (d) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const minToLabel = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? "AM" : "PM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}${m ? ":" + pad(m) : ""}${period}`;
};
const timeToMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const isHolidayISO = (iso, holidays) =>
  holidays.some((h) => iso >= h.start && iso <= h.end);
const minToHours = (mins) => Math.round((mins / 60) * 10) / 10;
const minToHHMM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/* ---------------------------------------------------------------------- */
/*  Storage                                                                */
/* ---------------------------------------------------------------------- */
const DEFAULT_DATA = {
  onboarded: false,
  profile: { sleepHours: 8, studyHoursPerWeek: 10 },
  term: { start: "", end: "" },
  holidays: [],
  commitments: [],
  activities: [],
  supercurricular: [],
  completions: {},
  sleepLog: [],
};

/* ---------------------------------------------------------------------- */
/*  Scheduling engine                                                      */
/* ---------------------------------------------------------------------- */
function sleepSegments(sleepHours) {
  const bedtime = ((WAKE_HOUR - sleepHours) % 24 + 24) % 24;
  const bedMin = bedtime * 60;
  const wakeMin = WAKE_HOUR * 60;
  if (bedMin < wakeMin) {
    // whole sleep window falls within the same early-morning stretch
    return [{ start: bedMin, end: wakeMin }];
  }
  // wraps across midnight — show the two halves inside this same day column
  return [
    { start: 0, end: wakeMin },
    { start: bedMin, end: 24 * 60 },
  ];
}

function mergeIntervals(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}
function invertWithinWindow(busy, windowStart, windowEnd) {
  const merged = mergeIntervals(busy.filter((b) => b.end > windowStart && b.start < windowEnd));
  const gaps = [];
  let cursor = windowStart;
  for (const b of merged) {
    const s = Math.max(b.start, windowStart);
    const e = Math.min(b.end, windowEnd);
    if (s > cursor) gaps.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });
  return gaps;
}

function generateWeekSchedule(monday, data) {
  const { profile, holidays, commitments, activities = [], supercurricular = [] } = data;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const iso = toISO(date);
    const holiday = isHolidayISO(iso, holidays);
    const blocks = [];

    sleepSegments(profile.sleepHours).forEach((seg, idx) =>
      blocks.push({ ...seg, category: "Sleep", label: "Sleep", id: `sleep-${i}-${idx}` })
    );

    commitments
      .filter((c) => c.day === i)
      .forEach((c) => {
        if (holiday && (c.category === "School" || c.category === "Extracurricular")) return;
        blocks.push({
          start: timeToMin(c.start),
          end: timeToMin(c.end),
          category: c.category,
          label: c.label,
          id: c.id,
        });
      });

    // External activities: recurring weekly on a given day, or one-off on a specific date.
    // Like other extracurricular time, they pause during holiday weeks.
    activities
      .filter((a) => (a.recurring ? a.day === i : a.date === iso))
      .forEach((a) => {
        if (holiday) return;
        blocks.push({
          start: timeToMin(a.start),
          end: timeToMin(a.end),
          category: "Extracurricular",
          label: a.label,
          id: a.id,
        });
      });

    // Supercurricular activity (e.g. wider reading): recurring weekly or one-off, pauses on holidays.
    supercurricular
      .filter((s) => (s.recurring ? s.day === i : s.date === iso))
      .forEach((s) => {
        if (holiday) return;
        blocks.push({
          start: timeToMin(s.start),
          end: timeToMin(s.end),
          category: "Supercurricular",
          label: s.label,
          id: s.id,
        });
      });

    days.push({ date, iso, holiday, blocks });
  }

  // Auto-fill Independent Study across non-holiday days, round-robin, skipped entirely on holidays
  let remaining = Math.round(profile.studyHoursPerWeek * 60);
  const gapQueues = days.map((d) => {
    if (d.holiday) return [];
    const busy = d.blocks.map((b) => ({ start: b.start, end: b.end }));
    return invertWithinWindow(busy, STUDY_WINDOW.start, STUDY_WINDOW.end);
  });
  const CHUNK = 90;
  let guard = 0;
  while (remaining > 0 && guard < 500) {
    guard++;
    let placedAny = false;
    for (let i = 0; i < 7; i++) {
      if (remaining <= 0) break;
      const q = gapQueues[i];
      if (!q.length) continue;
      const gap = q[0];
      const gapLen = gap.end - gap.start;
      const chunk = Math.min(CHUNK, gapLen, remaining);
      if (chunk <= 0) {
        q.shift();
        continue;
      }
      days[i].blocks.push({
        start: gap.start,
        end: gap.start + chunk,
        category: "Independent Study",
        label: "Independent Study",
        id: `study-${i}-${gap.start}`,
      });
      gap.start += chunk;
      if (gap.end - gap.start < 15) q.shift();
      remaining -= chunk;
      placedAny = true;
    }
    if (!placedAny) break;
  }

  days.forEach((d) => d.blocks.sort((a, b) => a.start - b.start));
  return days;
}

/* ---------------------------------------------------------------------- */
/*  Scheduling assistant — finds free slots for a new item                 */
/* ---------------------------------------------------------------------- */
const TIME_WINDOWS = {
  any: { label: "Any time", start: 6 * 60, end: 22 * 60 },
  morning: { label: "Morning", start: 6 * 60, end: 12 * 60 },
  afternoon: { label: "Afternoon", start: 12 * 60, end: 17 * 60 },
  evening: { label: "Evening", start: 17 * 60, end: 22 * 60 },
};

// Weekly slot: sampled against a holiday-free week so a one-off holiday doesn't
// make a normally-busy day look free for an every-week commitment.
function findWeeklySlot(data, durationMin, dayPref, windowKey, excluded) {
  const sampleData = { ...data, holidays: [] };
  const monday = startOfWeekMonday(new Date());
  const days = generateWeekSchedule(monday, sampleData);
  const win = TIME_WINDOWS[windowKey];
  const order = dayPref === "any" ? [0, 1, 2, 3, 4, 5, 6] : [Number(dayPref)];
  for (const i of order) {
    const day = days[i];
    const busy = day.blocks.map((b) => ({ start: b.start, end: b.end }));
    const gaps = invertWithinWindow(busy, win.start, win.end);
    for (const g of gaps) {
      if (g.end - g.start >= durationMin) {
        const start = g.start;
        const key = `${i}-${start}`;
        if (excluded.has(key)) continue;
        return { day: i, start, end: start + durationMin, key };
      }
    }
  }
  return null;
}

// One-off slot: searches real upcoming dates (respecting actual holidays) starting tomorrow.
function findOneTimeSlot(data, durationMin, windowKey, excluded, searchDays = 21) {
  const win = TIME_WINDOWS[windowKey];
  const weekCache = {};
  for (let n = 1; n <= searchDays; n++) {
    const date = addDays(new Date(), n);
    const iso = toISO(date);
    const monday = startOfWeekMonday(date);
    const mondayISO = toISO(monday);
    if (!weekCache[mondayISO]) weekCache[mondayISO] = generateWeekSchedule(monday, data);
    const day = weekCache[mondayISO].find((d) => d.iso === iso);
    if (!day || day.holiday) continue;
    const busy = day.blocks.map((b) => ({ start: b.start, end: b.end }));
    const gaps = invertWithinWindow(busy, win.start, win.end);
    for (const g of gaps) {
      if (g.end - g.start >= durationMin) {
        const start = g.start;
        const key = `${iso}-${start}`;
        if (excluded.has(key)) continue;
        return { date: iso, start, end: start + durationMin, key };
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------------- */
/*  Statistics engine                                                      */
/* ---------------------------------------------------------------------- */
function mondaysCovering(startDate, endDate) {
  const result = [];
  let m = startOfWeekMonday(startDate);
  while (m <= endDate) {
    result.push(m);
    m = addDays(m, 7);
  }
  return result;
}

// Planned minutes per trackable category across [startISO, endISO], generated the same
// way the calendar renders them so holiday pauses etc. stay consistent with what's shown.
function plannedMinutesInRange(data, startISO, endISO) {
  const planned = Object.fromEntries(TRACKABLE_CATEGORIES.map((c) => [c, 0]));
  const weeks = mondaysCovering(fromISO(startISO), fromISO(endISO));
  weeks.forEach((monday) => {
    generateWeekSchedule(monday, data).forEach((day) => {
      if (day.iso < startISO || day.iso > endISO) return;
      day.blocks.forEach((b) => {
        if (TRACKABLE_CATEGORIES.includes(b.category)) planned[b.category] += b.end - b.start;
      });
    });
  });
  return planned;
}

function periodStats(data, startISO, endISO) {
  const planned = plannedMinutesInRange(data, startISO, endISO);
  const completedMinutes = Object.fromEntries(TRACKABLE_CATEGORIES.map((c) => [c, 0]));
  const completedCount = Object.fromEntries(TRACKABLE_CATEGORIES.map((c) => [c, 0]));
  Object.values(data.completions || {}).forEach((c) => {
    if (c.iso < startISO || c.iso > endISO) return;
    if (!TRACKABLE_CATEGORIES.includes(c.category)) return;
    completedMinutes[c.category] += c.minutes;
    completedCount[c.category] += 1;
  });

  const sleepEntries = (data.sleepLog || []).filter((s) => s.date >= startISO && s.date <= endISO);
  const sleepAvg = sleepEntries.length
    ? sleepEntries.reduce((sum, s) => sum + Number(s.hours), 0) / sleepEntries.length
    : null;

  return { planned, completedMinutes, completedCount, sleepEntries, sleepAvg };
}

/* ---------------------------------------------------------------------- */
/*  Schedule Q&A — local pattern-matching, no external API                */
/* ---------------------------------------------------------------------- */
const DAY_WORDS = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
const QUERY_CATEGORIES = ["Independent Study", "Sport", "Supercurricular", "School", "Work"];

function resolveDayFromQuery(q) {
  const today = new Date();
  if (/\btoday\b/.test(q)) return today;
  if (/\btomorrow\b/.test(q)) return addDays(today, 1);
  for (const [name, idx] of Object.entries(DAY_WORDS)) {
    if (q.includes(name)) return addDays(startOfWeekMonday(today), idx);
  }
  return null;
}

function plannedMinutesForCategoryInRange(data, category, startISO, endISO) {
  let total = 0;
  mondaysCovering(fromISO(startISO), fromISO(endISO)).forEach((monday) => {
    generateWeekSchedule(monday, data).forEach((day) => {
      if (day.iso < startISO || day.iso > endISO) return;
      day.blocks.forEach((b) => { if (b.category === category) total += b.end - b.start; });
    });
  });
  return total;
}

function summarizeDay(date, data) {
  const days = generateWeekSchedule(startOfWeekMonday(date), data);
  const day = days.find((d) => d.iso === toISO(date));
  if (!day) return "I couldn't find that day.";
  const lines = day.blocks.filter((b) => b.category !== "Sleep");
  if (lines.length === 0) return `Nothing scheduled on ${fmtDayNum(date)}${day.holiday ? " (holiday)" : ""} besides sleep.`;
  const list = lines.map((b) => `${b.label} (${minToLabel(b.start)}–${minToLabel(b.end)})`).join(", ");
  return `On ${fmtDayNum(date)}${day.holiday ? " (holiday)" : ""}: ${list}.`;
}

function answerScheduleQuery(rawQuery, data) {
  const q = rawQuery.toLowerCase().trim();
  if (!q) return "Ask me something like \"what's on Monday\" or \"how much sport this week\".";

  if (/holiday/.test(q)) {
    const todayISO = toISO(new Date());
    const upcoming = [...(data.holidays || [])].sort((a, b) => (a.start < b.start ? -1 : 1)).find((h) => h.end >= todayISO);
    if (!upcoming) return "You don't have any holidays added yet — add one in Manage.";
    return upcoming.start <= todayISO
      ? `You're currently on ${upcoming.label}, until ${upcoming.end}.`
      : `Your next holiday is ${upcoming.label}, from ${upcoming.start} to ${upcoming.end}.`;
  }

  if (/(free|gap|available)/.test(q)) {
    const date = resolveDayFromQuery(q) || new Date();
    const days = generateWeekSchedule(startOfWeekMonday(date), data);
    const day = days.find((d) => d.iso === toISO(date));
    const busy = day.blocks.map((b) => ({ start: b.start, end: b.end }));
    const gaps = invertWithinWindow(busy, 8 * 60, 22 * 60).filter((g) => g.end - g.start >= 15);
    if (!gaps.length) return `You're fully booked on ${fmtDayNum(date)} between 8am and 10pm.`;
    return `Free time on ${fmtDayNum(date)}: ${gaps.map((g) => `${minToLabel(g.start)}–${minToLabel(g.end)}`).join(", ")}.`;
  }

  if (/(how much|how many|hours)/.test(q) && /sleep/.test(q)) {
    const isMonth = /month/.test(q);
    const today = new Date();
    const start = isMonth ? new Date(today.getFullYear(), today.getMonth(), 1) : startOfWeekMonday(today);
    const end = isMonth ? new Date(today.getFullYear(), today.getMonth() + 1, 0) : addDays(start, 6);
    const startISO = toISO(start), endISO = toISO(end);
    const entries = (data.sleepLog || []).filter((s) => s.date >= startISO && s.date <= endISO);
    if (!entries.length) return `No sleep logged ${isMonth ? "this month" : "this week"} yet.`;
    const avg = entries.reduce((sum, e) => sum + Number(e.hours), 0) / entries.length;
    return `You've averaged ${minToHours(avg * 60)}h of sleep ${isMonth ? "this month" : "this week"}, across ${entries.length} night${entries.length === 1 ? "" : "s"}.`;
  }

  const catMatch = QUERY_CATEGORIES.find((c) => q.includes(c.toLowerCase()));
  if (catMatch && /(how much|how many|hours)/.test(q)) {
    const isMonth = /month/.test(q);
    const today = new Date();
    const start = isMonth ? new Date(today.getFullYear(), today.getMonth(), 1) : startOfWeekMonday(today);
    const end = isMonth ? new Date(today.getFullYear(), today.getMonth() + 1, 0) : addDays(start, 6);
    const startISO = toISO(start), endISO = toISO(end);
    const plannedMin = plannedMinutesForCategoryInRange(data, catMatch, startISO, endISO);
    const period = isMonth ? "this month" : "this week";
    if (TRACKABLE_CATEGORIES.includes(catMatch)) {
      const completedMin = Object.values(data.completions || {})
        .filter((c) => c.category === catMatch && c.iso >= startISO && c.iso <= endISO)
        .reduce((sum, c) => sum + c.minutes, 0);
      return `${catMatch} ${period}: ${minToHours(plannedMin)}h scheduled, ${minToHours(completedMin)}h ticked off.`;
    }
    return `${catMatch} ${period}: ${minToHours(plannedMin)}h scheduled.`;
  }

  const date = resolveDayFromQuery(q);
  if (date) return summarizeDay(date, data);

  return "I can help with things like: \"what's on Monday\", \"how much sport this week\", \"when's my next holiday\", \"free time Wednesday\", or \"how much sleep this week\".";
}

/* ---------------------------------------------------------------------- */
/*  Small UI atoms                                                         */
/* ---------------------------------------------------------------------- */
function Loading() {
  return (
    <div className="ss-root" style={{
      minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center",
      background: COLORS.ink, color: COLORS.textMuted, borderRadius: 16,
    }}>
      <GlobalStyle />
      <Loader2 size={22} className="ss-mono" style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ marginLeft: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
        loading your week…
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Onboarding                                                             */
/* ---------------------------------------------------------------------- */
function Onboarding({ initial, onFinish }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(initial.profile);
  const [term, setTerm] = useState(initial.term);
  const [holidays, setHolidays] = useState(initial.holidays);
  const [commitments, setCommitments] = useState(initial.commitments);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [hForm, setHForm] = useState({ label: "", start: "", end: "" });
  const [cForm, setCForm] = useState({ label: "", category: "School", day: 0, start: "09:00", end: "10:00" });

  const steps = [
    "Sleep",
    "Term dates",
    "Holidays",
    "Fixed commitments",
    "Study target",
    "Review",
  ];

  const addHoliday = () => {
    if (!hForm.label || !hForm.start || !hForm.end) return;
    setHolidays((h) => [...h, { ...hForm, id: `h-${Date.now()}` }]);
    setHForm({ label: "", start: "", end: "" });
  };
  const addCommitment = () => {
    if (!cForm.label || !cForm.start || !cForm.end) return;
    setCommitments((c) => [...c, { ...cForm, day: Number(cForm.day), id: `c-${Date.now()}` }]);
    setCForm({ label: "", category: "School", day: 0, start: "09:00", end: "10:00" });
  };

  const canNext = () => {
    if (step === 0) return profile.sleepHours >= 4 && profile.sleepHours <= 12;
    if (step === 1) return term.start && term.end && term.start < term.end;
    return true;
  };

  const finish = async () => {
    setSaving(true);
    setError("");
    const data = { onboarded: true, profile, term, holidays, commitments };
    try {
      await api.saveData(data);
      onFinish(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ss-root" style={{
      background: COLORS.paper, borderRadius: 20, padding: "36px 40px", maxWidth: 640,
      margin: "0 auto", boxShadow: "0 20px 50px rgba(0,0,0,.35)",
    }}>
      <GlobalStyle />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 className="ss-display" style={{ fontSize: 28, fontWeight: 600, color: COLORS.textDark, margin: 0 }}>
          Let's set up your week
        </h1>
        <span className="ss-mono" style={{ fontSize: 12, color: "#8B8368" }}>
          {step + 1} / {steps.length}
        </span>
      </div>
      <p style={{ color: "#6b6650", fontSize: 14, marginTop: 4, marginBottom: 24 }}>
        Answer a few quick questions so your schedule reflects your real term, holidays, and classes.
      </p>

      {/* progress */}
      <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i <= step ? COLORS.School : "#E2DBC4",
          }} />
        ))}
      </div>

      {/* STEP 0: sleep */}
      {step === 0 && (
        <div>
          <h3 style={{ margin: "0 0 6px", color: COLORS.textDark }}>How much sleep do you aim for?</h3>
          <p style={{ color: "#6b6650", fontSize: 13, marginBottom: 14 }}>
            Protecting rest is the foundation of a focused week. We'll build sleep blocks around a 7:00am wake time.
          </p>
          <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>Sleep hours per night</label>
          <select
            className="ss-input" style={{ marginTop: 6 }}
            value={profile.sleepHours}
            onChange={(e) => setProfile((p) => ({ ...p, sleepHours: Number(e.target.value) }))}
          >
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n} hours</option>
            ))}
          </select>
        </div>
      )}

      {/* STEP 1: term dates */}
      {step === 1 && (
        <div>
          <h3 style={{ margin: "0 0 6px", color: COLORS.textDark }}>When does your term run?</h3>
          <p style={{ color: "#6b6650", fontSize: 13, marginBottom: 14 }}>
            This anchors your holiday periods and lets us show you where you are in the term.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>Term start</label>
              <input type="date" className="ss-input" style={{ marginTop: 6 }}
                value={term.start} onChange={(e) => setTerm((t) => ({ ...t, start: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>Term end</label>
              <input type="date" className="ss-input" style={{ marginTop: 6 }}
                value={term.end} onChange={(e) => setTerm((t) => ({ ...t, end: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: holidays */}
      {step === 2 && (
        <div>
          <h3 style={{ margin: "0 0 6px", color: COLORS.textDark }}>Holiday periods</h3>
          <p style={{ color: "#6b6650", fontSize: 13, marginBottom: 14 }}>
            Add any breaks when school, extracurriculars, and study blocks should pause. Sport, work and sleep continue as normal.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input className="ss-input" placeholder="e.g. Half term" style={{ flex: "1 1 140px" }}
              value={hForm.label} onChange={(e) => setHForm((f) => ({ ...f, label: e.target.value }))} />
            <input type="date" className="ss-input" style={{ flex: "1 1 130px" }}
              value={hForm.start} onChange={(e) => setHForm((f) => ({ ...f, start: e.target.value }))} />
            <input type="date" className="ss-input" style={{ flex: "1 1 130px" }}
              value={hForm.end} onChange={(e) => setHForm((f) => ({ ...f, end: e.target.value }))} />
            <button className="ss-btn-primary" onClick={addHoliday}><Plus size={15} />Add</button>
          </div>
          {holidays.length === 0 && <p style={{ fontSize: 13, color: "#9a927a" }}>No holidays added yet.</p>}
          {holidays.map((h) => (
            <div key={h.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#fff", border: "1px solid #E2DBC4", borderRadius: 8, padding: "9px 12px", marginBottom: 6,
            }}>
              <span style={{ fontSize: 13, color: COLORS.textDark }}>
                <strong>{h.label}</strong> · {h.start} → {h.end}
              </span>
              <X size={16} style={{ cursor: "pointer", color: "#9a927a" }}
                onClick={() => setHolidays((list) => list.filter((x) => x.id !== h.id))} />
            </div>
          ))}
        </div>
      )}

      {/* STEP 3: commitments */}
      {step === 3 && (
        <div>
          <h3 style={{ margin: "0 0 6px", color: COLORS.textDark }}>Add your fixed commitments</h3>
          <p style={{ color: "#6b6650", fontSize: 13, marginBottom: 14 }}>
            Classes and work shifts — anything that repeats weekly at a fixed time. You can add recurring sports
            and external activities afterwards from Manage.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="ss-input" placeholder="e.g. Organic Chemistry" style={{ flex: "1 1 160px" }}
              value={cForm.label} onChange={(e) => setCForm((f) => ({ ...f, label: e.target.value }))} />
            <select className="ss-input" style={{ flex: "1 1 130px" }}
              value={cForm.category} onChange={(e) => setCForm((f) => ({ ...f, category: e.target.value }))}>
              {["School", "Work"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <select className="ss-input" style={{ flex: "1 1 120px" }}
              value={cForm.day} onChange={(e) => setCForm((f) => ({ ...f, day: e.target.value }))}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="time" className="ss-input" value={cForm.start}
              onChange={(e) => setCForm((f) => ({ ...f, start: e.target.value }))} />
            <input type="time" className="ss-input" value={cForm.end}
              onChange={(e) => setCForm((f) => ({ ...f, end: e.target.value }))} />
            <button className="ss-btn-primary" onClick={addCommitment} style={{ whiteSpace: "nowrap" }}>
              <Plus size={15} />Add
            </button>
          </div>
          {commitments.length === 0 && <p style={{ fontSize: 13, color: "#9a927a" }}>No commitments added yet.</p>}
          <div style={{ maxHeight: 180, overflowY: "auto" }} className="ss-scroll">
            {commitments.map((c) => (
              <div key={c.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#fff", border: "1px solid #E2DBC4", borderRadius: 8, padding: "9px 12px", marginBottom: 6,
              }}>
                <span style={{ fontSize: 13, color: COLORS.textDark }}>
                  <strong>{c.label}</strong> · {c.category} · {DAY_SHORT[c.day]} {c.start}–{c.end}
                </span>
                <X size={16} style={{ cursor: "pointer", color: "#9a927a" }}
                  onClick={() => setCommitments((list) => list.filter((x) => x.id !== c.id))} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 4: study target */}
      {step === 4 && (
        <div>
          <h3 style={{ margin: "0 0 6px", color: COLORS.textDark }}>Independent study target</h3>
          <p style={{ color: "#6b6650", fontSize: 13, marginBottom: 14 }}>
            We'll automatically slot study blocks into your free daytime hours to hit this weekly total — skipped entirely during holidays.
          </p>
          <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textDark }}>Hours per week</label>
          <input type="number" min={0} max={40} className="ss-input" style={{ marginTop: 6 }}
            value={profile.studyHoursPerWeek}
            onChange={(e) => setProfile((p) => ({ ...p, studyHoursPerWeek: Number(e.target.value) }))} />
        </div>
      )}

      {/* STEP 5: review */}
      {step === 5 && (
        <div>
          <h3 style={{ margin: "0 0 14px", color: COLORS.textDark }}>Review your setup</h3>
          {[
            ["Sleep", `${profile.sleepHours} hours / night, wake at 7:00am`],
            ["Term", `${term.start} → ${term.end}`],
            ["Holidays", holidays.length ? holidays.map((h) => h.label).join(", ") : "None"],
            ["Commitments", commitments.length ? `${commitments.length} recurring items` : "None"],
            ["Independent study", `${profile.studyHoursPerWeek} hours / week (auto-scheduled)`],
          ].map(([k, v]) => (
            <div key={k} style={{
              display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #E2DBC4",
            }}>
              <span style={{ fontSize: 13, color: "#8B8368", fontWeight: 600 }}>{k}</span>
              <span style={{ fontSize: 13, color: COLORS.textDark, textAlign: "right", maxWidth: 320 }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: COLORS.Work, fontSize: 13, marginTop: 0, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
        <button className="ss-btn-ghost" style={{ visibility: step === 0 ? "hidden" : "visible" }}
          onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < steps.length - 1 ? (
          <button className="ss-btn-primary" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>Next</button>
        ) : (
          <button className="ss-btn-primary" disabled={saving} onClick={finish}>
            {saving ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={15} />}
            Confirm & generate calendar
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Term thermometer (signature element)                                  */
/* ---------------------------------------------------------------------- */
function TermThermometer({ term, holidays, weekMonday }) {
  if (!term.start || !term.end) return null;
  const start = fromISO(term.start).getTime();
  const end = fromISO(term.end).getTime();
  const total = Math.max(1, end - start);
  const pct = (d) => Math.min(100, Math.max(0, ((d.getTime() - start) / total) * 100));
  const weekPct = pct(weekMonday);
  const weekEndPct = pct(addDays(weekMonday, 6));

  return (
    <div style={{ marginTop: 18 }}>
      <div className="ss-mono" style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: .5, marginBottom: 6 }}>
        TERM PROGRESS · {fmtDayNum(fromISO(term.start))} — {fmtDayNum(fromISO(term.end))}
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 6, background: COLORS.panelSoft, overflow: "hidden" }}>
        {holidays.map((h) => {
          const hs = pct(fromISO(h.start));
          const he = pct(fromISO(h.end));
          return (
            <div key={h.id} title={h.label} style={{
              position: "absolute", left: `${hs}%`, width: `${Math.max(he - hs, 0.6)}%`, top: 0, bottom: 0,
              background: "repeating-linear-gradient(45deg, #4a5170 0 4px, #3a415e 4px 8px)",
            }} />
          );
        })}
        <div style={{
          position: "absolute", left: `${weekPct}%`, width: `${Math.max(weekEndPct - weekPct, 1.2)}%`,
          top: 0, bottom: 0, background: COLORS["Independent Study"], borderRadius: 4,
          boxShadow: `0 0 10px ${COLORS["Independent Study"]}88`,
        }} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Calendar grid                                                          */
/* ---------------------------------------------------------------------- */
const GRID_START = 0;    // 00:00
const GRID_END = 24 * 60; // 24:00
const ROW_PX = 26; // px per hour
const gridHeight = ((GRID_END - GRID_START) / 60) * ROW_PX;

function CalendarGrid({ weekDays, completions, onToggleComplete }) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayISO = toISO(now);

  return (
    <div style={{ display: "flex", border: `1px solid ${COLORS.hair}`, borderRadius: 14, overflow: "hidden" }}>
      {/* hour ruler */}
      <div style={{ width: 52, background: COLORS.panel, position: "relative", flexShrink: 0 }}>
        <div style={{ height: 46, borderBottom: `1px solid ${COLORS.hair}` }} />
        <div style={{ position: "relative", height: gridHeight }}>
          {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
            <div key={h} className="ss-mono" style={{
              position: "absolute", top: (h * 60 / 60) * ROW_PX - 6, right: 8,
              fontSize: 10, color: COLORS.textMuted,
            }}>
              {h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
            </div>
          ))}
        </div>
      </div>

      {/* day columns */}
      {weekDays.map((day, i) => (
        <div key={i} style={{
          flex: 1, minWidth: 0, borderLeft: `1px solid ${COLORS.hair}`,
          background: day.holiday ? "#1a2032" : COLORS.panel,
        }}>
          <div style={{
            height: 46, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            borderBottom: `1px solid ${COLORS.hair}`,
            background: day.iso === todayISO ? "#242c46" : "transparent",
          }}>
            <span className="ss-mono" style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1 }}>
              {DAY_SHORT[i]}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: day.holiday ? COLORS["Independent Study"] : COLORS.textLight }}>
              {fmtDayNum(day.date)}
            </span>
          </div>
          <div style={{ position: "relative", height: gridHeight }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{
                position: "absolute", top: h * ROW_PX, left: 0, right: 0, height: 1,
                background: h % 2 === 0 ? COLORS.hair : "transparent", opacity: .5,
              }} />
            ))}
            {day.iso === todayISO && (
              <div style={{
                position: "absolute", top: (nowMin / 60) * ROW_PX, left: 0, right: 0, height: 2,
                background: "#ff5e5e", zIndex: 5,
              }} />
            )}
            {day.blocks.map((b) => {
              const top = (b.start / 60) * ROW_PX;
              const height = Math.max(((b.end - b.start) / 60) * ROW_PX, 14);
              const color = COLORS[b.category] || COLORS.School;
              const Icon = CATEGORY_ICON[b.category] || BookOpen;
              const trackable = TRACKABLE_CATEGORIES.includes(b.category) && day.iso <= todayISO;
              const isDone = trackable && !!completions[`${day.iso}__${b.id}`];
              return (
                <div key={b.id} title={`${b.label} · ${minToLabel(b.start)}–${minToLabel(b.end)}`} style={{
                  position: "absolute", top, height, left: 3, right: 3,
                  background: `${color}26`, borderLeft: `3px solid ${color}`,
                  borderRadius: 5, padding: "3px 6px", overflow: "hidden",
                  opacity: isDone ? 0.55 : 1,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      <Icon size={10} color={color} style={{ flexShrink: 0 }} />
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: COLORS.textLight,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        textDecoration: isDone ? "line-through" : "none",
                      }}>{b.label}</span>
                    </div>
                    {trackable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleComplete(day.iso, b); }}
                        title={isDone ? "Mark as not done" : "Mark as done"}
                        style={{
                          flexShrink: 0, background: "none", border: "none", padding: 0,
                          display: "flex", cursor: "pointer", color: isDone ? color : COLORS.textMuted,
                        }}
                      >
                        {isDone ? <CheckSquare size={12} /> : <Square size={12} />}
                      </button>
                    )}
                  </div>
                  {height > 30 && (
                    <div className="ss-mono" style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>
                      {minToLabel(b.start)}–{minToLabel(b.end)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Scheduling assistant                                                   */
/* ---------------------------------------------------------------------- */
const ASSISTANT_ID_PREFIX = { Sport: "sport", Extracurricular: "act", Supercurricular: "sc" };

function SchedulingAssistant({ data, category, onConfirm, onClose }) {
  const supportsOneTime = category !== "Sport";
  const color = COLORS[category];
  const Icon = CATEGORY_ICON[category];
  const categoryLabel = CATEGORY_LABEL[category] || category;

  const [form, setForm] = useState({ label: "", durationMin: 60, recurrence: "weekly", day: "any", window: "any" });
  const [candidate, setCandidate] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [excluded, setExcluded] = useState(() => new Set());

  const search = (excludeSet) => {
    const durationMin = Number(form.durationMin);
    const result = form.recurrence === "weekly"
      ? findWeeklySlot(data, durationMin, form.day, form.window, excludeSet)
      : findOneTimeSlot(data, durationMin, form.window, excludeSet);
    if (result) {
      setCandidate(result);
      setNotFound(false);
      setExcluded(new Set([...excludeSet, result.key]));
    } else {
      setCandidate(null);
      setNotFound(true);
    }
  };

  const findTime = () => {
    if (!form.label.trim()) return;
    setExcluded(new Set());
    search(new Set());
  };
  const tryAnother = () => search(excluded);

  const confirm = () => {
    if (!candidate) return;
    const base = {
      label: form.label.trim(),
      start: minToHHMM(candidate.start),
      end: minToHHMM(candidate.end),
      id: `${ASSISTANT_ID_PREFIX[category]}-${Date.now()}`,
    };
    const item = form.recurrence === "weekly"
      ? (category === "Sport"
        ? { ...base, category: "Sport", day: candidate.day }
        : { ...base, recurring: true, day: candidate.day, date: null })
      : { ...base, recurring: false, day: null, date: candidate.date };
    onConfirm(item);
    onClose();
  };

  const durationLabel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,12,20,.6)", zIndex: 60,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="ss-root" style={{
        background: COLORS.paper, borderRadius: 18, padding: 28, width: "min(460px, 100%)",
        maxHeight: "88vh", overflowY: "auto",
      }}>
        <GlobalStyle />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 className="ss-display" style={{ margin: 0, color: COLORS.textDark, display: "flex", alignItems: "center", gap: 8, fontSize: 20 }}>
            <Bot size={19} />Scheduling assistant
          </h2>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 999, background: color, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bot size={14} color="#fff" />
          </div>
          <div style={{
            background: "#fff", border: "1px solid #E2DBC4", borderRadius: "4px 12px 12px 12px",
            padding: "10px 12px", fontSize: 13, color: COLORS.textDark,
          }}>
            Tell me what you'd like to add as {category === "Extracurricular" ? "an external activity" : `a ${categoryLabel.toLowerCase()}`}, and I'll find a free slot for it.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <input className="ss-input" placeholder="e.g. Wider reading" value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="ss-input" style={{ flex: "1 1 100px" }} value={form.durationMin}
              onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))}>
              {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
            </select>
            {supportsOneTime && (
              <select className="ss-input" style={{ flex: "1 1 100px" }} value={form.recurrence}
                onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}>
                <option value="weekly">Weekly</option>
                <option value="once">One-time</option>
              </select>
            )}
            <select className="ss-input" style={{ flex: "1 1 100px" }} value={form.window}
              onChange={(e) => setForm((f) => ({ ...f, window: e.target.value }))}>
              {Object.entries(TIME_WINDOWS).map(([k, w]) => <option key={k} value={k}>{w.label}</option>)}
            </select>
            {form.recurrence === "weekly" && (
              <select className="ss-input" style={{ flex: "1 1 100px" }} value={form.day}
                onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}>
                <option value="any">Any day</option>
                {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            )}
          </div>
          <button className="ss-btn-primary" onClick={findTime} disabled={!form.label.trim()} style={{ alignSelf: "flex-start" }}>
            <Sparkles size={14} />Find a time
          </button>
        </div>

        {candidate && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 999, background: color, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bot size={14} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                background: "#fff", border: "1px solid #E2DBC4", borderRadius: "4px 12px 12px 12px",
                padding: "10px 12px", fontSize: 13, color: COLORS.textDark, marginBottom: 8,
              }}>
                How about this?
              </div>
              <div style={{
                background: `${color}15`, border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`,
                borderRadius: 8, padding: "10px 12px", marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: COLORS.textDark, fontSize: 14 }}>
                  <Icon size={14} color={color} />{form.label}
                </div>
                <div className="ss-mono" style={{ fontSize: 12, color: "#6b6650", marginTop: 4 }}>
                  {form.recurrence === "weekly" ? `Weekly · ${DAY_NAMES[candidate.day]}` : fmtDayNum(fromISO(candidate.date))}
                  {" · "}{minToLabel(candidate.start)}–{minToLabel(candidate.end)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="ss-btn-ghost" onClick={tryAnother}>
                  <RefreshCw size={13} style={{ marginRight: 6, verticalAlign: -2 }} />Try another time
                </button>
                <button className="ss-btn-primary" onClick={confirm}>
                  <Check size={14} />Confirm & add
                </button>
              </div>
            </div>
          </div>
        )}

        {notFound && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 999, background: COLORS.Work, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bot size={14} color="#fff" />
            </div>
            <div style={{
              background: "#fff", border: "1px solid #E2DBC4", borderRadius: "4px 12px 12px 12px",
              padding: "10px 12px", fontSize: 13, color: COLORS.textDark,
            }}>
              I couldn't find a free slot that fits — try a shorter duration, a different time of day, or add it manually instead.
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="ss-btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Manage panel (edit commitments / holidays post-onboarding)             */
/* ---------------------------------------------------------------------- */
const commitmentLabel = (c) => <>{c.category} · {DAY_SHORT[c.day]} {c.start}–{c.end}</>;
const sportLabel = (c) => <>Weekly · {DAY_SHORT[c.day]} {c.start}–{c.end}</>;
const activityLabel = (a) => <>{a.recurring ? `Weekly · ${DAY_SHORT[a.day]}` : a.date} · {a.start}–{a.end}</>;
const holidayLabel = (h) => <>{h.start} → {h.end}</>;

// Memoized so typing in an unrelated form field (all of ManagePanel's form state lives in
// one component) doesn't force every list to re-render — only when `items` itself changes.
const ManageList = React.memo(function ManageList({ items, renderLabel, onDelete, emptyText }) {
  if (items.length === 0) return <p style={{ fontSize: 13, color: "#9a927a" }}>{emptyText}</p>;
  return items.map((item) => (
    <div key={item.id} style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "#fff", border: "1px solid #E2DBC4", borderRadius: 8, padding: "8px 12px", marginBottom: 6,
    }}>
      <span style={{ fontSize: 13, color: COLORS.textDark }}>
        <strong>{item.label}</strong> · {renderLabel(item)}
      </span>
      <X size={16} style={{ cursor: "pointer", color: "#9a927a", flexShrink: 0 }} onClick={() => onDelete(item.id)} />
    </div>
  ));
});
function ManagePanel({ data, onChange, onClose }) {
  const [commitments, setCommitments] = useState(data.commitments);
  const [activities, setActivities] = useState(data.activities || []);
  const [supercurricular, setSupercurricular] = useState(data.supercurricular || []);
  const [holidays, setHolidays] = useState(data.holidays);
  const [cForm, setCForm] = useState({ label: "", category: "School", day: 0, start: "09:00", end: "10:00" });
  const [sForm, setSForm] = useState({ label: "", day: 0, start: "17:00", end: "18:00" });
  const [aForm, setAForm] = useState({ label: "", recurring: true, day: 0, date: "", start: "09:00", end: "10:00" });
  const [scForm, setScForm] = useState({ label: "", recurring: true, day: 0, date: "", start: "19:00", end: "20:00" });
  const [hForm, setHForm] = useState({ label: "", start: "", end: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [assistantFor, setAssistantFor] = useState(null);

  const handleAssistantConfirm = (item) => {
    if (assistantFor === "Sport") setCommitments((c) => [...c, item]);
    else if (assistantFor === "Extracurricular") setActivities((a) => [...a, item]);
    else if (assistantFor === "Supercurricular") setSupercurricular((s) => [...s, item]);
  };

  // Memoized so these arrays only get new references when the underlying list actually
  // changes — otherwise every keystroke in any form field (all state lives in this one
  // component) would re-filter and re-render every list, which gets slow with a lot of items.
  const fixedCommitments = useMemo(() => commitments.filter((c) => c.category !== "Sport"), [commitments]);
  const sports = useMemo(() => commitments.filter((c) => c.category === "Sport"), [commitments]);

  const deleteCommitment = useCallback((id) => setCommitments((list) => list.filter((x) => x.id !== id)), []);
  const deleteActivity = useCallback((id) => setActivities((list) => list.filter((x) => x.id !== id)), []);
  const deleteSupercurricular = useCallback((id) => setSupercurricular((list) => list.filter((x) => x.id !== id)), []);
  const deleteHoliday = useCallback((id) => setHolidays((list) => list.filter((x) => x.id !== id)), []);

  const addCommitment = () => {
    if (!cForm.label || !cForm.start || !cForm.end) return;
    setCommitments((c) => [...c, { ...cForm, day: Number(cForm.day), id: `c-${Date.now()}` }]);
    setCForm({ label: "", category: "School", day: 0, start: "09:00", end: "10:00" });
  };
  const addSport = () => {
    if (!sForm.label || !sForm.start || !sForm.end) return;
    setCommitments((c) => [
      ...c,
      { ...sForm, category: "Sport", day: Number(sForm.day), id: `sport-${Date.now()}` },
    ]);
    setSForm({ label: "", day: 0, start: "17:00", end: "18:00" });
  };
  const addActivity = () => {
    if (!aForm.label || !aForm.start || !aForm.end) return;
    if (aForm.recurring) {
      setActivities((a) => [
        ...a,
        { label: aForm.label, recurring: true, day: Number(aForm.day), date: null, start: aForm.start, end: aForm.end, id: `act-${Date.now()}` },
      ]);
    } else {
      if (!aForm.date) return;
      setActivities((a) => [
        ...a,
        { label: aForm.label, recurring: false, day: null, date: aForm.date, start: aForm.start, end: aForm.end, id: `act-${Date.now()}` },
      ]);
    }
    setAForm({ label: "", recurring: true, day: 0, date: "", start: "09:00", end: "10:00" });
  };
  const addSupercurricular = () => {
    if (!scForm.label || !scForm.start || !scForm.end) return;
    if (scForm.recurring) {
      setSupercurricular((s) => [
        ...s,
        { label: scForm.label, recurring: true, day: Number(scForm.day), date: null, start: scForm.start, end: scForm.end, id: `sc-${Date.now()}` },
      ]);
    } else {
      if (!scForm.date) return;
      setSupercurricular((s) => [
        ...s,
        { label: scForm.label, recurring: false, day: null, date: scForm.date, start: scForm.start, end: scForm.end, id: `sc-${Date.now()}` },
      ]);
    }
    setScForm({ label: "", recurring: true, day: 0, date: "", start: "19:00", end: "20:00" });
  };
  const addHoliday = () => {
    if (!hForm.label || !hForm.start || !hForm.end) return;
    setHolidays((h) => [...h, { ...hForm, id: `h-${Date.now()}` }]);
    setHForm({ label: "", start: "", end: "" });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const next = { ...data, commitments, activities, supercurricular, holidays };
    try {
      await api.saveData(next);
      onChange(next);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,12,20,.6)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="ss-root" style={{
        background: COLORS.paper, borderRadius: 18, padding: 32, width: "min(680px, 100%)",
        maxHeight: "88vh", overflowY: "auto",
      }}>
        <GlobalStyle />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 className="ss-display" style={{ margin: 0, color: COLORS.textDark }}>Manage your setup</h2>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        <h4 style={{ color: COLORS.textDark, marginBottom: 8 }}>Fixed commitments</h4>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input className="ss-input" placeholder="Label" style={{ flex: "1 1 140px" }}
            value={cForm.label} onChange={(e) => setCForm((f) => ({ ...f, label: e.target.value }))} />
          <select className="ss-input" style={{ flex: "1 1 120px" }}
            value={cForm.category} onChange={(e) => setCForm((f) => ({ ...f, category: e.target.value }))}>
            {["School", "Work"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="ss-input" style={{ flex: "1 1 110px" }}
            value={cForm.day} onChange={(e) => setCForm((f) => ({ ...f, day: e.target.value }))}>
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <input type="time" className="ss-input" style={{ flex: "1 1 90px" }} value={cForm.start}
            onChange={(e) => setCForm((f) => ({ ...f, start: e.target.value }))} />
          <input type="time" className="ss-input" style={{ flex: "1 1 90px" }} value={cForm.end}
            onChange={(e) => setCForm((f) => ({ ...f, end: e.target.value }))} />
          <button className="ss-btn-primary" onClick={addCommitment}><Plus size={15} /></button>
        </div>
        <div style={{ maxHeight: 140, overflowY: "auto", marginBottom: 20 }} className="ss-scroll">
          <ManageList items={fixedCommitments} renderLabel={commitmentLabel} onDelete={deleteCommitment} emptyText="No commitments added yet." />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ color: COLORS.textDark, marginBottom: 8 }}>Recurring sports</h4>
          <button className="ss-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setAssistantFor("Sport")}>
            <Sparkles size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Ask assistant
          </button>
        </div>
        <p style={{ color: "#6b6650", fontSize: 13, marginTop: 0, marginBottom: 10 }}>
          Sessions that happen the same day and time every week. They continue through holidays.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input className="ss-input" placeholder="e.g. Swim training" style={{ flex: "1 1 160px" }}
            value={sForm.label} onChange={(e) => setSForm((f) => ({ ...f, label: e.target.value }))} />
          <select className="ss-input" style={{ flex: "1 1 120px" }}
            value={sForm.day} onChange={(e) => setSForm((f) => ({ ...f, day: e.target.value }))}>
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <input type="time" className="ss-input" style={{ flex: "1 1 90px" }} value={sForm.start}
            onChange={(e) => setSForm((f) => ({ ...f, start: e.target.value }))} />
          <input type="time" className="ss-input" style={{ flex: "1 1 90px" }} value={sForm.end}
            onChange={(e) => setSForm((f) => ({ ...f, end: e.target.value }))} />
          <button className="ss-btn-primary" onClick={addSport}><Plus size={15} /></button>
        </div>
        <div style={{ maxHeight: 140, overflowY: "auto", marginBottom: 20 }} className="ss-scroll">
          <ManageList items={sports} renderLabel={sportLabel} onDelete={deleteCommitment} emptyText="No recurring sports added yet." />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ color: COLORS.textDark, marginBottom: 8 }}>External activities</h4>
          <button className="ss-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setAssistantFor("Extracurricular")}>
            <Sparkles size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Ask assistant
          </button>
        </div>
        <p style={{ color: "#6b6650", fontSize: 13, marginTop: 0, marginBottom: 10 }}>
          Anything outside school, work and sport — weekly or just once. These pause during holiday weeks.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input className="ss-input" placeholder="e.g. Volunteering" style={{ flex: "1 1 160px" }}
            value={aForm.label} onChange={(e) => setAForm((f) => ({ ...f, label: e.target.value }))} />
          <select className="ss-input" style={{ flex: "1 1 120px" }}
            value={aForm.recurring ? "recurring" : "once"}
            onChange={(e) => setAForm((f) => ({ ...f, recurring: e.target.value === "recurring" }))}>
            <option value="recurring">Weekly</option>
            <option value="once">One-time</option>
          </select>
          {aForm.recurring ? (
            <select className="ss-input" style={{ flex: "1 1 120px" }}
              value={aForm.day} onChange={(e) => setAForm((f) => ({ ...f, day: e.target.value }))}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          ) : (
            <input type="date" className="ss-input" style={{ flex: "1 1 140px" }} value={aForm.date}
              onChange={(e) => setAForm((f) => ({ ...f, date: e.target.value }))} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="time" className="ss-input" value={aForm.start}
            onChange={(e) => setAForm((f) => ({ ...f, start: e.target.value }))} />
          <input type="time" className="ss-input" value={aForm.end}
            onChange={(e) => setAForm((f) => ({ ...f, end: e.target.value }))} />
          <button className="ss-btn-primary" onClick={addActivity} style={{ whiteSpace: "nowrap" }}>
            <Plus size={15} />Add
          </button>
        </div>
        <div style={{ maxHeight: 140, overflowY: "auto", marginBottom: 20 }} className="ss-scroll">
          <ManageList items={activities} renderLabel={activityLabel} onDelete={deleteActivity} emptyText="No external activities added yet." />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h4 style={{ color: COLORS.textDark, marginBottom: 8 }}>Supercurricular activity</h4>
          <button className="ss-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setAssistantFor("Supercurricular")}>
            <Sparkles size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Ask assistant
          </button>
        </div>
        <p style={{ color: "#6b6650", fontSize: 13, marginTop: 0, marginBottom: 10 }}>
          Wider reading and subject enrichment, beyond the syllabus — weekly or just once. Pauses during holiday weeks.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input className="ss-input" placeholder="e.g. Wider reading" style={{ flex: "1 1 160px" }}
            value={scForm.label} onChange={(e) => setScForm((f) => ({ ...f, label: e.target.value }))} />
          <select className="ss-input" style={{ flex: "1 1 120px" }}
            value={scForm.recurring ? "recurring" : "once"}
            onChange={(e) => setScForm((f) => ({ ...f, recurring: e.target.value === "recurring" }))}>
            <option value="recurring">Weekly</option>
            <option value="once">One-time</option>
          </select>
          {scForm.recurring ? (
            <select className="ss-input" style={{ flex: "1 1 120px" }}
              value={scForm.day} onChange={(e) => setScForm((f) => ({ ...f, day: e.target.value }))}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          ) : (
            <input type="date" className="ss-input" style={{ flex: "1 1 140px" }} value={scForm.date}
              onChange={(e) => setScForm((f) => ({ ...f, date: e.target.value }))} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="time" className="ss-input" value={scForm.start}
            onChange={(e) => setScForm((f) => ({ ...f, start: e.target.value }))} />
          <input type="time" className="ss-input" value={scForm.end}
            onChange={(e) => setScForm((f) => ({ ...f, end: e.target.value }))} />
          <button className="ss-btn-primary" onClick={addSupercurricular} style={{ whiteSpace: "nowrap" }}>
            <Plus size={15} />Add
          </button>
        </div>
        <div style={{ maxHeight: 140, overflowY: "auto", marginBottom: 20 }} className="ss-scroll">
          <ManageList items={supercurricular} renderLabel={activityLabel} onDelete={deleteSupercurricular} emptyText="No supercurricular activity added yet." />
        </div>

        <h4 style={{ color: COLORS.textDark, marginBottom: 8 }}>Holidays</h4>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input className="ss-input" placeholder="Label" style={{ flex: "1 1 140px" }}
            value={hForm.label} onChange={(e) => setHForm((f) => ({ ...f, label: e.target.value }))} />
          <input type="date" className="ss-input" style={{ flex: "1 1 130px" }} value={hForm.start}
            onChange={(e) => setHForm((f) => ({ ...f, start: e.target.value }))} />
          <input type="date" className="ss-input" style={{ flex: "1 1 130px" }} value={hForm.end}
            onChange={(e) => setHForm((f) => ({ ...f, end: e.target.value }))} />
          <button className="ss-btn-primary" onClick={addHoliday}><Plus size={15} /></button>
        </div>
        <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 24 }} className="ss-scroll">
          <ManageList items={holidays} renderLabel={holidayLabel} onDelete={deleteHoliday} emptyText="No holidays added yet." />
        </div>

        {error && <p style={{ color: COLORS.Work, fontSize: 13, marginTop: 0, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="ss-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ss-btn-primary" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={15} />}
            Save changes
          </button>
        </div>
      </div>

      {assistantFor && (
        <SchedulingAssistant
          data={data}
          category={assistantFor}
          onConfirm={handleAssistantConfirm}
          onClose={() => setAssistantFor(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Sleep log                                                              */
/* ---------------------------------------------------------------------- */
function SleepLogModal({ data, onSave, onClose }) {
  const [entries, setEntries] = useState(data.sleepLog || []);
  const [form, setForm] = useState({ date: toISO(new Date()), hours: data.profile.sleepHours });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addEntry = () => {
    const hours = Number(form.hours);
    if (!form.date || Number.isNaN(hours) || hours < 0 || hours > 14) return;
    setEntries((list) => {
      const idx = list.findIndex((e) => e.date === form.date);
      const rec = { id: idx >= 0 ? list[idx].id : `sleep-${Date.now()}`, date: form.date, hours };
      if (idx >= 0) {
        const next = [...list];
        next[idx] = rec;
        return next;
      }
      return [...list, rec];
    });
    setForm({ date: toISO(new Date()), hours: data.profile.sleepHours });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const next = { ...data, sleepLog: entries };
    try {
      await api.saveData(next);
      onSave(next);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,12,20,.6)", zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div className="ss-root" style={{
        background: COLORS.paper, borderRadius: 18, padding: 32, width: "min(440px, 100%)",
        maxHeight: "88vh", overflowY: "auto",
      }}>
        <GlobalStyle />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 className="ss-display" style={{ margin: 0, color: COLORS.textDark }}>Log sleep</h2>
          <X size={20} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <p style={{ color: "#6b6650", fontSize: 13, marginTop: 0, marginBottom: 14 }}>
          Track how much you actually slept each night — Statistics compares this against your {data.profile.sleepHours}h target.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="date" className="ss-input" style={{ flex: "1 1 150px" }} value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <input type="number" min={0} max={14} step={0.5} className="ss-input" style={{ flex: "1 1 90px" }}
            value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
          <button className="ss-btn-primary" onClick={addEntry}><Plus size={15} /></button>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 20 }} className="ss-scroll">
          {sorted.length === 0 && <p style={{ fontSize: 13, color: "#9a927a" }}>No sleep logged yet.</p>}
          {sorted.map((e) => (
            <div key={e.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#fff", border: "1px solid #E2DBC4", borderRadius: 8, padding: "8px 12px", marginBottom: 6,
            }}>
              <span style={{ fontSize: 13, color: COLORS.textDark }}>
                <strong>{e.date}</strong> · {e.hours}h
              </span>
              <X size={16} style={{ cursor: "pointer", color: "#9a927a" }}
                onClick={() => setEntries((list) => list.filter((x) => x.id !== e.id))} />
            </div>
          ))}
        </div>
        {error && <p style={{ color: COLORS.Work, fontSize: 13, marginTop: 0, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="ss-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ss-btn-primary" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={15} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Statistics                                                             */
/* ---------------------------------------------------------------------- */
function StatBar({ pct, color }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: COLORS.panelSoft, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

function StatsCard({ title, subtitle, stats, target }) {
  return (
    <div style={{
      flex: "1 1 280px", background: COLORS.panel, border: `1px solid ${COLORS.hair}`,
      borderRadius: 14, padding: 20,
    }}>
      <div className="ss-mono" style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: .5 }}>
        {subtitle}
      </div>
      <h3 className="ss-display" style={{ margin: "2px 0 16px", color: COLORS.textLight, fontSize: 19 }}>
        {title}
      </h3>

      {TRACKABLE_CATEGORIES.map((cat) => {
        const plannedH = minToHours(stats.planned[cat]);
        const doneH = minToHours(stats.completedMinutes[cat]);
        const pct = stats.planned[cat] > 0 ? (stats.completedMinutes[cat] / stats.planned[cat]) * 100 : 0;
        const Icon = CATEGORY_ICON[cat];
        return (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.textLight, fontWeight: 600 }}>
                <Icon size={13} color={COLORS[cat]} />{cat}
              </span>
              <span className="ss-mono" style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: "nowrap" }}>
                {doneH}h / {plannedH}h · {stats.completedCount[cat]} ticked off
              </span>
            </div>
            <StatBar pct={pct} color={COLORS[cat]} />
          </div>
        );
      })}

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${COLORS.hair}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.textLight, fontWeight: 600 }}>
            <Moon size={13} color={COLORS.Sleep} />Sleep
          </span>
          <span className="ss-mono" style={{ fontSize: 11, color: COLORS.textMuted, whiteSpace: "nowrap" }}>
            {stats.sleepAvg != null ? `${Math.round(stats.sleepAvg * 10) / 10}h avg` : "no data"} · target {target}h
          </span>
        </div>
        <StatBar pct={stats.sleepAvg != null ? (stats.sleepAvg / target) * 100 : 0} color={COLORS.Sleep} />
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
          {stats.sleepEntries.length} night{stats.sleepEntries.length === 1 ? "" : "s"} logged
        </div>
      </div>
    </div>
  );
}

function Statistics({ data }) {
  const today = new Date();
  const weekStart = startOfWeekMonday(today);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const weekStartISO = toISO(weekStart);
  const weekEndISO = toISO(weekEnd);
  const monthStartISO = toISO(monthStart);
  const monthEndISO = toISO(monthEnd);

  const weekStats = useMemo(() => periodStats(data, weekStartISO, weekEndISO), [data, weekStartISO, weekEndISO]);
  const monthStats = useMemo(() => periodStats(data, monthStartISO, monthEndISO), [data, monthStartISO, monthEndISO]);

  return (
    <div>
      <p style={{ margin: "0 0 18px", color: COLORS.textMuted, fontSize: 13 }}>
        How much of what's planned actually got ticked off, and how sleep is tracking against your target.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <StatsCard
          title="This week"
          subtitle={`${fmtDayNum(weekStart)} – ${fmtDayNum(weekEnd)}`}
          stats={weekStats}
          target={data.profile.sleepHours}
        />
        <StatsCard
          title="This month"
          subtitle={monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          stats={monthStats}
          target={data.profile.sleepHours}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Schedule Q&A chat widget                                               */
/* ---------------------------------------------------------------------- */
function ScheduleChatWidget({ data }) {
  const { tier, toggleTier } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  const ask = () => {
    const q = input.trim();
    if (!q) return;
    const answer = answerScheduleQuery(q, data);
    setMessages((m) => [...m, { role: "user", text: q }, { role: "bot", text: answer }]);
    setInput("");
  };

  const upgrade = async () => {
    setUpgrading(true);
    try {
      await toggleTier();
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div style={{ position: "absolute", top: 0, right: 0, zIndex: 30 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ask about your schedule"
        style={{
          width: 38, height: 38, borderRadius: 999, border: `1px solid ${COLORS.hair}`,
          background: COLORS.panel, color: COLORS.textLight, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Bot size={17} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 46, right: 0, width: 300,
          background: COLORS.paper, borderRadius: 14, boxShadow: "0 12px 30px rgba(0,0,0,.4)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid #E2DBC4",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: COLORS.textDark }}>Ask about your schedule</span>
            <X size={16} style={{ cursor: "pointer", color: "#9a927a" }} onClick={() => setOpen(false)} />
          </div>

          {tier !== "paid" ? (
            <div style={{ padding: 18, textAlign: "center" }}>
              <Lock size={18} color="#9a927a" style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: "#6b6650", margin: "0 0 12px" }}>
                Schedule queries are a paid feature.
              </p>
              <button className="ss-btn-primary" onClick={upgrade} disabled={upgrading} style={{ fontSize: 12 }}>
                {upgrading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
                Upgrade to unlock
              </button>
            </div>
          ) : (
            <>
              <div style={{
                display: "flex", flexDirection: "column", gap: 8, padding: 12,
                minHeight: 100, maxHeight: 260, overflowY: "auto",
              }} className="ss-scroll">
                {messages.length === 0 && (
                  <p style={{ fontSize: 12, color: "#9a927a", margin: 0 }}>
                    Try "what's on Monday", "how much sport this week", or "when's my next holiday".
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    background: m.role === "user" ? `${COLORS.School}22` : "#fff",
                    border: `1px solid ${m.role === "user" ? `${COLORS.School}55` : "#E2DBC4"}`,
                    borderRadius: 10, padding: "6px 10px", fontSize: 12, color: COLORS.textDark, maxWidth: "85%",
                  }}>
                    {m.text}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid #E2DBC4" }}>
                <input
                  className="ss-input" style={{ fontSize: 12, padding: "7px 10px" }}
                  placeholder="Ask a question…" value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                />
                <button className="ss-btn-primary" style={{ padding: "7px 10px" }} onClick={ask}>
                  <Send size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Dashboard                                                              */
/* ---------------------------------------------------------------------- */
function Dashboard({ data, setData }) {
  const { user, tier, logout, toggleTier } = useAuth();
  const [togglingTier, setTogglingTier] = useState(false);

  const handleToggleTier = async () => {
    setTogglingTier(true);
    try {
      await toggleTier();
    } finally {
      setTogglingTier(false);
    }
  };
  const [page, setPage] = useState("calendar");
  const [monday, setMonday] = useState(startOfWeekMonday(new Date()));
  const [showManage, setShowManage] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showSleepLog, setShowSleepLog] = useState(false);

  const weekDays = useMemo(() => generateWeekSchedule(monday, data), [monday, data]);
  const anyHoliday = weekDays.some((d) => d.holiday);

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [syncError, setSyncError] = useState("");

  const reset = async () => {
    setResetting(true);
    setResetError("");
    try {
      await api.saveData(DEFAULT_DATA);
      setData(DEFAULT_DATA);
      setShowReset(false);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  };

  const toggleComplete = async (iso, block) => {
    const key = `${iso}__${block.id}`;
    const completions = { ...(data.completions || {}) };
    if (completions[key]) {
      delete completions[key];
    } else {
      completions[key] = { iso, category: block.category, label: block.label, minutes: block.end - block.start };
    }
    const next = { ...data, completions };
    setData(next); // optimistic
    try {
      await api.saveData(next);
    } catch (err) {
      setData(data); // roll back
      setSyncError(`Couldn't save that — ${err.message}`);
    }
  };

  const legendItems = ["School", "Independent Study", "Sport", "Extracurricular", "Supercurricular", "Work", "Sleep"];

  return (
    <div className="ss-root" style={{ background: COLORS.ink, borderRadius: 20, padding: 28 }}>
      <GlobalStyle />
      {syncError && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
          background: `${COLORS.Work}22`, border: `1px solid ${COLORS.Work}55`, borderRadius: 8,
          padding: "8px 12px", marginBottom: 12, fontSize: 12, color: COLORS.textLight,
        }}>
          <span>{syncError}</span>
          <X size={14} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => setSyncError("")} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="ss-display" style={{ margin: 0, color: COLORS.textLight, fontSize: 26 }}>StudentSync</h1>
          <p style={{ margin: "2px 0 0", color: COLORS.textMuted, fontSize: 13 }}>
            Your week, balanced automatically around what's fixed.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user && (
            <span className="ss-mono" style={{ fontSize: 11, color: COLORS.textMuted, marginRight: 4 }}>{user.email}</span>
          )}
          <button
            className="ss-mono"
            onClick={handleToggleTier}
            disabled={togglingTier}
            title="No real billing — flips your own account between plans for testing."
            style={{
              fontSize: 10, letterSpacing: 0.5, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${tier === "paid" ? COLORS["Independent Study"] : COLORS.hair}`,
              color: tier === "paid" ? COLORS["Independent Study"] : COLORS.textMuted,
              background: tier === "paid" ? `${COLORS["Independent Study"]}15` : COLORS.panel,
            }}
          >
            {tier === "paid" ? "PAID PLAN — switch to free" : "FREE PLAN — switch to paid"}
          </button>
          <button className="ss-btn-ghost" style={{ borderColor: COLORS.hair, color: COLORS.textLight, background: COLORS.panel }}
            onClick={() => setShowSleepLog(true)}>
            <Moon size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Log sleep
          </button>
          <button className="ss-btn-ghost" style={{ borderColor: COLORS.hair, color: COLORS.textLight, background: COLORS.panel }}
            onClick={() => setShowManage(true)}>
            <Settings2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Manage
          </button>
          <button className="ss-btn-ghost" style={{ borderColor: COLORS.hair, color: COLORS.textLight, background: COLORS.panel }}
            onClick={() => setShowReset(true)}>
            <RotateCcw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Reset
          </button>
          <button className="ss-btn-ghost" style={{ borderColor: COLORS.hair, color: COLORS.textLight, background: COLORS.panel }}
            onClick={logout}>
            <LogOut size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Log out
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 18 }}>
        <button
          onClick={() => setPage("calendar")}
          className="ss-mono"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 600, border: `1px solid ${COLORS.hair}`,
            background: page === "calendar" ? COLORS.panelSoft : "transparent",
            color: page === "calendar" ? COLORS.textLight : COLORS.textMuted,
          }}>
          <CalendarDays size={13} />Calendar
        </button>
        <button
          onClick={() => setPage("stats")}
          className="ss-mono"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 600, border: `1px solid ${COLORS.hair}`,
            background: page === "stats" ? COLORS.panelSoft : "transparent",
            color: page === "stats" ? COLORS.textLight : COLORS.textMuted,
          }}>
          <BarChart3 size={13} />Statistics
        </button>
      </div>

      {page === "calendar" ? (
        <div style={{ position: "relative" }}>
          <ScheduleChatWidget data={data} />
          <TermThermometer term={data.term} holidays={data.holidays} weekMonday={monday} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 14px", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setMonday((m) => addDays(m, -7))} style={{
                background: COLORS.panel, border: `1px solid ${COLORS.hair}`, borderRadius: 8, padding: 7, cursor: "pointer", color: COLORS.textLight,
              }}><ChevronLeft size={16} /></button>
              <span className="ss-mono" style={{ color: COLORS.textLight, fontSize: 14, fontWeight: 600 }}>
                {fmtShort(monday)} – {fmtShort(addDays(monday, 6))}
              </span>
              <button onClick={() => setMonday((m) => addDays(m, 7))} style={{
                background: COLORS.panel, border: `1px solid ${COLORS.hair}`, borderRadius: 8, padding: 7, cursor: "pointer", color: COLORS.textLight,
              }}><ChevronRight size={16} /></button>
              <button onClick={() => setMonday(startOfWeekMonday(new Date()))} className="ss-btn-ghost"
                style={{ borderColor: COLORS.hair, color: COLORS.textLight, background: COLORS.panel, padding: "7px 14px" }}>
                Today
              </button>
              {anyHoliday && (
                <span className="ss-mono" style={{
                  fontSize: 11, color: COLORS["Independent Study"], border: `1px solid ${COLORS["Independent Study"]}55`,
                  padding: "4px 8px", borderRadius: 6, background: `${COLORS["Independent Study"]}15`,
                }}>holiday week</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {legendItems.map((c) => (
                <span key={c} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: COLORS.textMuted }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: COLORS[c] }} />{CATEGORY_LABEL[c] || c}
                </span>
              ))}
            </div>
          </div>

          <CalendarGrid weekDays={weekDays} completions={data.completions || {}} onToggleComplete={toggleComplete} />
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <Locked feature="Statistics">
            <Statistics data={data} />
          </Locked>
        </div>
      )}

      {showManage && (
        <ManagePanel data={data} onChange={setData} onClose={() => setShowManage(false)} />
      )}
      {showSleepLog && (
        <SleepLogModal data={data} onSave={setData} onClose={() => setShowSleepLog(false)} />
      )}
      {showReset && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(10,12,20,.6)", zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{ background: COLORS.paper, borderRadius: 16, padding: 26, width: 340 }}>
            <h3 style={{ marginTop: 0, color: COLORS.textDark }}>Reset everything?</h3>
            <p style={{ fontSize: 13, color: "#6b6650" }}>
              This clears your sleep setting, term dates, holidays, commitments, ticked-off progress and sleep log, and takes you back to setup.
            </p>
            {resetError && <p style={{ color: COLORS.Work, fontSize: 13 }}>{resetError}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button className="ss-btn-ghost" onClick={() => setShowReset(false)}>Cancel</button>
              <button className="ss-btn-primary" style={{ background: COLORS.Work }} disabled={resetting} onClick={reset}>
                {resetting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Root                                                                   */
/* ---------------------------------------------------------------------- */
function AuthGate() {
  const { status } = useAuth();
  const [authView, setAuthView] = useState("login"); // 'login' | 'signup'

  if (status === "loading") return <Loading />;
  if (status === "anon") {
    return authView === "login"
      ? <Login onSwitchToSignup={() => setAuthView("signup")} />
      : <Signup onSwitchToLogin={() => setAuthView("login")} />;
  }
  return <AppShell />;
}

function AppShell() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(() => {
    setLoadError("");
    api.getData().then(setData).catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleOnboarded = useCallback((d) => setData(d), []);

  if (loadError) {
    return (
      <div className="ss-root" style={{
        minHeight: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
        background: COLORS.ink, color: COLORS.textMuted, borderRadius: 16, padding: 20, textAlign: "center",
      }}>
        <GlobalStyle />
        <span style={{ fontSize: 14, color: COLORS.textLight }}>Couldn't load your data — {loadError}</span>
        <button className="ss-btn-primary" onClick={load}>Try again</button>
      </div>
    );
  }

  if (!data) return <Loading />;

  return (
    <div style={{ padding: 4 }}>
      {!data.onboarded ? (
        <div style={{ background: COLORS.ink, borderRadius: 20, padding: "40px 16px" }}>
          <GlobalStyle />
          <Onboarding initial={data} onFinish={handleOnboarded} />
        </div>
      ) : (
        <Dashboard data={data} setData={setData} />
      )}
    </div>
  );
}

export default function StudentSyncApp() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
