import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const productId = process.argv[2];
const oldPriceId = process.argv[3];
const currency = process.argv[4] || "usd";
if (!productId) {
  console.error("Usage: STRIPE_SECRET_KEY=sk_live_... node update-price.mjs <productId> [oldPriceIdToArchive] [currency]");
  process.exit(1);
}

const price = await stripe.prices.create({
  product: productId,
  currency,
  unit_amount: 399, // 3.99 in the smallest unit (cents/pence)
  recurring: { interval: "month" },
});

if (oldPriceId) {
  await stripe.prices.update(oldPriceId, { active: false });
}

console.log(JSON.stringify({ newPriceId: price.id, archivedOldPrice: oldPriceId || null }, null, 2));
