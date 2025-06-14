const express = require("express")
const { body, validationResult } = require("express-validator")
const { getDatabase } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Get alert history for agency
router.get("/", authenticateToken, (req, res) => {
  const { limit = 50, offset = 0 } = req.query
  const db = getDatabase()

  db.all(
    `SELECT a.*, s.name as site_name, s.url as site_url 
     FROM alerts a 
     JOIN sites s ON a.site_id = s.id 
     WHERE a.agency_id = ? 
     ORDER BY a.sent_at DESC 
     LIMIT ? OFFSET ?`,
    [req.agency.agencyId, Number.parseInt(limit), Number.parseInt(offset)],
    (err, alerts) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      res.json({ alerts })
    },
  )
})

// Get alert settings for agency
router.get("/settings", authenticateToken, (req, res) => {
  const db = getDatabase()

  // Get GHL integration settings
  db.get("SELECT * FROM ghl_integrations WHERE agency_id = ?", [req.agency.agencyId], (err, ghlIntegration) => {
    if (err) {
      return res.status(500).json({ error: "Database error" })
    }

    res.json({
      ghl_integration: ghlIntegration || null,
      email_alerts: true, // Default enabled
      webhook_alerts: false, // Default disabled
    })
  })
})

// Update GHL integration settings
router.post(
  "/ghl-integration",
  authenticateToken,
  [
    body("location_id").notEmpty().withMessage("GHL Location ID is required"),
    body("webhook_url").optional().isURL().withMessage("Valid webhook URL required"),
    body("api_key").optional().notEmpty().withMessage("API key cannot be empty"),
  ],
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { location_id, webhook_url, api_key } = req.body
    const db = getDatabase()

    // Check if integration already exists
    db.get("SELECT id FROM ghl_integrations WHERE agency_id = ?", [req.agency.agencyId], (err, existing) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      if (existing) {
        // Update existing integration
        db.run(
          "UPDATE ghl_integrations SET location_id = ?, webhook_url = ?, api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
          [location_id, webhook_url, api_key, req.agency.agencyId],
          (err) => {
            if (err) {
              return res.status(500).json({ error: "Failed to update GHL integration" })
            }

            res.json({ message: "GHL integration updated successfully" })
          },
        )
      } else {
        // Create new integration
        db.run(
          "INSERT INTO ghl_integrations (agency_id, location_id, webhook_url, api_key) VALUES (?, ?, ?, ?)",
          [req.agency.agencyId, location_id, webhook_url, api_key],
          (err) => {
            if (err) {
              return res.status(500).json({ error: "Failed to create GHL integration" })
            }

            res.status(201).json({ message: "GHL integration created successfully" })
          },
        )
      }
    })
  },
)

// Test alert (for testing purposes)
router.post(
  "/test",
  authenticateToken,
  [
    body("site_id").isInt().withMessage("Valid site ID is required"),
    body("type").isIn(["email", "ghl", "webhook"]).withMessage("Valid alert type is required"),
  ],
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { site_id, type } = req.body
    const db = getDatabase()

    // Verify site belongs to agency
    db.get("SELECT * FROM sites WHERE id = ? AND agency_id = ?", [site_id, req.agency.agencyId], async (err, site) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      if (!site) {
        return res.status(404).json({ error: "Site not found" })
      }

      try {
        const alertService = require("../services/alerts")

        // Create test incident
        const testIncident = {
          site_id: site.id,
          status: "down",
          started_at: new Date().toISOString(),
          description: "Test alert",
        }

        await alertService.sendAlert(req.agency.agencyId, site, testIncident, type)

        res.json({ message: "Test alert sent successfully" })
      } catch (error) {
        console.error("Test alert error:", error)
        res.status(500).json({ error: "Failed to send test alert" })
      }
    })
  },
)

module.exports = router
