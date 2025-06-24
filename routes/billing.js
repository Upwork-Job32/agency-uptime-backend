const express = require("express");
const { getDatabase } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const config = require("../config/environment");

// Initialize Stripe with test key
const stripe = require("stripe")(config.STRIPE_SECRET_KEY);

const router = express.Router();

// Get subscription status
router.get("/subscription", authenticateToken, (req, res) => {
  const db = getDatabase();

  db.get(
    `SELECT s.*, 
     GROUP_CONCAT(a.addon_type) as active_addons
     FROM subscriptions s 
     LEFT JOIN addons a ON s.agency_id = a.agency_id AND a.is_active = 1
     WHERE s.agency_id = ?
     GROUP BY s.id`,
    [req.agency.agencyId],
    (err, subscription) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      if (!subscription) {
        // Create default trial subscription if none exists
        const now = new Date();
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 15);

        db.run(
          "INSERT INTO subscriptions (agency_id, plan_type, status, current_period_start, current_period_end) VALUES (?, ?, ?, ?, ?)",
          [
            req.agency.agencyId,
            "trial",
            "trialing",
            now.toISOString(),
            trialEndDate.toISOString(),
          ],
          function (err) {
            if (err) {
              return res
                .status(500)
                .json({ error: "Failed to create trial subscription" });
            }

            res.json({
              subscription: {
                id: this.lastID,
                agency_id: req.agency.agencyId,
                plan_type: "trial",
                status: "trialing",
                current_period_start: now.toISOString(),
                current_period_end: trialEndDate.toISOString(),
                stripe_subscription_id: null,
                active_addons: [],
              },
            });
          }
        );
      } else {
        res.json({
          subscription: {
            ...subscription,
            active_addons: subscription.active_addons
              ? subscription.active_addons.split(",")
              : [],
          },
        });
      }
    }
  );
});

// Get Stripe publishable key
router.get("/config", (req, res) => {
  res.json({
    publishableKey: config.STRIPE_PUBLISHABLE_KEY,
  });
});

// Create Stripe checkout session
router.post("/create-checkout-session", authenticateToken, async (req, res) => {
  try {
    const { plan_type = "basic", addons = [] } = req.body;

    const lineItems = [];

    // Base plan
    if (plan_type === "basic") {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Agency Uptime - Professional Plan",
            description: "Monitor unlimited sites with 1-minute checks",
          },
          unit_amount: 5000, // $50.00
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      });
    }

    // Add-ons
    addons.forEach((addon) => {
      switch (addon) {
        case "pdf_reports":
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: {
                name: "PDF Reports Add-on",
                description: "Monthly branded PDF reports",
              },
              unit_amount: 2900, // $29.00
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          });
          break;
        case "status_pages":
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: {
                name: "Status Pages Add-on",
                description: "Public status pages for your clients",
              },
              unit_amount: 1900, // $19.00
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          });
          break;
        case "resell_dashboard":
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: {
                name: "Resell Dashboard Add-on",
                description: "White-labeled client dashboard",
              },
              unit_amount: 4900, // $49.00
              recurring: {
                interval: "month",
              },
            },
            quantity: 1,
          });
          break;
      }
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "subscription",
      success_url: `${config.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.FRONTEND_URL}/billing/cancel`,
      client_reference_id: req.agency.agencyId.toString(),
      metadata: {
        agency_id: req.agency.agencyId.toString(),
        plan_type,
        addons: JSON.stringify(addons),
      },
    });

    res.json({ checkout_url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Handle successful payment
router.get("/success/:session_id", authenticateToken, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.params.session_id
    );

    if (session.client_reference_id !== req.agency.agencyId.toString()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const db = getDatabase();

    // Update subscription in a transaction-like manner
    db.serialize(() => {
      // Update subscription
      db.run(
        "UPDATE subscriptions SET status = ?, stripe_subscription_id = ?, current_period_start = ?, current_period_end = ?, plan_type = ? WHERE agency_id = ?",
        [
          "active",
          session.subscription,
          new Date().toISOString(),
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          "basic", // Pro plan is always "basic" in our system
          req.agency.agencyId,
        ],
        function (err) {
          if (err) {
            console.error("Database error updating subscription:", err);
            return res
              .status(500)
              .json({ error: "Failed to update subscription" });
          }

          console.log(`Subscription updated for agency ${req.agency.agencyId}`);

          // Update agency subscription status
          db.run(
            "UPDATE agencies SET subscription_status = ? WHERE id = ?",
            ["active", req.agency.agencyId],
            (err) => {
              if (err) {
                console.error("Failed to update agency status:", err);
              } else {
                console.log(
                  `Agency ${req.agency.agencyId} status updated to active`
                );
              }
            }
          );

          // Handle add-ons if present in metadata
          if (session.metadata && session.metadata.addons) {
            try {
              const addons = JSON.parse(session.metadata.addons);
              console.log(
                `Processing ${addons.length} add-ons for agency ${req.agency.agencyId}:`,
                addons
              );

              // Add each addon to the database
              let processedAddons = 0;
              const totalAddons = addons.length;

              if (totalAddons === 0) {
                return res.json({
                  message: "Subscription activated successfully",
                  subscription: {
                    status: "active",
                    stripe_subscription_id: session.subscription,
                    plan_type: session.metadata?.plan_type || "basic",
                  },
                });
              }

              addons.forEach((addonType) => {
                db.run(
                  "INSERT OR REPLACE INTO addons (agency_id, addon_type, is_active, created_at) VALUES (?, ?, ?, ?)",
                  [req.agency.agencyId, addonType, 1, new Date().toISOString()],
                  function (err) {
                    processedAddons++;

                    if (err) {
                      console.error(`Failed to add addon ${addonType}:`, err);
                    } else {
                      console.log(
                        `Successfully added addon ${addonType} for agency ${req.agency.agencyId} (ID: ${this.lastID})`
                      );
                    }

                    // Send response when all add-ons are processed
                    if (processedAddons === totalAddons) {
                      res.json({
                        message: "Subscription activated successfully",
                        subscription: {
                          status: "active",
                          stripe_subscription_id: session.subscription,
                          plan_type: session.metadata?.plan_type || "basic",
                          addons_processed: totalAddons,
                        },
                      });
                    }
                  }
                );
              });
            } catch (err) {
              console.error("Failed to parse addons metadata:", err);
              res.json({
                message:
                  "Subscription activated successfully, but failed to process add-ons",
                subscription: {
                  status: "active",
                  stripe_subscription_id: session.subscription,
                  plan_type: session.metadata?.plan_type || "basic",
                },
                warning: "Add-ons may not have been activated",
              });
            }
          } else {
            // No add-ons to process
            res.json({
              message: "Subscription activated successfully",
              subscription: {
                status: "active",
                stripe_subscription_id: session.subscription,
                plan_type: session.metadata?.plan_type || "basic",
              },
            });
          }
        }
      );
    });
  } catch (error) {
    console.error("Payment success error:", error);
    res.status(500).json({ error: "Failed to process payment success" });
  }
});

