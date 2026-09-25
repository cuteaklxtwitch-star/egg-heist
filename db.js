// Player accounts, saved progress and gamepass purchases.
// Uses Postgres when DATABASE_URL is set (Render Postgres, Neon, Supabase…).
// Without it, falls back to a local data.json file — fine on your own computer,
// but on Render that file is wiped on every deploy, so set DATABASE_URL there.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let pool = null;          // Postgres
let file = null;          // JSON fallback: { users: [], sessions: {}, purchases: {} }
let fileTimer = null;

export async function initDb() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        pass_hash TEXT NOT NULL,
        save JSONB,
        passes JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS purchases (
        stripe_session TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pass TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    console.log('Database: Postgres');
  } else {
    const f = path.join(dir, 'data.json');
    try { file = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { file = { users: [], sessions: {}, purchases: {} }; }
    console.log('Database: local data.json (set DATABASE_URL to use Postgres)');
  }
}

function persistFile() {
  clearTimeout(fileTimer);
  fileTimer = setTimeout(() => fs.writeFile(path.join(dir, 'data.json'), JSON.stringify(file), () => {}), 500);
}

// ---------------- passwords ----------------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

// ---------------- users ----------------
const shape = (u) => u && { id: u.id, username: u.username, passHash: u.pass_hash, save: u.save || null, passes: u.passes || [] };

export async function createUser(username, passHash, save) {
  if (pool) {
    try {
      const r = await pool.query('INSERT INTO users (username, pass_hash, save) VALUES ($1, $2, $3) RETURNING *', [username, passHash, save]);
      return shape(r.rows[0]);
    } catch (e) {
      if (e.code === '23505') return null; // username taken
      throw e;
    }
  }
  if (file.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return null;
  const u = { id: file.users.length + 1, username, pass_hash: passHash, save, passes: [] };
  file.users.push(u); persistFile();
  return shape(u);
}

export async function getUserByName(username) {
  if (pool) {
    const r = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
    return shape(r.rows[0]);
  }
  return shape(file.users.find((u) => u.username.toLowerCase() === username.toLowerCase()));
}

export async function getUser(id) {
  if (pool) return shape((await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0]);
  return shape(file.users.find((u) => u.id === id));
}

export async function saveProgress(userId, save) {
  if (pool) return pool.query('UPDATE users SET save = $2 WHERE id = $1', [userId, save]);
  const u = file.users.find((x) => x.id === userId);
  if (u) { u.save = save; persistFile(); }
}

// ---------------- sessions (log-in tokens) ----------------
export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  if (pool) await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  else { file.sessions[token] = userId; persistFile(); }
  return token;
}
export async function userByToken(token) {
  if (!token || typeof token !== 'string' || token.length !== 64) return null;
  if (pool) {
    const r = await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1', [token]);
    return shape(r.rows[0]);
  }
  const id = file.sessions[token];
  return id ? getUser(id) : null;
}
export async function deleteSession(token) {
  if (pool) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  else { delete file.sessions[token]; persistFile(); }
}

// ---------------- purchases ----------------
// Returns true if this Stripe payment was new (so each payment is only granted once).
export async function addPass(userId, pass, stripeSession) {
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query('INSERT INTO purchases (stripe_session, user_id, pass) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [stripeSession, userId, pass]);
      if (!ins.rowCount) { await client.query('ROLLBACK'); return false; }
      await client.query(`UPDATE users SET passes = (SELECT jsonb_agg(DISTINCT p) FROM jsonb_array_elements_text(passes || to_jsonb($2::text)) p) WHERE id = $1`, [userId, pass]);
      await client.query('COMMIT');
      return true;
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  if (file.purchases[stripeSession]) return false;
  const u = file.users.find((x) => x.id === userId);
  if (!u) return false;
  file.purchases[stripeSession] = { userId, pass };
  if (!u.passes.includes(pass)) u.passes.push(pass);
  persistFile();
  return true;
}
