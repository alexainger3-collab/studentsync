import { db } from "./index.js";

const DEFAULT_APP_DATA = {
  onboarded: false,
  profile: { sleepHours: 8, studyHoursPerWeek: 10 },
  term: { start: "", end: "" },
  holidays: [],
  commitments: [],
  activities: [],
  supercurricular: [],
  completions: {},
  sleepLog: [],
};

const insertUserStmt = db.prepare(
  "INSERT INTO users (email, password_hash) VALUES (?, ?)"
);
const insertAppDataStmt = db.prepare(
  "INSERT INTO app_data (user_id, data) VALUES (?, ?)"
);
const findByEmailStmt = db.prepare("SELECT * FROM users WHERE email = ?");
const findByIdStmt = db.prepare("SELECT * FROM users WHERE id = ?");
const setTierStmt = db.prepare(
  "UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?"
);

export function createUser(email, passwordHash) {
  const info = insertUserStmt.run(email, passwordHash);
  const userId = Number(info.lastInsertRowid);
  insertAppDataStmt.run(userId, JSON.stringify(DEFAULT_APP_DATA));
  return findByIdStmt.get(userId);
}

export function findUserByEmail(email) {
  return findByEmailStmt.get(email);
}

export function findUserById(id) {
  return findByIdStmt.get(id);
}

export function setUserTier(userId, tier) {
  setTierStmt.run(tier, userId);
}

export function toPublicUser(user) {
  return { id: user.id, email: user.email, tier: user.tier };
}