// Cancel subscription
router.post("/cancel-subscription", authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();

    // Get current subscription
    db.get(
      "SELECT * FROM subscriptions WHERE agency_id = ?",
      [req.agency.agencyId],
      async (err, subscription) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!subscription || !subscription.stripe_subscription_id) {
          return res
            .status(404)
            .json({ error: "No active subscription found" });
        }

        try {
          // Cancel subscription in Stripe
          await stripe.subscriptions.cancel(
            subscription.stripe_subscription_id
          );

          // Update database
          db.run(
            "UPDATE subscriptions SET status = ? WHERE agency_id = ?",
            ["canceled", req.agency.agencyId],
            (err) => {
              if (err) {
                console.error("Database error:", err);
                return res
                  .status(500)
                  .json({ error: "Failed to update subscription status" });
              }

              res.json({ message: "Subscription canceled successfully" });
            }
          );
        } catch (stripeError) {
          console.error("Stripe cancellation error:", stripeError);
          res.status(500).json({ error: "Failed to cancel subscription" });
        }
      }
    );
  } catch (error) {
    console.error("Cancel subscription error:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// Update payment method
router.post("/update-payment-method", authenticateToken, async (req, res) => {
  try {
    const { payment_method_id } = req.body;
    const db = getDatabase();

    // Get current subscription
    db.get(
      "SELECT * FROM subscriptions WHERE agency_id = ?",
      [req.agency.agencyId],
      async (err, subscription) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!subscription || !subscription.stripe_subscription_id) {
          return res
            .status(404)
            .json({ error: "No active subscription found" });
        }

        try {
          // Get the subscription from Stripe
          const stripeSubscription = await stripe.subscriptions.retrieve(
            subscription.stripe_subscription_id
          );

          // Update the default payment method
          await stripe.subscriptions.update(
            subscription.stripe_subscription_id,
            {
              default_payment_method: payment_method_id,
            }
          );

          res.json({ message: "Payment method updated successfully" });
        } catch (stripeError) {
          console.error("Stripe update error:", stripeError);
          res.status(500).json({ error: "Failed to update payment method" });
        }
      }
    );
  } catch (error) {
    console.error("Update payment method error:", error);
    res.status(500).json({ error: "Failed to update payment method" });
  }
});

// Get billing history
router.get("/invoices", authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();

    // Get current subscription
    db.get(
      "SELECT * FROM subscriptions WHERE agency_id = ?",
      [req.agency.agencyId],
      async (err, subscription) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!subscription || !subscription.stripe_subscription_id) {
          return res.json({ invoices: [] });
        }

        try {
          // Get invoices from Stripe
          const invoices = await stripe.invoices.list({
            subscription: subscription.stripe_subscription_id,
            limit: 12,
          });

          res.json({
            invoices: invoices.data.map((invoice) => ({
              id: invoice.id,
              amount_due: invoice.amount_due,
              amount_paid: invoice.amount_paid,
              currency: invoice.currency,
              status: invoice.status,
              created: invoice.created,
              period_start: invoice.period_start,
              period_end: invoice.period_end,
              hosted_invoice_url: invoice.hosted_invoice_url,
              invoice_pdf: invoice.invoice_pdf,
            })),
          });
        } catch (stripeError) {
          console.error("Stripe invoices error:", stripeError);
          res.status(500).json({ error: "Failed to fetch invoices" });
        }
      }
    );
  } catch (error) {
    console.error("Get invoices error:", error);
    res.status(500).json({ error: "Failed to get billing history" });
  }
});

module.exports = router;
