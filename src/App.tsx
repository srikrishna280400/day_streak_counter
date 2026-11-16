import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';

interface StreakRecord {
  id: number;
  startDate: string;   // ISO string
  endDate: string;     // ISO string
}

interface StreakData {
  records: StreakRecord[];
  currentStart: string | null;
  cumulativeMonthly: Record<string, number>;
  cumulativeYearly: Record<string, number>;
}

const STORAGE_KEY = 'dayCounterData';
const SCHEMA_VERSION = 2;

function emptyData(): StreakData {
  return {
    records: [],
    currentStart: null,
    cumulativeMonthly: {},
    cumulativeYearly: {}
  };
}

function normalize(raw: unknown): StreakData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const r = raw as Record<string, any>;
  const records: StreakRecord[] = Array.isArray(r.records)
    ? r.records
        .filter((x: any) => x && typeof x.startDate === 'string' && typeof x.endDate === 'string')
        .map((x: any, i: number) => ({
          id: typeof x.id === 'number' ? x.id : Date.now() + i,
          startDate: x.startDate,
          endDate: x.endDate
        }))
    : [];
  return {
    records,
    currentStart: typeof r.currentStart === 'string' ? r.currentStart : null,
    cumulativeMonthly: r.cumulativeMonthly && typeof r.cumulativeMonthly === 'object' ? r.cumulativeMonthly : {},
    cumulativeYearly: r.cumulativeYearly && typeof r.cumulativeYearly === 'object' ? r.cumulativeYearly : {}
  };
}

function toIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date) + ' IST';
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const hhmm = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  return days > 0 ? `${days}d ${hhmm}` : hhmm;
}

function elapsedSeconds(startISO: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(startISO).getTime()) / 1000));
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function yearKey(date: Date): string {
  return date.getFullYear().toString();
}

