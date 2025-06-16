const express = require("express");
const { body, validationResult } = require("express-validator");
const { getDatabase } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Get alert history for agency
router.get("/", authenticateToken, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const db = getDatabase();

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
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ alerts });
    }
  );
});

// Get alert settings for agency
router.get("/settings", authenticateToken, (req, res) => {
  const db = getDatabase();

  // Get all alert settings in parallel
  const queries = {
    ghl: new Promise((resolve) => {
      db.get(
        "SELECT * FROM ghl_integrations WHERE agency_id = ?",
        [req.agency.agencyId],
        (err, result) => {
          resolve(err ? null : result);
        }
      );
    }),
    slack: new Promise((resolve) => {
      db.get(
        "SELECT * FROM slack_integrations WHERE agency_id = ? AND is_active = 1",
        [req.agency.agencyId],
        (err, result) => {
          resolve(err ? null : result);
        }
      );
    }),
    webhooks: new Promise((resolve) => {
      db.all(
        "SELECT * FROM webhook_settings WHERE agency_id = ? AND is_active = 1",
        [req.agency.agencyId],
        (err, result) => {
          resolve(err ? [] : result);
        }
      );
    }),
    general: new Promise((resolve) => {
      db.get(
        "SELECT * FROM alert_settings WHERE agency_id = ?",
        [req.agency.agencyId],
        (err, result) => {
          resolve(err ? null : result);
        }
      );
    }),
  };

  Promise.all(Object.values(queries)).then(() => {
    Promise.all([
      queries.ghl,
      queries.slack,
      queries.webhooks,
      queries.general,
    ]).then(([ghl, slack, webhooks, general]) => {
      // Parse webhook headers from JSON
      const processedWebhooks = webhooks.map((webhook) => ({
        ...webhook,
        headers: webhook.headers ? JSON.parse(webhook.headers) : {},
      }));

      res.json({
        ghl_integration: ghl || null,
        slack_integration: slack || null,
        webhook_settings: processedWebhooks,
        email_alerts: general?.email_alerts ?? true,
        slack_alerts: general?.slack_alerts ?? false,
        webhook_alerts: general?.webhook_alerts ?? false,
        ghl_alerts: general?.ghl_alerts ?? false,
      });
    });
  });
});

// Update general alert settings
router.post(
  "/general-settings",
  authenticateToken,
  [
    body("email_alerts")
      .isBoolean()
      .withMessage("Email alerts must be boolean"),
    body("slack_alerts")
      .isBoolean()
      .withMessage("Slack alerts must be boolean"),
    body("webhook_alerts")
      .isBoolean()
      .withMessage("Webhook alerts must be boolean"),
    body("ghl_alerts").isBoolean().withMessage("GHL alerts must be boolean"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email_alerts, slack_alerts, webhook_alerts, ghl_alerts } = req.body;
    const db = getDatabase();

    // Check if settings already exist
    db.get(
      "SELECT id FROM alert_settings WHERE agency_id = ?",
      [req.agency.agencyId],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (existing) {
          // Update existing settings
          db.run(
            "UPDATE alert_settings SET email_alerts = ?, slack_alerts = ?, webhook_alerts = ?, ghl_alerts = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
            [
              email_alerts,
              slack_alerts,
              webhook_alerts,
              ghl_alerts,
              req.agency.agencyId,
            ],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to update alert settings" });
              }
              res.json({ message: "Alert settings updated successfully" });
            }
          );
        } else {
          // Create new settings
          db.run(
            "INSERT INTO alert_settings (agency_id, email_alerts, slack_alerts, webhook_alerts, ghl_alerts) VALUES (?, ?, ?, ?, ?)",
            [
              req.agency.agencyId,
              email_alerts,
              slack_alerts,
              webhook_alerts,
              ghl_alerts,
            ],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to create alert settings" });
              }
              res
                .status(201)
                .json({ message: "Alert settings created successfully" });
            }
          );
        }
      }
    );
  }
);

// Update Slack integration settings
router.post(
  "/slack-integration",
  authenticateToken,
  [
    body("webhook_url").isURL().withMessage("Valid webhook URL is required"),
    body("channel")
      .optional()
      .notEmpty()
      .withMessage("Channel cannot be empty if provided"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { webhook_url, channel } = req.body;
    const db = getDatabase();

    // Check if integration already exists
    db.get(
      "SELECT id FROM slack_integrations WHERE agency_id = ?",
      [req.agency.agencyId],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (existing) {
          // Update existing integration
          db.run(
            "UPDATE slack_integrations SET webhook_url = ?, channel = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
            [webhook_url, channel, req.agency.agencyId],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to update Slack integration" });
              }
              res.json({ message: "Slack integration updated successfully" });
            }
          );
        } else {
          // Create new integration
          db.run(
            "INSERT INTO slack_integrations (agency_id, webhook_url, channel) VALUES (?, ?, ?)",
            [req.agency.agencyId, webhook_url, channel],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to create Slack integration" });
              }
              res
                .status(201)
                .json({ message: "Slack integration created successfully" });
            }
          );
        }
      }
    );
  }
);

