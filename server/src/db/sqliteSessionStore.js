import session from "express-session";
import { db } from "./index.js";

export class SqliteSessionStore extends session.Store {
  async get(sid, callback) {
    try {
      const { rows } = await db.execute({ sql: "SELECT data, expires FROM sessions WHERE sid = ?", args: [sid] });
      const row = rows[0];
      if (!row || row.expires < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
      const expires = Date.now() + maxAge;
      await db.execute({
        sql: "INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) " +
          "ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data",
        args: [sid, expires, JSON.stringify(sessionData)],
      });
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await db.execute({ sql: "DELETE FROM sessions WHERE sid = ?", args: [sid] });
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}

// Expired sessions are swept periodically instead of on every write, since each
// write is now a network round-trip to the DB rather than a free local-file op.
export function startSessionCleanup(intervalMs = 10 * 60 * 1000) {
  const sweep = () => db.execute({ sql: "DELETE FROM sessions WHERE expires < ?", args: [Date.now()] }).catch(() => {});
  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  return timer;
}