function monthLabel(date: Date): string {
  return date.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatForDateInput(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Generate last N days including today
function generateDateRange(n: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

function App() {
  const [data, setData] = useState<StreakData>(emptyData);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<string>('0');
  const [selectedMinute, setSelectedMinute] = useState<string>('0');
  const [datePickerMonth, setDatePickerMonth] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // HOUR_SLOTS: 12am, 1am, ... 11pm
  const HOUR_SLOTS = Array.from({ length: 24 }, (_, h) => {
    const suffix = h < 12 ? 'am' : 'pm';
    const twelve = h % 12 === 0 ? 12 : h % 12;
    return `${twelve}${suffix}`;
  });
  const QUARTER_SLOTS = [':00', ':15', ':30', ':45'];

  // Generate grid of dates for the current picker month
  const monthDates = useMemo(() => {
    const year = datePickerMonth.getFullYear();
    const month = datePickerMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun, 6 = Sat
    const days: Date[] = [];
    // Fill with leading empty slots (empty Dates)
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(new Date(0)); // sentinel
    }
    // Fill actual dates
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    // Pad with trailing empties to complete weeks
    const totalDays = days.length;
    const remaining = (7 - (totalDays % 7)) % 7;
    for (let i = 0; i < remaining; i++) {
      days.push(new Date(0)); // sentinel
    }
    return days;
  }, [datePickerMonth]);

  // Load once on mount. Nothing written until hydrated.
  useEffect(() => {
    let loaded = emptyData();
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('streakData');
      if (raw) loaded = normalize(JSON.parse(raw));
    } catch {
      loaded = emptyData();
    }
    setData(loaded);
    setHydrated(true);
    // Pre-fill selected date with today
    setSelectedDate(formatForDateInput(new Date()));
  }, []);

  // Persist only after hydration
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, _v: SCHEMA_VERSION }));
    } catch {}
  }, [data, hydrated]);

  // Re-render every minute while streak is active
  const isRunning = data.currentStart !== null;
  useEffect(() => {
    if (!isRunning) return;
    const t = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(t);
  }, [isRunning]);

  const currentSeconds = useMemo(
    () => (data.currentStart ? elapsedSeconds(data.currentStart, now) : 0),
    [data.currentStart, now]
  );

  // Start: builds ISO from selected date + hour + 15-min slot
  const handleStart = useCallback(() => {
    if (!selectedDate) return;
    const [h, m] = [parseInt(selectedHour), parseInt(selectedMinute)];
    const startDate = new Date(selectedDate);
    startDate.setHours(h, m, 0, 0);
    setData(prev => ({ ...prev, currentStart: startDate.toISOString() }));
    setNow(new Date());
  }, [selectedDate, selectedHour, selectedMinute]);

  // Reset: the ONLY way a record is created
  const handleReset = useCallback(() => {
    if (!data.currentStart) return;
    const end = new Date();
    const record: StreakRecord = {
      id: Date.now(),
      startDate: data.currentStart,
      endDate: end.toISOString()
    };
    const m = monthKey(end);
    const y = yearKey(end);
    setData(prev => ({
      ...prev,
      records: [...prev.records, record],
      currentStart: null,
      cumulativeMonthly: { ...prev.cumulativeMonthly, [m]: (prev.cumulativeMonthly[m] || 0) + 1 },
      cumulativeYearly: { ...prev.cumulativeYearly, [y]: (prev.cumulativeYearly[y] || 0) + 1 }
    }));
    setSelectedDate(formatForDateInput(new Date()));
  }, [data.currentStart]);

  const handleDelete = (id: number) => {
    setData(prev => {
      const record = prev.records.find(r => r.id === id);
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
        records: prev.records.filter(r => r.id !== id),
        cumulativeMonthly: monthly,
        cumulativeYearly: yearly
      };
    });
  };

  const sortedRecords = useMemo(
    () => [...data.records].sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()),
    [data.records]
  );

  const lastRecord = sortedRecords[0];
  const currentMonth = monthKey(now);
  const currentYear = yearKey(now);

  const isDateSelected = (d: Date) => d.toISOString().slice(0, 10) === selectedDate;
  const isToday = (d: Date) => d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Streak Tracker</h1>

        {/* Live counter */}
        <div className={`current-section ${isRunning ? 'is-running' : ''}`}>
          <div className="stat-label">{isRunning ? 'Active Streak' : 'No Active Streak'}</div>
          <div className="stat-value mono">{isRunning ? formatDuration(currentSeconds) : '--:--:--'}</div>
          <div className="timestamp">
            {isRunning && data.currentStart
              ? `Started ${toIST(new Date(data.currentStart))}`
              : 'Pick a date+time below, then press Start'}
          </div>
        </div>

        {/* Date/time slot selection */}
        <div className="slot-section">
          <label className="slot-label">Start at</label>

          {/* Custom date picker trigger */}
          <div className="date-picker-section">
            <button className="date-picker-trigger" onClick={() => setShowDatePicker(!showDatePicker)}>
              {selectedDate ? (
                <>
                  <span className="date-display-day">{new Date(selectedDate).getDate()}</span>
                  <span className="date-display-month">
                    {new Date(selectedDate).toLocaleString('en-IN', { month: 'short' })}
                  </span>
                </>
              ) : (
                <span>Select date</span>
              )}
            </button>

            {/* Date picker grid */}
            {showDatePicker && (
              <div className="date-picker-grid">
                <div className="date-picker-header">
                  <button
                    className="nav-btn prev"
                    onClick={() => setDatePickerMonth(prev => { const nd = new Date(prev); nd.setMonth(nd.getMonth() - 1); return nd; })}
                  >
                    ‹
                  </button>
                  <span className="month-year">{monthLabel(datePickerMonth)}</span>
                  <button
                    className="nav-btn next"
                    onClick={() => setDatePickerMonth(prev => { const nd = new Date(prev); nd.setMonth(nd.getMonth() + 1); return nd; })}
                  >
                    ›
                  </button>
                </div>

                <div className="date-grid">
                  {monthDates.map((d, i) => (
                    <button
                      key={i}
                      className={`date-tile ${isDateSelected(d) ? 'selected' : ''} ${isToday(d) ? 'today' : ''}`}
                      onClick={() => { setSelectedDate(formatForDateInput(d)); setShowDatePicker(false); }}
                    >
                      {d.getDate()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Hour + Minute selects */}
            <div className="time-selects">
              <select
                value={selectedHour}
                onChange={(e) => setSelectedHour(e.target.value)}
                className="time-select"
              >
                {HOUR_SLOTS.map((label, i) => (
                  <option key={i} value={String(i)}>{label}</option>
                ))}
              </select>
              <select
                value={selectedMinute}
                onChange={(e) => setSelectedMinute(e.target.value)}
                className="time-select"
              >
                {QUARTER_SLOTS.map((label, i) => (
                  <option key={i} value={String(i * 15)}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="buttons">
          {!isRunning ? (
            <button onClick={handleStart} className="btn btn-start">Start Streak</button>
          ) : (
            <button onClick={handleReset} className="btn btn-reset">Reset Streak (broken)</button>
          )}
        </div>

        {/* Last streak */}
        {lastRecord && (
          <div className="last-streak">
            <div className="stat-label">Last Streak</div>
            <div className="stat-value">{formatDuration(elapsedSeconds(lastRecord.startDate, new Date(lastRecord.endDate)))}</div>
            <div className="timestamp">
              {toIST(new Date(lastRecord.startDate))} → {toIST(new Date(lastRecord.endDate))}
            </div>
          </div>
        )}

        {/* Cumulative resets */}
        <div className="cumulative-section">
          <h3 className="section-title">Cumulative Resets</h3>
          <div className="cumulative-row">
            <div className="cumulative-cell">
              <div className="cumulative-label">This Month</div>
              <div className="cumulative-value">{data.cumulativeMonthly[currentMonth] || 0}</div>
            </div>
            <div className="cumulative-cell">
              <div className="cumulative-label">This Year</div>
              <div className="cumulative-value">{data.cumulativeYearly[currentYear] || 0}</div>
            </div>
          </div>
        </div>

        {/* History */}
        <div className="records-section">
          <h3 className="section-title">Past Streaks {sortedRecords.length > 0 && <span className="count">({sortedRecords.length})</span>}</h3>
          {sortedRecords.length === 0 ? (
            <p className="no-records">No past streaks yet</p>
          ) : (
            <div className="records-list">
              {sortedRecords.map(record => (
                <div key={record.id} className="record-item">
                  <div className="record-info">
                    <div className="record-duration mono">
                      {formatDuration(elapsedSeconds(record.startDate, new Date(record.endDate)))}
                    </div>
                    <div className="record-range">
                      {toIST(new Date(record.startDate))} → {toIST(new Date(record.endDate))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="btn-delete"
                    title="Delete streak"
                    aria-label="Delete streak"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
}

export default App;