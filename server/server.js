import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'streak-data.json');

app.use(cors());
app.use(express.json());

// API: Get current server time
app.get('/api/time', (req, res) => {
  res.json({ time: new Date().toISOString() });
});

// API: Get saved streak data
app.get('/api/streak', (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return res.json(parsed);
    }
    return res.json({ records: [], currentStart: null, cumulativeMonthly: {}, cumulativeYearly: {} });
  } catch (error) {
    console.error('❌ Failed to read streak data:', error);
    return res.status(500).json({ error: 'Failed to read streak data' });
  }
});

// API: Save streak data
app.post('/api/streak', (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    console.log('✅ Streak data saved:', new Date().toISOString());
    return res.json({ success: true, message: 'Streak data saved' });
  } catch (error) {
    console.error('❌ Failed to save streak data:', error);
    return res.status(500).json({ success: false, error: 'Failed to save streak data' });
  }
});

// API: Reset daily streak - records reset and returns reset count
app.post('/api/streak/reset', (req, res) => {
  console.log('✅ Streak reset recorded:', req.body?.date);
  res.json({ success: true, resetCount: 0, message: 'Daily streak reset recorded' });
});

app.listen(PORT, () => {
  console.log(`✅ Day counter server running on port ${PORT}`);
});
