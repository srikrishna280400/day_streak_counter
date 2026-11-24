import React, { useState, useEffect, useMemo } from "react";
import "./App.css";

interface StreakRecord {
  id: number;
  startDate: string;
  endDate: string;
}

interface StreakData {
  records: StreakRecord[];
  currentStart: string | null;
  cumulativeMonthly: Record<string, number>;
  cumulativeYearly: Record<string, number>;
  updatedAt?: number;
}

const STORAGE_KEY = "dayCounterData";
const SCHEMA_VERSION = 2;
const EMPTY_DATA = {
  records: [],
  currentStart: null,
  cumulativeMonthly: {},
  cumulativeYearly: {},
  updatedAt: 0,
};

// Relative path — Vercel rewrites /api/* to the Render backend (vercel.json).
// In dev, vite.config.ts proxies /api to the same backend.
const API_BASE = "";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const HOUR_SLOTS = Array.from({ length: 24 }, (_, h) => {
  const suffix = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
});
const QUARTER_SLOTS = [":00", ":15", ":30", ":45"];

function emptyData(): StreakData {
  return {
    records: [],
    currentStart: null,
    cumulativeMonthly: {},
    cumulativeYearly: {},
    updatedAt: 0,
  };
}

function normalize(raw: unknown): StreakData {
  if (!raw || typeof raw !== "object") return emptyData();
  const r = raw as Record<string, any>;
  const records: StreakRecord[] = Array.isArray(r.records)
    ? r.records
        .filter(
          (x: any) =>
            x &&
            typeof x.startDate === "string" &&
            typeof x.endDate === "string",
        )
        .map((x: any, i: number) => ({
          id: typeof x.id === "number" ? x.id : Date.now() + i,
          startDate: x.startDate,
          endDate: x.endDate,
        }))
    : [];
  return {
    records,
    currentStart: typeof r.currentStart === "string" ? r.currentStart : null,
    cumulativeMonthly:
      r.cumulativeMonthly && typeof r.cumulativeMonthly === "object"
        ? r.cumulativeMonthly
        : {},
    cumulativeYearly:
      r.cumulativeYearly && typeof r.cumulativeYearly === "object"
        ? r.cumulativeYearly
        : {},
  };
}

function toIST(date: Date): string {
  const options = {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const formatted = new Intl.DateTimeFormat("en-IN", options).format(date);
  return formatted.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase()) + " IST";
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const hhmm = `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  return days > 0 ? `${days}d ${hhmm}` : hhmm;
}

function elapsedSeconds(startISO: string, now: Date = new Date()): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(startISO).getTime()) / 1000),
  );
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function yearKey(date: Date): string {
  return date.getFullYear().toString();
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function isoFor(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

async function loadStreakData(): Promise<StreakData> {
  try {
    const response = await fetch(`${API_BASE}/api/streak`, {
      cache: "no-store",
    });
    if (!response.ok) return emptyData();
    const data = await response.json();
    if (!data) return emptyData();
    return normalize(data);
  } catch (error) {
    console.error("❌ Failed to load streak data:", error);
    return emptyData();
  }
}

function saveStreakData(data: StreakData): void {
  try {
    fetch(`${API_BASE}/api/streak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive: true,
    });
  } catch (error) {
    console.error("❌ Failed to save streak data:", error);
  }
}

function syncDataToServer(data: StreakData): void {
  saveStreakData(data);
  console.log("✅ Synced streak data to server");
}

