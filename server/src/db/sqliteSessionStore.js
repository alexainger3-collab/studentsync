import session from "express-session";
import { db } from "./index.js";

const getStmt = db.prepare("SELECT data, expires FROM sessions WHERE sid = ?");
const upsertStmt = db.prepare(
  "INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) " +
  "ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data"
);
const destroyStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
const clearExpiredStmt = db.prepare("DELETE FROM sessions WHERE expires < ?");

export class SqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = getStmt.get(sid);
      if (!row || row.expires < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const maxAge = sessionData.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
      const expires = Date.now() + maxAge;
      upsertStmt.run(sid, expires, JSON.stringify(sessionData));
      clearExpiredStmt.run(Date.now());
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid, callback) {
    try {
      destroyStmt.run(sid);
      callback?.(null);
    } catch (err) {
      callback?.(err);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}
