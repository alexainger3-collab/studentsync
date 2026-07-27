import { Router } from "express";
import { stripe } from "../lib/stripeClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  findUserById,
  setUserStripeCustomerId,
  setSubscriptionByCustomerId,
  hasProcessedBillingEvent,
  markBillingEventProcessed,
  markTrialUsed,
} from "../db/users.js";

export const billingRouter = Router();

billingRouter.post("/create-checkout-session", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: String(user.id) },
    });
    customerId = customer.id;
    await setUserStripeCustomerId(user.id, customerId);
  }

  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const trialEligible = !user.trial_used;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${clientUrl}/?checkout=success`,
    cancel_url: `${clientUrl}/?checkout=cancel`,
    // This account has Stripe's newer "Managed Payments" on by default, which
    // requires a tax code on the product. Not needed for this app — disable it
    // rather than configure tax categorization for a simple subscription.
    managed_payments: { enabled: false },
    ...(trialEligible ? { subscription_data: { trial_period_days: 14 } } : {}),
  });

  // Mark eagerly (not on webhook) so an abandoned checkout can't be retried
  // for a fresh trial — one trial per account, regardless of completion.
  if (trialEligible) await markTrialUsed(user.id);

  res.json({ url: session.url });
});

// Lets a paid user manage/cancel their subscription via Stripe's own portal,
// rather than us building subscription-management UI ourselves.
billingRouter.post("/create-portal-session", requireAuth, async (req, res) => {
  const user = await findUserById(req.session.userId);
  if (!user.stripe_customer_id) {
    return res.status(400).json({ error: "No subscription on file." });
  }
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: clientUrl,
  });
  res.json({ url: portalSession.url });
});

// Mounted separately in app.js with express.raw() — needs the exact raw
// request body to verify Stripe's signature, so it can't go through the
// app-wide express.json() parser.
export async function stripeWebhookHandler(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (await hasProcessedBillingEvent(event.id)) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.customer && session.subscription) {
          await setSubscriptionByCustomerId(session.customer, "paid", session.subscription);
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const active = sub.status === "active" || sub.status === "trialing";
        await setSubscriptionByCustomerId(sub.customer, active ? "paid" : "free", sub.id);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await setSubscriptionByCustomerId(sub.customer, "free", null);
        break;
      }
      default:
        break;
    }
    await markBillingEventProcessed(event.id, event.type);
    res.json({ received: true });
  } catch (err) {
    console.error("Error processing Stripe webhook:", err);
    res.status(500).json({ error: "Webhook processing failed." });
  }
}
