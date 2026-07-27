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

export async function findUserByStripeCustomerId(customerId) {
  const { rows } = await db.execute({ sql: "SELECT * FROM users WHERE stripe_customer_id = ?", args: [customerId] });
  return rows[0] ?? null;
}

export async function setUserStripeCustomerId(userId, customerId) {
  await db.execute({
    sql: "UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?",
    args: [customerId, userId],
  });
}

export async function setSubscriptionByCustomerId(customerId, tier, subscriptionId) {
  await db.execute({
    sql: "UPDATE users SET tier = ?, stripe_subscription_id = ?, updated_at = datetime('now') WHERE stripe_customer_id = ?",
    args: [tier, subscriptionId, customerId],
  });
}

// Webhook idempotency — Stripe can and will redeliver the same event.
export async function hasProcessedBillingEvent(eventId) {
  const { rows } = await db.execute({ sql: "SELECT 1 FROM billing_events WHERE stripe_event_id = ?", args: [eventId] });
  return rows.length > 0;
}

export async function markBillingEventProcessed(eventId, type) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO billing_events (stripe_event_id, type) VALUES (?, ?)",
    args: [eventId, type],
  });
}

export function toPublicUser(user) {
  return { id: user.id, email: user.email, tier: user.tier };
}
