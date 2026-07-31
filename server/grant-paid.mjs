import { createClient } from "@libsql/client";

const email = process.argv[2];
const tier = process.argv[3] || "paid";
const url = process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!email || !url) {
  console.error("Usage: DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node grant-paid.mjs <email> [tier]");
  process.exit(1);
}

const db = createClient(authToken ? { url, authToken } : { url });

const { rows: before } = await db.execute({
  sql: "SELECT id, email, tier FROM users WHERE email = ?",
  args: [email],
});
if (!before.length) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}

await db.execute({
  sql: "UPDATE users SET tier = ?, updated_at = datetime('now') WHERE email = ?",
  args: [tier, email],
});

const { rows: after } = await db.execute({
  sql: "SELECT id, email, tier FROM users WHERE email = ?",
  args: [email],
});

console.log(JSON.stringify({ before: before[0], after: after[0] }, null, 2));
