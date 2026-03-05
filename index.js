require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { DateTime } = require('luxon');
const { pool, initDb } = require('./db');

const app  = express();
const PORT = process.env.PORT || 4000;
const NPT  = 'Asia/Kathmandu';

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'DELETE', 'PATCH'],
}));
app.use(express.json());

const STAGE_DAYS = [1, 4, 7];

function calcNextDue(stage, fromMoment) {
  if (stage >= STAGE_DAYS.length) return null;
  return fromMoment
    .plus({ days: STAGE_DAYS[stage] })
    .setZone(NPT)
    .endOf('day')
    .toISO();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: DateTime.now().setZone(NPT).toISO() });
});

app.get('/api/items', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM revision_items
      ORDER BY
        CASE WHEN stage >= 3 THEN 1 ELSE 0 END,
        next_due_at ASC NULLS LAST,
        created_at ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/items', async (req, res) => {
  const { title, question = null, notes = null, tags = [] } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  try {
    const now = DateTime.now().setZone(NPT);
    const next_due_at = calcNextDue(0, now);
    const { rows } = await pool.query(
      `INSERT INTO revision_items (title, question, notes, tags, stage, next_due_at)
       VALUES ($1, $2, $3, $4, 0, $5) RETURNING *`,
      [title.trim(), question, notes, tags, next_due_at]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/items/:id/revise', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM revision_items WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    let item = rows[0];
    const now = DateTime.now().setZone(NPT);
    if (item.stage >= 3) return res.json({ ...item, message: 'Already mastered!' });
    const newStage    = item.stage + 1;
    const next_due_at = calcNextDue(newStage, now);
    const newHistory  = [...(item.history || []), { revised_at: now.toISO(), stage_completed: item.stage }];
    const { rows: updated } = await pool.query(
      `UPDATE revision_items
       SET stage = $1, last_revised_at = $2, next_due_at = $3, history = $4
       WHERE id = $5 RETURNING *`,
      [newStage, now.toISO(), next_due_at, JSON.stringify(newHistory), id]
    );
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.patch('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { title, question, notes, tags } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE revision_items
       SET title = COALESCE($1, title), question = COALESCE($2, question),
           notes = COALESCE($3, notes), tags = COALESCE($4, tags)
       WHERE id = $5 RETURNING *`,
      [title, question, notes, tags, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM revision_items WHERE id = $1', [id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`🚀 Backend on port ${PORT}`));
}).catch(err => { console.error('❌ DB init failed:', err); process.exit(1); });
