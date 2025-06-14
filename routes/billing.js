const express = require("express")
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const { getDatabase } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Get subscription status
router.get("/subscription", authenticateToken, (req, res) => {
  const db = getDatabase()

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
        return res.status(500).json({ error: "Database error" })
      }

      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" })
      }

      res.json({
        subscription: {
          ...subscription,
          active_addons: subscription.active_addons ? subscription.active_addons.split(",") : [],
        },
      })
    },
  )
})

// Create Stripe checkout session
router.post("/create-checkout-session", authenticateToken, async (req, res) => {
  try {
    const { plan_type = "basic", addons = [] } = req.body

    const lineItems = []

    // Base plan
    if (plan_type === "basic") {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Agency Uptime - Basic Plan",
            description: "Monitor up to 1000 sites with 5-minute checks",
          },
          unit_amount: 5000, // $50.00
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      })
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
          })
          break
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
          })
          break
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
          })
          break
      }
    })

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
      client_reference_id: req.agency.agencyId.toString(),
      metadata: {
        agency_id: req.agency.agencyId.toString(),
        plan_type,
        addons: JSON.stringify(addons),
      },
    })

    res.json({ checkout_url: session.url })
  } catch (error) {
    console.error("Stripe checkout error:", error)
    res.status(500).json({ error: "Failed to create checkout session" })
  }
})

// Handle successful payment
router.get("/success/:session_id", authenticateToken, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.session_id)

    if (session.client_reference_id !== req.agency.agencyId.toString()) {
      return res.status(403).json({ error: "Unauthorized" })
    }

    const db = getDatabase()

    // Update subscription
    db.run(
      "UPDATE subscriptions SET status = ?, stripe_subscription_id = ?, current_period_start = ?, current_period_end = ? WHERE agency_id = ?",
      [
        "active",
        session.subscription,
        new Date(),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        req.agency.agencyId,
      ],
      (err) => {
        if (err) {
          console.error("Database error:", err)
          return res.status(500).json({ error: "Failed to update subscription" })
        }

        // Update agency subscription status
        db.run("UPDATE agencies SET subscription_status = ? WHERE id = ?", ["active", req.agency.agencyId])

        res.json({ message: "Subscription activated successfully" })
      },
    )
  } catch (error) {
    console.error("Payment success error:", error)
    res.status(500).json({ error: "Failed to process payment success" })
  }
})

// Toggle add-on
router.post("/toggle-addon", authenticateToken, async (req, res) => {
  const { addon_type } = req.body

  if (!["pdf_reports", "status_pages", "resell_dashboard"].includes(addon_type)) {
    return res.status(400).json({ error: "Invalid addon type" })
  }

  const db = getDatabase()

  // Check if addon exists
  db.get(
    "SELECT * FROM addons WHERE agency_id = ? AND addon_type = ?",
    [req.agency.agencyId, addon_type],
    (err, addon) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      if (addon) {
        // Toggle existing addon
        db.run("UPDATE addons SET is_active = ? WHERE id = ?", [addon.is_active ? 0 : 1, addon.id], (err) => {
          if (err) {
            return res.status(500).json({ error: "Failed to toggle addon" })
          }

          res.json({
            message: `Add-on ${addon.is_active ? "deactivated" : "activated"} successfully`,
            is_active: !addon.is_active,
          })
        })
      } else {
        // Create new addon
        db.run(
          "INSERT INTO addons (agency_id, addon_type, is_active) VALUES (?, ?, ?)",
          [req.agency.agencyId, addon_type, 1],
          (err) => {
            if (err) {
              return res.status(500).json({ error: "Failed to activate addon" })
            }

            res.json({
              message: "Add-on activated successfully",
              is_active: true,
            })
          },
        )
      }
    },
  )
})

module.exports = router
