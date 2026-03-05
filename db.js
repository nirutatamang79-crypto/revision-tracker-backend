const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS revision_items (
        id         SERIAL PRIMARY KEY,
        title      TEXT NOT NULL,
        question   TEXT,
        notes      TEXT,
        tags       TEXT[]              DEFAULT '{}',
        stage      INTEGER             DEFAULT 0,
        last_revised_at TIMESTAMPTZ,
        next_due_at     TIMESTAMPTZ,
        created_at      TIMESTAMPTZ     DEFAULT NOW(),
        history         JSONB           DEFAULT '[]'::JSONB
      );
    `);
    console.log('✅  DB ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
