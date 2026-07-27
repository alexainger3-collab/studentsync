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

export async function createUser(email, passwordHash) {
  const info = await db.execute({
    sql: "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    args: [email, passwordHash],
  });
  const userId = Number(info.lastInsertRowid);
  await db.execute({
    sql: "INSERT INTO app_data (user_id, data) VALUES (?, ?)",
    args: [userId, JSON.stringify(DEFAULT_APP_DATA)],
  });
  return findUserById(userId);
}

export async function findUserByEmail(email) {
  const { rows } = await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email] });
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const { rows } = await db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return rows[0] ?? null;
}

export async function setUserTier(userId, tier) {
  await db.execute({
    sql: "UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?",
    args: [tier, userId],
  });
}

export function toPublicUser(user) {
  return { id: user.id, email: user.email, tier: user.tier };
}
