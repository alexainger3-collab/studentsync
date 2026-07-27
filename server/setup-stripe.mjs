import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookUrl = process.argv[2];
if (!webhookUrl) {
  console.error("Usage: STRIPE_SECRET_KEY=sk_test_... node setup-stripe.mjs <webhook-url>");
  process.exit(1);
}

const product = await stripe.products.create({
  name: "StudentSync Paid Plan",
  description: "Unlocks Statistics and the schedule Q&A assistant.",
});

const price = await stripe.prices.create({
  product: product.id,
  currency: "usd",
  unit_amount: 299, // $2.99
  recurring: { interval: "month" },
});

const webhook = await stripe.webhookEndpoints.create({
  url: webhookUrl,
  enabled_events: [
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ],
});

console.log(JSON.stringify({
  productId: product.id,
  priceId: price.id,
  webhookId: webhook.id,
  webhookSecret: webhook.secret,
}, null, 2));