// Add webhook settings
router.post(
  "/webhook-settings",
  authenticateToken,
  [
    body("webhook_url").isURL().withMessage("Valid webhook URL is required"),
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Name cannot be empty if provided"),
    body("headers")
      .optional()
      .isObject()
      .withMessage("Headers must be an object"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { webhook_url, name, headers } = req.body;
    const db = getDatabase();

    db.run(
      "INSERT INTO webhook_settings (agency_id, webhook_url, name, headers) VALUES (?, ?, ?, ?)",
      [req.agency.agencyId, webhook_url, name, JSON.stringify(headers || {})],
      function (err) {
        if (err) {
          return res
            .status(500)
            .json({ error: "Failed to create webhook settings" });
        }
        res.status(201).json({
          message: "Webhook settings created successfully",
          id: this.lastID,
        });
      }
    );
  }
);

// Delete webhook settings
router.delete("/webhook-settings/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const db = getDatabase();

  // Verify webhook belongs to agency
  db.get(
    "SELECT id FROM webhook_settings WHERE id = ? AND agency_id = ?",
    [id, req.agency.agencyId],
    (err, webhook) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }

      db.run("DELETE FROM webhook_settings WHERE id = ?", [id], (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to delete webhook" });
        }
        res.json({ message: "Webhook deleted successfully" });
      });
    }
  );
});

// Update GHL integration settings
router.post(
  "/ghl-integration",
  authenticateToken,
  [
    body("location_id").notEmpty().withMessage("GHL Location ID is required"),
    body("webhook_url")
      .optional()
      .isURL()
      .withMessage("Valid webhook URL required"),
    body("api_key")
      .optional()
      .notEmpty()
      .withMessage("API key cannot be empty"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { location_id, webhook_url, api_key } = req.body;
    const db = getDatabase();

    // Check if integration already exists
    db.get(
      "SELECT id FROM ghl_integrations WHERE agency_id = ?",
      [req.agency.agencyId],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (existing) {
          // Update existing integration
          db.run(
            "UPDATE ghl_integrations SET location_id = ?, webhook_url = ?, api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
            [location_id, webhook_url, api_key, req.agency.agencyId],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to update GHL integration" });
              }

              res.json({ message: "GHL integration updated successfully" });
            }
          );
        } else {
          // Create new integration
          db.run(
            "INSERT INTO ghl_integrations (agency_id, location_id, webhook_url, api_key) VALUES (?, ?, ?, ?)",
            [req.agency.agencyId, location_id, webhook_url, api_key],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to create GHL integration" });
              }

              res
                .status(201)
                .json({ message: "GHL integration created successfully" });
            }
          );
        }
      }
    );
  }
);

// Test alert (for testing purposes)
router.post(
  "/test",
  authenticateToken,
  [
    body("site_id").isInt().withMessage("Valid site ID is required"),
    body("type")
      .isIn(["email", "ghl", "webhook", "slack"])
      .withMessage("Valid alert type is required"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { site_id, type } = req.body;
    const db = getDatabase();

    // Verify site belongs to agency
    db.get(
      "SELECT * FROM sites WHERE id = ? AND agency_id = ?",
      [site_id, req.agency.agencyId],
      async (err, site) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!site) {
          return res.status(404).json({ error: "Site not found" });
        }

        try {
          const alertService = require("../services/alerts");

          // Create test incident
          const testIncident = {
            site_id: site.id,
            status: "down",
            started_at: new Date().toISOString(),
            description:
              "Test alert - This is a test notification from Agency Uptime",
          };

          await alertService.sendAlert(
            req.agency.agencyId,
            site,
            testIncident,
            type
          );

          res.json({ message: "Test alert sent successfully" });
        } catch (error) {
          console.error("Test alert error:", error);
          res.status(500).json({ error: "Failed to send test alert" });
        }
      }
    );
  }
);

// Test alert for all sites (comprehensive status report)
router.post(
  "/test-all-sites",
  authenticateToken,
  [
    body("type")
      .isIn(["email", "ghl", "webhook", "slack"])
      .withMessage("Valid alert type is required"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type } = req.body;
    const db = getDatabase();

    // Get all sites for this agency
    db.all(
      "SELECT * FROM sites WHERE agency_id = ? ORDER BY name ASC",
      [req.agency.agencyId],
      async (err, sites) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!sites || sites.length === 0) {
          return res.status(404).json({ error: "No sites found" });
        }

        try {
          const alertService = require("../services/alerts");

          // Send comprehensive status report
          await alertService.sendAllSitesAlert(
            req.agency.agencyId,
            sites,
            type
          );

          res.json({
            message: "All sites status report sent successfully",
            sites_count: sites.length,
          });
        } catch (error) {
          console.error("All sites test alert error:", error);
          res
            .status(500)
            .json({ error: "Failed to send all sites status report" });
        }
      }
    );
  }
);

module.exports = router;
