const mysql = require('mysql2/promise');
const options = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 10,
  queueLimit: 0, decimalNumbers: true, enableKeepAlive: true,
  ...(String(process.env.DB_SSL || '').toLowerCase() === 'true' ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {})
};
const pool = mysql.createPool(options);
async function query(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; }
async function one(sql, params = []) { const rows = await query(sql, params); return rows[0] || null; }
async function setting(key, fallback = '') { const row = await one('SELECT svalue FROM settings WHERE skey=?', [key]); return row ? row.svalue : fallback; }
async function saveSetting(key, value) { await query('INSERT INTO settings(skey,svalue) VALUES(?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', [key, String(value ?? '')]); }
module.exports = { pool, query, one, setting, saveSetting };
