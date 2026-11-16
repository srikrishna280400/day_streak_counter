import React, { useState, useEffect, useMemo } from 'react';
import './App.css';

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
  autoRecordedAt: string | null;
}

const STORAGE_KEY = 'dayCounterData';
const SCHEMA_VERSION = 2;

function emptyData(): StreakData {
  return {
    records: [],
    currentStart: null,
    cumulativeMonthly: {},
    cumulativeYearly: {},
    autoRecordedAt: null
  };
}

// Normalize whatever is in storage (old or new schema) into the current shape
function normalize(raw: unknown): StreakData {
  if (!raw || typeof raw !== 'object') return emptyData();
  const r = raw as Record<string, any>;
  const base = emptyData();

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
    cumulativeYearly: r.cumulativeYearly && typeof r.cumulativeYearly === 'object' ? r.cumulativeYearly : {},
    autoRecordedAt: null
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
  const secs = seconds % 60;
  const hhmmss = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return days > 0 ? `${days}d ${hhmmss}` : hhmmss;
}

function elapsedSeconds(startISO: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(startISO).getTime()) / 1000));
}

function monthKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .format(date)
    .slice(0, 7); // YYYY-MM
}

function yearKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(date);
}

function App() {
  const [data, setData] = useState<StreakData>(emptyData);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // ---- Load once on mount. Nothing is written to storage until hydrated. ----
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
  }, []);

  // ---- Persist only after hydration, so we never clobber saved data ----
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, _v: SCHEMA_VERSION }));
    } catch {}
  }, [data, hydrated]);

  // ---- Drive re-renders every second while a streak is active ----
  const isRunning = data.currentStart !== null;
  useEffect(() => {
    if (!isRunning) return;
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [isRunning]);

  const currentSeconds = useMemo(
    () => (data.currentStart ? elapsedSeconds(data.currentStart, now) : 0),
    [data.currentStart, now]
  );

  // ---- Start: only creates a start timestamp. No record. ----
  const handleStart = () => {
    setData(prev => ({ ...prev, currentStart: new Date().toISOString() }));
    setNow(new Date());
  };

  // ---- Reset (the ONLY way a record is created) ----
  const handleReset = () => {
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
  };

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

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Streak Tracker</h1>

        {/* Live counter — derived from stored start time, immune to refresh */}
        <div className={`current-section ${isRunning ? 'is-running' : ''}`}>
          <div className="stat-label">{isRunning ? 'Active Streak' : 'No Active Streak'}</div>
          <div className="stat-value mono">{isRunning ? formatDuration(currentSeconds) : '--:--:--'}</div>
          <div className="timestamp">
            {isRunning && data.currentStart
              ? `Started ${toIST(new Date(data.currentStart))}`
              : 'Press Start to begin a new streak'}
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