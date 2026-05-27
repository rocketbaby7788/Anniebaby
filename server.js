const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER,
    direction TEXT,
    amount REAL,
    currency TEXT,
    amount_usd REAL,
    region TEXT,
    platform TEXT,
    alive INTEGER,
    deletion_token TEXT
  )`);

  // Ensure deletion_token column exists for older DBs
  db.all("PRAGMA table_info(entries)", (err, cols) => {
    if (!err) {
      const hasToken = cols && cols.some(c => c.name === 'deletion_token');
      if (!hasToken) {
        db.run(`ALTER TABLE entries ADD COLUMN deletion_token TEXT`);
      }
    }
  });
  db.run(`CREATE TABLE IF NOT EXISTS rates (
    currency TEXT PRIMARY KEY,
    rate_to_usd REAL,
    ts INTEGER
  )`);
});

app.use(express.static(path.join(__dirname, 'public')));

// legacy simple insert replaced by richer insert with conversion and region detection
const crypto = require('crypto');

async function convertToUSD(amount, from) {
  const cur = (!from || !from.toString()) ? 'USD' : from.toString().toUpperCase();
  if (cur === 'USD') return Number(amount || 0);
  const now = Date.now();
  const CACHE_TTL = 12 * 3600 * 1000; // 12 hours
  // check local DB cache first
  return new Promise((resolve) => {
    db.get(`SELECT rate_to_usd, ts FROM rates WHERE currency = ?`, [cur], async (err, row) => {
      if (!err && row && row.rate_to_usd && (now - row.ts) < CACHE_TTL) {
        return resolve(Number(amount || 0) * Number(row.rate_to_usd));
      }
      // fetch from remote as fallback and update cache
          try {
            // use open.er-api.com which provides rates with USD as base
            const url = `https://open.er-api.com/v6/latest/USD`;
            const res = await fetch(url);
            const j = await res.json();
            const rates = j && j.rates ? j.rates : null;
                if (rates && rates[cur]) {
                  const rateUsdPerUnit = 1 / Number(rates[cur]); // rates[cur] is units per 1 USD
                  const ts = Date.now();
                  db.run(`INSERT OR REPLACE INTO rates (currency,rate_to_usd,ts) VALUES (?,?,?)`, [cur, rateUsdPerUnit, ts], (e)=>{
                    if (e) console.error('rate insert err', e);
                    else console.log('rate cached', cur, rateUsdPerUnit);
                  });
                  return resolve(Number(amount || 0) * rateUsdPerUnit);
                }
          } catch (e) {
            // ignore
          }
      // final fallback: treat as 1:1
      resolve(Number(amount || 0));
    });
  });
}

// helper to refresh a set of common currencies
async function refreshRatesFor(currencies) {
  try {
    const url = `https://open.er-api.com/v6/latest/USD`;
    const res = await fetch(url);
    const j = await res.json();
    const rates = j && j.rates ? j.rates : null;
    if (!rates) return;
    for (const cur of currencies) {
      if (rates[cur]){
        const rateUsdPerUnit = 1 / Number(rates[cur]);
        db.run(`INSERT OR REPLACE INTO rates (currency,rate_to_usd,ts) VALUES (?,?,?)`, [cur, rateUsdPerUnit, Date.now()], (e)=>{
          if (e) console.error('rate insert err', e);
          else console.log('rate cached', cur, rateUsdPerUnit);
        });
      }
    }
  } catch (e) {
    // ignore
  }
}

// periodic refresh every 6 hours for common currencies
const COMMON_CURRENCIES = ['CNY','USDT','BTC','ETH','EUR'];
setInterval(()=>{ refreshRatesFor(COMMON_CURRENCIES); }, 6 * 3600 * 1000);

app.post('/api/update_rates', async (req, res) => {
  const list = req.body && Array.isArray(req.body.currencies) ? req.body.currencies : COMMON_CURRENCIES;
  await refreshRatesFor(list);
  res.json({ updated: true, currencies: list });
});

async function detectRegionFromIP(ip) {
  try {
    const cleanIp = (ip || '').split(',')[0].trim();
    const target = cleanIp && cleanIp !== '::1' && cleanIp !== '127.0.0.1' ? cleanIp : '';
    if (!target) return 'unknown';
    const url = `http://ip-api.com/json/${encodeURIComponent(target)}?fields=countryCode`;
    const res = await fetch(url);
    const j = await res.json();
    return j && j.countryCode ? j.countryCode : 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

app.post('/api/entry', async (req, res) => {
  try {
    const { direction, amount, currency, region, platform, alive } = req.body;
    const ts = Date.now();
    const amt = Number(amount || 0);
    const cur = (currency || 'USD').toUpperCase();
    const amount_usd = await convertToUSD(amt, cur);
    let finalRegion = region || 'unknown';
    if (!finalRegion || finalRegion === 'unknown') {
      finalRegion = await detectRegionFromIP(req.headers['x-forwarded-for'] || req.ip);
    }
    const token = crypto.randomBytes(12).toString('hex');
    db.run(
      `INSERT INTO entries (ts,direction,amount,currency,amount_usd,region,platform,alive,deletion_token) VALUES (?,?,?,?,?,?,?,?,?)`,
      [ts, direction, amt, cur, amount_usd, finalRegion, platform || '', alive ? 1 : 0, token],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, deletion_token: token });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/delete', (req, res) => {
  const { id, token } = req.body;
  if (!id || !token) return res.status(400).json({ error: 'id and token required' });
  db.get(`SELECT deletion_token FROM entries WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'not found' });
    if (row.deletion_token !== token) return res.status(403).json({ error: 'invalid token' });
    db.run(`DELETE FROM entries WHERE id = ?`, [id], function (e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ deleted: true });
    });
  });
});

app.get('/api/convert', async (req, res) => {
  const { from, amount } = req.query;
  const a = Number(amount || 0);
  const usd = await convertToUSD(a, (from || 'USD').toUpperCase());
  res.json({ amount_usd: usd });
});

app.get('/api/privacy', (req, res) => {
  res.json({
    text: '我们只收集匿名的交易盈亏记录（时间、方向、金额、币种、地区、平台、是否活着）。不收集姓名、邮箱或钱包地址。每条记录会返回删除令牌，可用于删除该记录。'
  });
});

app.get('/api/stats', (req, res) => {
  db.get(`SELECT COUNT(*) as total, SUM(CASE WHEN direction='loss' THEN amount_usd ELSE 0 END) as total_loss, SUM(CASE WHEN direction='profit' THEN amount_usd ELSE 0 END) as total_profit FROM entries`, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

app.get('/api/leaderboard', (req, res) => {
  const since = parseInt(req.query.since || 0, 10);
  let sql = `SELECT region, COUNT(*) as cnt, SUM(CASE WHEN direction='loss' THEN amount_usd ELSE 0 END) as total_loss, SUM(CASE WHEN direction='profit' THEN amount_usd ELSE 0 END) as total_profit FROM entries`;
  const params = [];
  if (since > 0) {
    sql += ` WHERE ts >= ?`;
    params.push(since);
  }
  sql += ` GROUP BY region ORDER BY total_loss DESC LIMIT 50`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
