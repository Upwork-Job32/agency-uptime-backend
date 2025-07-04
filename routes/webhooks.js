const express = require("express");
const { getDatabase } = require("../config/database");

const router = express.Router();

// Worker node report endpoint
router.post("/report", (req, res) => {
  const {
    site_id,
    status,
    response_time,
    status_code,
    error_message,
    worker_node,
  } = req.body;

  if (!site_id || !status || !worker_node) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const db = getDatabase();

  // Log the monitoring result
  db.run(
    "INSERT INTO monitoring_logs (site_id, status, response_time, status_code, error_message, worker_node) VALUES (?, ?, ?, ?, ?, ?)",
    [site_id, status, response_time, status_code, error_message, worker_node],
    (err) => {
      if (err) {
        console.error("Failed to log monitoring result:", err);
        return res.status(500).json({ error: "Failed to log result" });
      }

      // Check if this is a status change that requires incident management
      db.get(
        "SELECT status FROM monitoring_logs WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1 OFFSET 1",
        [site_id],
        (err, previousLog) => {
          if (err) {
            console.error("Error checking previous status:", err);
            return res.json({ message: "Report logged successfully" });
          }

          const previousStatus = previousLog ? previousLog.status : "up";

          if (status === "down" && previousStatus === "up") {
            // Site went down - create incident
            db.run(
              "INSERT INTO incidents (site_id, status, started_at, description) VALUES (?, ?, ?, ?)",
              [
                site_id,
                "down",
                new Date().toISOString(),
                error_message || "Site is down",
              ],
              function (err) {
                if (err) {
                  console.error("Failed to create incident:", err);
                } else {
                  // Trigger alerts
                  triggerAlerts(site_id, this.lastID, "down");
                }
              }
            );
          } else if (status === "up" && previousStatus === "down") {
            // Site came back up - resolve incident
            db.run(
              'UPDATE incidents SET status = ?, resolved_at = ?, duration = ? WHERE site_id = ? AND status = "down"',
              ["resolved", new Date().toISOString(), null, site_id],
              (err) => {
                if (err) {
                  console.error("Failed to resolve incident:", err);
                } else {
                  // Trigger recovery alerts
                  triggerAlerts(site_id, null, "up");
                }
              }
            );
          }

          res.json({ message: "Report logged successfully" });
        }
      );
    }
  );
});

// Stripe webhook handler
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = getDatabase();

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;

        // Update subscription status
        if (session.client_reference_id) {
          const agencyId = Number.parseInt(session.client_reference_id);

          // Update subscription status
          db.run(
            "UPDATE subscriptions SET status = ?, plan_type = ?, stripe_subscription_id = ?, current_period_start = ?, current_period_end = ? WHERE agency_id = ?",
            [
              "active",
              "basic", // Pro plan is stored as "basic"
              session.subscription,
              new Date().toISOString(),
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              agencyId,
            ],
            (err) => {
              if (err) {
                console.error("Failed to update subscription:", err);
              } else {
                console.log(`Subscription activated for agency ${agencyId}`);
              }
            }
          );

          // Update agency subscription status
          db.run(
            "UPDATE agencies SET subscription_status = ? WHERE id = ?",
            ["active", agencyId],
            (err) => {
              if (err) {
                console.error("Failed to update agency status:", err);
              } else {
                console.log(
                  `Agency ${agencyId} subscription status updated to active`
                );
              }
            }
          );

          // Handle add-ons if present in metadata
          if (session.metadata && session.metadata.addons) {
            try {
              const addons = JSON.parse(session.metadata.addons);

              // Add each addon to the database
              addons.forEach((addonType) => {
                db.run(
                  "INSERT OR REPLACE INTO addons (agency_id, addon_type, is_active, created_at) VALUES (?, ?, ?, ?)",
                  [agencyId, addonType, 1, new Date().toISOString()],
                  (err) => {
                    if (err) {
                      console.error(`Failed to add addon ${addonType}:`, err);
                    } else {
                      console.log(
                        `Added addon ${addonType} for agency ${agencyId}`
                      );
                    }
                  }
                );
              });
            } catch (err) {
              console.error("Failed to parse addons metadata:", err);
            }
          }
        }
        break;

      case "invoice.payment_failed":
        const invoice = event.data.object;

        // Handle failed payment
        if (invoice.subscription) {
          db.run(
            "UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?",
            ["past_due", invoice.subscription],
            (err) => {
              if (err) {
                console.error(
                  "Failed to update subscription status to past_due:",
                  err
                );
              } else {
                console.log(
                  `Subscription ${invoice.subscription} marked as past_due`
                );
              }
            }
          );
        }
        break;

      case "customer.subscription.deleted":
        const subscription = event.data.object;

        // Handle subscription cancellation
        db.run(
          "UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?",
          ["canceled", subscription.id],
          (err) => {
            if (err) {
              console.error(
                "Failed to update subscription status to canceled:",
                err
              );
            } else {
              console.log(`Subscription ${subscription.id} marked as canceled`);
            }
          }
        );
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
);

// Helper function to trigger alerts
async function triggerAlerts(siteId, incidentId, status) {
  const db = getDatabase();

  // Get site and agency info
  db.get(
    "SELECT s.*, a.* FROM sites s JOIN agencies a ON s.agency_id = a.id WHERE s.id = ?",
    [siteId],
    async (err, result) => {
      if (err || !result) {
        console.error("Failed to get site info for alerts:", err);
        return;
      }

      try {
        const alertService = require("../services/alerts");
        await alertService.sendAlert(
          result.agency_id,
          result,
          { id: incidentId, status },
          "all"
        );
      } catch (error) {
        console.error("Failed to send alerts:", error);
      }
    }
  );
}

module.exports = router;
