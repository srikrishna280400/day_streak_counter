import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API: Get current server time
app.get('/api/time', (req, res) => {
  res.json({ time: new Date().toISOString() });
});

// API: Save a streak entry
app.post('/api/streak', (req, res) => {
  const streakData = req.body;
  console.log('✅ Streak entry saved:', streakData.date, 'at', new Date().toLocaleTimeString());
  res.json({ success: true, message: 'Streak saved' });
});

// API: Reset daily streak - records reset and returns reset count
app.post('/api/streak/reset', (req, res) => {
  const { date, resetCount } = req.body;
  console.log('✅ Streak reset recorded for', date, '- reset count:', resetCount);
  res.json({ success: true, resetCount, message: 'Daily streak reset recorded' });
});

app.listen(PORT, () => {
  console.log(`✅ Day counter server running on port ${PORT}`);
});