const App: React.FC = () => {
  const [data, setData] = useState<StreakData>(emptyData);
  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedHour, setSelectedHour] = useState<string>("0");
  const [selectedMinute, setSelectedMinute] = useState<string>("0");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerView, setPickerView] = useState<"months" | "dates">("months");
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());

  const [endDate, setEndDate] = useState<string>("");
  const [endHour, setEndHour] = useState<string>("0");
  const [endMinute, setEndMinute] = useState<string>("0");
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [endPickerView, setEndPickerView] = useState<"months" | "dates">(
    "months",
  );
  const [endPickerYear, setEndPickerYear] = useState(() =>
    new Date().getFullYear(),
  );
  const [endPickerMonth, setEndPickerMonth] = useState(() =>
    new Date().getMonth(),
  );

  // Load from server on first mount
  useEffect(() => {
    loadStreakData().then(setData);
    setSelectedDate(
      isoFor(
        new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate(),
      ),
    );
  }, []);

  // Persist to server whenever data changes
  useEffect(() => {
    if (!data.currentStart && data.records.length === 0) return;
    syncDataToServer(data);
  }, [data]);

  // Periodic sync while streak is running
  useEffect(() => {
    if (!data.currentStart) return;
    const interval = setInterval(() => {
      syncDataToServer(data);
    }, 15_000); // every 15 seconds
    return () => clearInterval(interval);
  }, [data.currentStart]);

  const isRunning = data.currentStart !== null;
  useEffect(() => {
    if (!isRunning) return;
    const t = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(t);
  }, [isRunning]);

  const currentSeconds = useMemo(
    () => (data.currentStart ? elapsedSeconds(data.currentStart, now) : 0),
    [data.currentStart, now],
  );

  const openPicker = () => {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    setPickerYear(base.getFullYear());
    setPickerMonth(base.getMonth());
    setPickerView("months");
    setShowDatePicker(true);
  };

  const openEndPicker = () => {
    const now = new Date();
    setEndDate(isoFor(now.getFullYear(), now.getMonth(), now.getDate()));
    setEndHour(String(now.getHours()));
    setEndMinute(String(Math.floor(now.getMinutes() / 15) * 15));
    setEndPickerYear(now.getFullYear());
    setEndPickerMonth(now.getMonth());
    setEndPickerView("months");
    setShowEndPicker(true);
  };

  const handleStart = () => {
    if (!selectedDate) return;
    const startDate = new Date(selectedDate);
    startDate.setHours(parseInt(selectedHour), parseInt(selectedMinute), 0, 0);
    setData((prev) => ({ ...prev, currentStart: startDate.toISOString() }));
    setNow(new Date());
  };

  const handleReset = () => {
    openEndPicker();
  };

  const handleResetWithEnd = () => {
    if (!data.currentStart || !endDate) return;
    const end = new Date(endDate);
    end.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
    const record: StreakRecord = {
      id: Date.now(),
      startDate: data.currentStart,
      endDate: end.toISOString(),
    };
    const m = monthKey(end);
    const y = yearKey(end);
    setData((prev) => ({
      ...prev,
      records: [...prev.records, record],
      currentStart: null,
      cumulativeMonthly: {
        ...prev.cumulativeMonthly,
        [m]: (prev.cumulativeMonthly[m] || 0) + 1,
      },
      cumulativeYearly: {
        ...prev.cumulativeYearly,
        [y]: (prev.cumulativeYearly[y] || 0) + 1,
      },
    }));
    setShowEndPicker(false);
    const t = new Date();
    setSelectedDate(isoFor(t.getFullYear(), t.getMonth(), t.getDate()));
  };

  const handleDelete = (id: number) => {
    setData((prev) => {
      const record = prev.records.find((r) => r.id === id);
      if (!record) return prev;
      const end = new Date(record.endDate);
      const m = monthKey(end);
      const y = yearKey(end);
      const monthly = { ...prev.cumulativeMonthly };
      const yearly = { ...prev.cumulativeYearly };
      if (monthly[m]) monthly[m] = Math.max(0, monthly[m] - 1);
      if (yearly[y]) yearly[y] = Math.max(0, yearly[y] - 1);
      return {
        ...prev,
        records: prev.records.filter((r) => r.id !== id),
        cumulativeMonthly: monthly,
        cumulativeYearly: yearly,
      };
    });
  };

  const sortedRecords = useMemo(
    () =>
      [...data.records].sort(
        (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime(),
      ),
    [data.records],
  );

  const lastRecord = sortedRecords[0];
  const currentMonth = monthKey(now);
  const currentYear = yearKey(now);

  // Monthly breakdown — every month that has at least one reset
  const monthlyBreakdown = useMemo(() => {
    const keys = Object.keys(data.cumulativeMonthly).sort().reverse();
    return keys.map((key) => ({
      key,
      count: data.cumulativeMonthly[key],
    }));
  }, [data.cumulativeMonthly]);

  const dateCells = useMemo(() => {
    const first = new Date(pickerYear, pickerMonth, 1);
    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [pickerYear, pickerMonth]);

  const todayIso = isoFor(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  );

  // End date grid cells
  const endDateCells = useMemo(() => {
    const first = new Date(endPickerYear, endPickerMonth, 1);
    const daysInMonth = new Date(
      endPickerYear,
      endPickerMonth + 1,
      0,
    ).getDate();
    const lead = (first.getDay() + 6) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [endPickerYear, endPickerMonth]);

  const selectedDisplay = selectedDate
    ? `${new Date(selectedDate).getDate()} ${MONTHS[new Date(selectedDate).getMonth()]} ${new Date(selectedDate).getFullYear()}`
    : "Select date";

  const endDateDisplay = endDate
    ? `${new Date(endDate).getDate()} ${MONTHS[new Date(endDate).getMonth()]} ${new Date(endDate).getFullYear()}`
    : "Select date";

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Streak Tracker</h1>

        {/* Live counter */}
        <div className={`current-section ${isRunning ? "is-running" : ""}`}>
          <div className="stat-label">
            {isRunning ? "Active Streak" : "No Active Streak"}
          </div>
          <div className="stat-value mono">
            {isRunning ? formatDuration(currentSeconds) : "--:--:--"}
          </div>
          <div className="timestamp">
            {isRunning && data.currentStart
              ? `Started ${toIST(new Date(data.currentStart))}`
              : "Pick a date+time below, then press Start"}
          </div>
        </div>

        {/* Date/time slot selection */}
        <div className="slot-section">
          <label className="slot-label">Start at</label>

          {/* Date trigger - toggle dropdown on/off */}
          <button
            type="button"
            className={`date-trigger ${showDatePicker ? "open" : ""}`}
            onClick={() => setShowDatePicker(!showDatePicker)}
          >
            <span className="date-trigger-text">{selectedDisplay}</span>
            <span className="date-trigger-chevron">
              {showDatePicker ? "▲" : "▾"}
            </span>
          </button>

          {/* Picker panel */}
          {showDatePicker && (
            <div className="picker-panel">
              {pickerView === "months" ? (
                <>
                  <div className="picker-header">
                    <span className="picker-title">{pickerYear}</span>
                    <div className="picker-nav">
                      <button
                        type="button"
                        className="nav-btn"
                        onClick={() => setPickerYear((y) => y - 1)}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="nav-btn"
                        onClick={() => setPickerYear((y) => y + 1)}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                  <div className="month-grid">
                    {MONTHS.map((name, i) => (
                      <button
                        key={name}
                        type="button"
                        className={`sq-tile ${pickerMonth === i ? "active" : ""}`}
                        onClick={() => {
                          setPickerMonth(i);
                          setPickerView("dates");
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="picker-header">
                    <button
                      type="button"
                      className="nav-btn back"
                      onClick={() => setPickerView("months")}
                    >
                      ←
                    </button>
                    <span className="picker-title">
                      {MONTHS[pickerMonth]} {pickerYear}
                    </span>
                    <div className="picker-nav">
                      <button
                        type="button"
                        className="nav-btn"
                        onClick={() => {
                          const d = new Date(pickerYear, pickerMonth - 1, 1);
                          setPickerYear(d.getFullYear());
                          setPickerMonth(d.getMonth());
                        }}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="nav-btn"
                        onClick={() => {
                          const d = new Date(pickerYear, pickerMonth + 1, 1);
                          setPickerYear(d.getFullYear());
                          setPickerMonth(d.getMonth());
                        }}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                  <div className="weekday-row">
                    {WEEKDAYS.map((w) => (
                      <span key={w} className="weekday">
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="date-grid">
                    {dateCells.map((d, i) =>
                      d === null ? (
                        <span key={`e${i}`} className="sq-tile empty" />
                      ) : (
                        <button
                          key={i}
                          type="button"
                          className={`sq-tile ${isoFor(pickerYear, pickerMonth, d) === selectedDate ? "active" : ""} ${isoFor(pickerYear, pickerMonth, d) === todayIso ? "today" : ""}`}
                          onClick={() => {
                            setSelectedDate(isoFor(pickerYear, pickerMonth, d));
                            setShowDatePicker(false);
                          }}
                        >
                          {d}
                        </button>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Hour + Minute selects */}
          <div className="time-selects">
            <select
              value={selectedHour}
              onChange={(e) => setSelectedHour(e.target.value)}
              className="slot-input"
            >
              {HOUR_SLOTS.map((label, i) => (
                <option key={i} value={String(i)}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={selectedMinute}
              onChange={(e) => setSelectedMinute(e.target.value)}
              className="slot-input"
            >
              {QUARTER_SLOTS.map((label, i) => (
                <option key={i} value={String(i * 15)}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="buttons">
          {!isRunning ? (
            <button onClick={handleStart} className="btn btn-start">
              Start Streak
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowEndPicker(!showEndPicker)}
                className="btn btn-reset"
              >
                Reset Streak (broken)
              </button>
              {showEndPicker && (
                <div className="end-picker-section">
                  <label className="slot-label">End at</label>

                  {/* End date trigger - toggles only the calendar grid */}
                  <button
                    type="button"
                    className={`date-trigger ${showEndCalendar ? "open" : ""}`}
                    onClick={() => setShowEndCalendar(!showEndCalendar)}
                  >
                    <span className="date-trigger-text">{endDateDisplay}</span>
                    <span className="date-trigger-chevron">
                      {showEndCalendar ? "▲" : "▾"}
                    </span>
                  </button>

                  {/* End date picker panel */}
                  {showEndCalendar && (
                    <div className="picker-panel">
                      {endPickerView === "months" ? (
                        <>
                          <div className="picker-header">
                            <span className="picker-title">
                              {endPickerYear}
                            </span>
                            <div className="picker-nav">
                              <button
                                type="button"
                                className="nav-btn"
                                onClick={() => setEndPickerYear((y) => y - 1)}
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                className="nav-btn"
                                onClick={() => setEndPickerYear((y) => y + 1)}
                              >
                                ›
                              </button>
                            </div>
                          </div>
                          <div className="month-grid">
                            {MONTHS.map((name, i) => (
                              <button
                                key={name}
                                type="button"
                                className={`sq-tile ${endPickerMonth === i ? "active" : ""}`}
                                onClick={() => {
                                  setEndPickerMonth(i);
                                  setEndPickerView("dates");
                                }}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="picker-header">
                            <button
                              type="button"
                              className="nav-btn back"
                              onClick={() => setEndPickerView("months")}
                            >
                              ←
                            </button>
                            <span className="picker-title">
                              {MONTHS[endPickerMonth]} {endPickerYear}
                            </span>
                            <div className="picker-nav">
                              <button
                                type="button"
                                className="nav-btn"
                                onClick={() => {
                                  const d = new Date(
                                    endPickerYear,
                                    endPickerMonth - 1,
                                    1,
                                  );
                                  setEndPickerYear(d.getFullYear());
                                  setEndPickerMonth(d.getMonth());
                                }}
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                className="nav-btn"
                                onClick={() => {
                                  const d = new Date(
                                    endPickerYear,
                                    endPickerMonth + 1,
                                    1,
                                  );
                                  setEndPickerYear(d.getFullYear());
                                  setEndPickerMonth(d.getMonth());
                                }}
                              >
                                ›
                              </button>
                            </div>
                          </div>
                          <div className="weekday-row">
                            {WEEKDAYS.map((w) => (
                              <span key={w} className="weekday">
                                {w}
                              </span>
                            ))}
                          </div>
                          <div className="date-grid">
                            {endDateCells.map((d, i) =>
                              d === null ? (
                                <span key={`e${i}`} className="sq-tile empty" />
                              ) : (
                                <button
                                  key={i}
                                  type="button"
                                  className={`sq-tile ${isoFor(endPickerYear, endPickerMonth, d) === endDate ? "active" : ""} ${isoFor(endPickerYear, endPickerMonth, d) === todayIso ? "today" : ""}`}
                                  onClick={() => {
                                    setEndDate(
                                      isoFor(endPickerYear, endPickerMonth, d),
                                    );
                                    setShowEndPicker(false);
                                  }}
                                >
                                  {d}
                                </button>
                              ),
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Hour + Minute selects */}
                  <div className="time-selects">
                    <select
                      value={endHour}
                      onChange={(e) => setEndHour(e.target.value)}
                      className="slot-input"
                    >
                      {HOUR_SLOTS.map((label, i) => (
                        <option key={i} value={String(i)}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={endMinute}
                      onChange={(e) => setEndMinute(e.target.value)}
                      className="slot-input"
                    >
                      {QUARTER_SLOTS.map((label, i) => (
                        <option key={i} value={String(i * 15)}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleResetWithEnd}
                    className="btn btn-start"
                  >
                    Confirm Reset
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Last streak */}
        {lastRecord && (
          <div className="last-streak">
            <div className="stat-label">Last Streak</div>
            <div className="stat-value">
              {formatDuration(
                elapsedSeconds(
                  lastRecord.startDate,
                  new Date(lastRecord.endDate),
                ),
              )}
            </div>
            <div className="timestamp">
              {toIST(new Date(lastRecord.startDate))} →{" "}
              {toIST(new Date(lastRecord.endDate))}
            </div>
          </div>
        )}

        {/* Cumulative resets */}
        <div className="cumulative-section">
          <h3 className="section-title">Cumulative Resets</h3>
          <div className="cumulative-row">
            <div className="cumulative-cell">
              <div className="cumulative-label">This Month</div>
              <div className="cumulative-value">
                {data.cumulativeMonthly[currentMonth] || 0}
              </div>
            </div>
            <div className="cumulative-cell">
              <div className="cumulative-label">This Year</div>
              <div className="cumulative-value">
                {data.cumulativeYearly[currentYear] || 0}
              </div>
            </div>
          </div>

          {/* Monthly breakdown — past months keep their counts */}
          <div className="section-title section-title--breakdown">Monthly Breakdown</div>
          <div className="cumulative-row monthly-breakdown">
            {monthlyBreakdown.length === 0 ? (
              <div className="cumulative-cell">
                <div className="cumulative-label">No resets yet</div>
              </div>
            ) : (
              monthlyBreakdown.map((m) => (
                <div key={m.key} className="cumulative-cell">
                  <div className="cumulative-label">{m.key}</div>
                  <div className="cumulative-value">{m.count}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* History */}
        <div className="records-section">
          <h3 className="section-title">
            Past Streaks{" "}
            {sortedRecords.length > 0 && (
              <span className="count">({sortedRecords.length})</span>
            )}
          </h3>
          {sortedRecords.length === 0 ? (
            <p className="no-records">No past streaks yet</p>
          ) : (
            <div className="records-list">
              {sortedRecords.map((record) => (
                <div key={record.id} className="record-item">
                  <div className="record-info">
                    <div className="record-duration mono">
                      {formatDuration(
                        elapsedSeconds(
                          record.startDate,
                          new Date(record.endDate),
                        ),
                      )}
                    </div>
                    <div className="record-range">
                      {toIST(new Date(record.startDate))} →{" "}
                      {toIST(new Date(record.endDate))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="btn-delete"
                    title="Delete streak"
                    aria-label="Delete streak"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
