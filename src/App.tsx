import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

interface StreakRecord {
  id: number;
  startDate: string;   // ISO string
  endDate: string;     // ISO string (or null if ongoing)
  durationDays: number;
}

interface StreakData {
  records: StreakRecord[];
  currentStart: string | null; // ISO string of current streak start
  cumulativeMonthly: Record<string, number>;
  cumulativeYearly: Record<string, number>;
}

function toIST(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  return new Intl.DateTimeFormat('en-IN', options).format(date) + ' IST';
}

function formatDaysHHMMSS(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days} days ${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function diffSeconds(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

function yearKey(date: Date): string {
  return date.getFullYear().toString();
}

function App() {
  const [data, setData] = useState<StreakData>({
    records: [],
    currentStart: null,
    cumulativeMonthly: {},
    cumulativeYearly: {}
  });

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('streakData');
    if (saved) {
      try { setData(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    localStorage.setItem('streakData', JSON.stringify(data));
  }, [data]);

  const [isTracking, setIsTracking] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);

  // Live timer when tracking
  useEffect(() => {
    let timer: number;
    if (isTracking && data.currentStart) {
      const start = new Date(data.currentStart);
      timer = setInterval(() => {
        setCurrentSeconds(diffSeconds(start, new Date()));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isTracking, data.currentStart]);

  // Save current streak end when stopping
  useEffect(() => {
    if (!isTracking && data.currentStart) {
      const end = new Date();
      const durationDays = Math.floor(diffSeconds(new Date(data.currentStart), end) / 86400);
      const newRecord: StreakRecord = {
        id: Date.now(),
        startDate: data.currentStart,
        endDate: end.toISOString(),
        durationDays
      };
      setData(prev => ({
        ...prev,
        records: [...prev.records, newRecord]
      }));
    }
  }, [isTracking, data.currentStart]);

  const handleStart = () => {
    setIsTracking(true);
    setCurrentSeconds(0);
    setData(prev => ({
      ...prev,
      currentStart: new Date().toISOString()
    }));
  };

  const handleStop = () => {
    setIsTracking(false);
  };

  const handleReset = () => {
    if (!isTracking && data.currentStart) {
      const end = new Date();
      const durationDays = Math.floor(diffSeconds(new Date(data.currentStart), end) / 86400);
      const month = monthKey(end);
      const year = yearKey(end);

      const newRecord: StreakRecord = {
        id: Date.now(),
        startDate: data.currentStart,
        endDate: end.toISOString(),
        durationDays
      };

      setData(prev => ({
        ...prev,
        records: [...prev.records, newRecord],
        currentStart: null,
        cumulativeMonthly: { ...prev.cumulativeMonthly, [month]: (prev.cumulativeMonthly[month] || 0) + 1 },
        cumulativeYearly: { ...prev.cumulativeYearly, [year]: (prev.cumulativeYearly[year] || 0) + 1 }
      }));
      setCurrentSeconds(0);
      setIsTracking(false);
    }
  };

  const handleDelete = (id: number) => {
    setData(prev => {
      const record = prev.records.find(r => r.id === id);
      if (!record) return prev;

      const end = new Date(record.endDate);
      const month = monthKey(end);
      const year = yearKey(end);

      const monthly = { ...prev.cumulativeMonthly };
      const yearly = { ...prev.cumulativeYearly };

      if (monthly[month]) monthly[month] = Math.max(0, monthly[month] - 1);
      if (yearly[year]) yearly[year] = Math.max(0, yearly[year] - 1);

      return {
        ...prev,
        records: prev.records.filter(r => r.id !== id),
        cumulativeMonthly: monthly,
        cumulativeYearly: yearly
      };
    });
  };

  const now = new Date();
  const currentStreakSeconds = isTracking ? currentSeconds : diffSeconds(new Date(data.currentStart || now), now);
  const currentDisplay = formatDaysHHMMSS(currentStreakSeconds);
  const lastRecord = data.records[data.records.length - 1];
  const currentMonth = monthKey(now);
  const currentYear = yearKey(now);

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Streak Tracker</h1>

        {/* Current streak live timer */}
        <div className="current-section">
          <div className="stat-label">Current Streak</div>
          <div className="stat-value">{currentDisplay}</div>
          {data.currentStart && (
            <div className="timestamp">
              Started: {toIST(new Date(data.currentStart))}
            </div>
          )}
        </div>

        {/* Last streak */}
        {lastRecord && (
          <div className="last-streak">
            <div className="stat-label">Last Streak</div>
            <div className="stat-value">{lastRecord.durationDays} days</div>
            <div className="timestamp">
              {toIST(new Date(lastRecord.startDate))} → {toIST(new Date(lastRecord.endDate))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="buttons">
          {isTracking ? (
            <button onClick={handleStop} className="btn btn-stop">
              Stop
            </button>
          ) : (
            <button onClick={handleStart} className="btn btn-start">
              Start
            </button>
          )}
          {!isTracking && data.currentStart && (
            <button onClick={handleReset} className="btn btn-reset">
              Reset Streak (broken)
            </button>
          )}
        </div>

        {/* Cumulative resets */}
        <div className="cumulative-section">
          <h3 className="section-title">Cumulative Resets</h3>
          <div className="cumulative-item">
            <div>
              <div className="cumulative-label">Month</div>
              <div className="cumulative-value">{data.cumulativeMonthly[currentMonth] || 0}</div>
            </div>
          </div>
          <div className="cumulative-item">
            <div>
              <div className="cumulative-label">Year</div>
              <div className="cumulative-value">{data.cumulativeYearly[currentYear] || 0}</div>
            </div>
          </div>
        </div>

        {/* Past streaks list */}
        {data.records.length > 0 && (
          <div className="records-section">
            <h3 className="section-title">Past Streaks</h3>
            <div className="records-list">
              {data.records.slice().reverse().map(record => (
                <div key={record.id} className="record-item">
                  <div className="record-info">
                    <div className="record-range">
                      {toIST(new Date(record.startDate))} → {toIST(new Date(record.endDate))}
                    </div>
                    <div className="record-duration">
                      {record.durationDays} days
                    </div>
                    <div className="record-date-label">
                      Started {toIST(new Date(record.startDate))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="btn-delete"
                    title="Delete streak"
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
          </div>
        )}
      </div>
    </div>
  );
}

export default App;