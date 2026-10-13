require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
(async () => {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) throw new Error('Set DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD before migration.');
  const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: false,
  ...(String(process.env.DB_SSL || '').toLowerCase() === 'true'
    ? {
        ssl: {
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          ca: fs.readFileSync(
            path.join(__dirname, 'aiven-ca.pem'),
            'utf8'
          )
        }
      }
    : {})
});
  const sql = fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8').replace(/^\s*--.*$/gm,'');
  for (const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await db.query(statement);
  const alters = [
    "ALTER TABLE service_overrides ADD COLUMN markup_enabled TINYINT(1) NOT NULL DEFAULT 1",
    "ALTER TABLE number_pool_overrides ADD COLUMN markup_enabled TINYINT(1) NOT NULL DEFAULT 1",
    "ALTER TABLE orders ADD COLUMN request_key VARCHAR(100) NULL",
    "ALTER TABLE orders ADD COLUMN provider_session_id VARCHAR(160) NULL",
    "ALTER TABLE orders ADD COLUMN provider_activation_id VARCHAR(160) NULL",
    "ALTER TABLE orders ADD COLUMN phone_number VARCHAR(80) NULL",
    "ALTER TABLE orders ADD COLUMN otp_code VARCHAR(100) NULL",
    "ALTER TABLE orders ADD COLUMN expires_at DATETIME NULL",
    "ALTER TABLE orders ADD COLUMN last_polled_at DATETIME NULL"
  ];
  for (const sql of alters) { try { await db.query(sql); } catch (e) { if (!['ER_DUP_FIELDNAME','ER_DUP_KEYNAME'].includes(e.code)) throw e; } }
  await db.end(); console.log('Migration complete. Existing tables/data were preserved.');
})().catch(e=>{console.error('Migration failed:',e.message);process.exit(1)});
