const express = require("express");
const { body, validationResult } = require("express-validator");
const { getDatabase } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const AlertService = require("../services/alerts");
const ThirdPartyIntegrationsService = require("../services/third-party-integrations");

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
    discord: new Promise((resolve) => {
      db.get(
        "SELECT * FROM discord_integrations WHERE agency_id = ? AND is_active = 1",
        [req.agency.agencyId],
        (err, result) => {
          resolve(err ? null : result);
        }
      );
    }),
    telegram: new Promise((resolve) => {
      db.get(
        "SELECT * FROM telegram_integrations WHERE agency_id = ? AND is_active = 1",
        [req.agency.agencyId],
        (err, result) => {
          resolve(err ? null : result);
        }
      );
    }),
    teams: new Promise((resolve) => {
      db.get(
        "SELECT * FROM teams_integrations WHERE agency_id = ? AND is_active = 1",
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
      queries.discord,
      queries.telegram,
      queries.teams,
      queries.webhooks,
      queries.general,
    ]).then(([ghl, slack, discord, telegram, teams, webhooks, general]) => {
      // Parse webhook headers from JSON
      const processedWebhooks = webhooks.map((webhook) => ({
        ...webhook,
        headers: webhook.headers ? JSON.parse(webhook.headers) : {},
      }));

      res.json({
        ghl_integration: ghl || null,
        slack_integration: slack || null,
        discord_integration: discord || null,
        telegram_integration: telegram || null,
        teams_integration: teams || null,
        webhook_settings: processedWebhooks,
        email_alerts: general?.email_alerts ?? true,
        slack_alerts: general?.slack_alerts ?? false,
        discord_alerts: general?.discord_alerts ?? false,
        telegram_alerts: general?.telegram_alerts ?? false,
        teams_alerts: general?.teams_alerts ?? false,
        webhook_alerts: general?.webhook_alerts ?? false,
        ghl_alerts: general?.ghl_alerts ?? false,
      });
    });
  });
});

// Update general alert settings
router.post("/settings", authenticateToken, (req, res) => {
  const {
    email_alerts = true,
    slack_alerts = false,
    discord_alerts = false,
    telegram_alerts = false,
    teams_alerts = false,
    webhook_alerts = false,
    ghl_alerts = false,
  } = req.body;

  const db = getDatabase();

  // Check if settings exist
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
          "UPDATE alert_settings SET email_alerts = ?, slack_alerts = ?, discord_alerts = ?, telegram_alerts = ?, teams_alerts = ?, webhook_alerts = ?, ghl_alerts = ?, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
          [
            email_alerts,
            slack_alerts,
            discord_alerts,
            telegram_alerts,
            teams_alerts,
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
          "INSERT INTO alert_settings (agency_id, email_alerts, slack_alerts, discord_alerts, telegram_alerts, teams_alerts, webhook_alerts, ghl_alerts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            req.agency.agencyId,
            email_alerts,
            slack_alerts,
            discord_alerts,
            telegram_alerts,
            teams_alerts,
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
});

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
            "UPDATE slack_integrations SET webhook_url = ?, channel = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
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
            "INSERT INTO slack_integrations (agency_id, webhook_url, channel, is_active) VALUES (?, ?, ?, 1)",
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

// Discord integration endpoints
router.post(
  "/discord-integration",
  authenticateToken,
  [
    body("webhook_url")
      .isURL()
      .withMessage("Valid Discord webhook URL is required"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { webhook_url } = req.body;
    const db = getDatabase();

    // Check if integration already exists
    db.get(
      "SELECT id FROM discord_integrations WHERE agency_id = ?",
      [req.agency.agencyId],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (existing) {
          // Update existing integration
          db.run(
            "UPDATE discord_integrations SET webhook_url = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
            [webhook_url, req.agency.agencyId],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to update Discord integration" });
              }
              res.json({ message: "Discord integration updated successfully" });
            }
          );
        } else {
          // Create new integration
          db.run(
            "INSERT INTO discord_integrations (agency_id, webhook_url, is_active) VALUES (?, ?, 1)",
            [req.agency.agencyId, webhook_url],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to create Discord integration" });
              }
              res
                .status(201)
                .json({ message: "Discord integration created successfully" });
            }
          );
        }
      }
    );
  }
);

// Telegram integration endpoints
router.post(
  "/telegram-integration",
  authenticateToken,
  [
    body("bot_token").notEmpty().withMessage("Bot token is required"),
    body("chat_id").notEmpty().withMessage("Chat ID is required"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bot_token, chat_id } = req.body;
    const db = getDatabase();

    // Check if integration already exists
    db.get(
      "SELECT id FROM telegram_integrations WHERE agency_id = ?",
      [req.agency.agencyId],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (existing) {
          // Update existing integration
          db.run(
            "UPDATE telegram_integrations SET bot_token = ?, chat_id = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
            [bot_token, chat_id, req.agency.agencyId],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to update Telegram integration" });
              }
              res.json({
                message: "Telegram integration updated successfully",
              });
            }
          );
        } else {
          // Create new integration
          db.run(
            "INSERT INTO telegram_integrations (agency_id, bot_token, chat_id, is_active) VALUES (?, ?, ?, 1)",
            [req.agency.agencyId, bot_token, chat_id],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to create Telegram integration" });
              }
              res
                .status(201)
                .json({ message: "Telegram integration created successfully" });
            }
          );
        }
      }
    );
  }
);

// Teams integration endpoints
router.post(
  "/teams-integration",
  authenticateToken,
  [
    body("webhook_url")
      .isURL()
      .withMessage("Valid Teams webhook URL is required"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { webhook_url } = req.body;
    const db = getDatabase();

    // Check if integration already exists
    db.get(
      "SELECT id FROM teams_integrations WHERE agency_id = ?",
      [req.agency.agencyId],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (existing) {
          // Update existing integration
          db.run(
            "UPDATE teams_integrations SET webhook_url = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE agency_id = ?",
            [webhook_url, req.agency.agencyId],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to update Teams integration" });
              }
              res.json({ message: "Teams integration updated successfully" });
            }
          );
        } else {
          // Create new integration
          db.run(
            "INSERT INTO teams_integrations (agency_id, webhook_url, is_active) VALUES (?, ?, 1)",
            [req.agency.agencyId, webhook_url],
            (err) => {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to create Teams integration" });
              }
              res
                .status(201)
                .json({ message: "Teams integration created successfully" });
            }
          );
        }
      }
    );
  }
);

// Enhanced webhook integration endpoints
router.post(
  "/webhook-integration",
  authenticateToken,
  [
    body("webhook_url").isURL().withMessage("Valid webhook URL is required"),
    body("name").notEmpty().withMessage("Name is required"),
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

    const { webhook_url, name, headers = {} } = req.body;
    const db = getDatabase();

    // Create new webhook integration
    db.run(
      "INSERT INTO webhook_settings (agency_id, webhook_url, name, headers, is_active) VALUES (?, ?, ?, ?, 1)",
      [req.agency.agencyId, webhook_url, name, JSON.stringify(headers)],
      (err) => {
        if (err) {
          return res
            .status(500)
            .json({ error: "Failed to create webhook integration" });
        }
        res
          .status(201)
          .json({ message: "Webhook integration created successfully" });
      }
    );
  }
);

// Update webhook integration
router.put(
  "/webhook-integration/:id",
  authenticateToken,
  [
    body("webhook_url").isURL().withMessage("Valid webhook URL is required"),
    body("name").notEmpty().withMessage("Name is required"),
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

    const { webhook_url, name, headers = {} } = req.body;
    const webhookId = req.params.id;
    const db = getDatabase();

    // Update webhook integration
    db.run(
      "UPDATE webhook_settings SET webhook_url = ?, name = ?, headers = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?",
      [
        webhook_url,
        name,
        JSON.stringify(headers),
        webhookId,
        req.agency.agencyId,
      ],
      (err) => {
        if (err) {
          return res
            .status(500)
            .json({ error: "Failed to update webhook integration" });
        }
        res.json({ message: "Webhook integration updated successfully" });
      }
    );
  }
);

// Delete webhook integration
router.delete("/webhook-integration/:id", authenticateToken, (req, res) => {
  const webhookId = req.params.id;
  const db = getDatabase();

  db.run(
    "DELETE FROM webhook_settings WHERE id = ? AND agency_id = ?",
    [webhookId, req.agency.agencyId],
    (err) => {
      if (err) {
        return res
          .status(500)
          .json({ error: "Failed to delete webhook integration" });
      }
      res.json({ message: "Webhook integration deleted successfully" });
    }
  );
});

// Test integration endpoints
router.post("/test-integration", authenticateToken, async (req, res) => {
  const { integration_type, config } = req.body;

  if (!integration_type || !config) {
    return res
      .status(400)
      .json({ error: "Integration type and config are required" });
  }

  try {
    // Get agency info for proper naming
    const db = getDatabase();
    const agency = await new Promise((resolve, reject) => {
      db.get(
        "SELECT name FROM agencies WHERE id = ?",
        [req.agency.agencyId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    // Add agency name to config
    const testConfig = {
      ...config,
      agency_name: agency?.name || "Test Agency",
    };

    const result = await ThirdPartyIntegrationsService.testIntegration(
      req.agency.agencyId,
      integration_type,
      testConfig
    );

    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Test integration error:", error);
    res.status(500).json({ error: "Failed to test integration" });
  }
});

// Test individual site alert
router.post("/test", authenticateToken, async (req, res) => {
  try {
    const { site_id } = req.body;

    if (!site_id) {
      return res.status(400).json({ error: "Site ID is required" });
    }

    const db = getDatabase();

    // Get site details
    const site = await new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM sites WHERE id = ? AND agency_id = ?",
        [site_id, req.agency.agencyId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    if (!site) {
      return res.status(404).json({ error: "Site not found" });
    }

    // Create test incident
    const testIncident = {
      id: Date.now(),
      site_id: site_id,
      status: "down",
      description: "🧪 Test alert from Agency Uptime Monitor",
      started_at: new Date().toISOString(),
    };

    // Send test alert using AlertService
    await AlertService.sendAlert(req.agency.agencyId, site, testIncident);

    res.json({
      message: "Test alert sent successfully to all configured integrations",
    });
  } catch (error) {
    console.error("Test alert error:", error);
    res.status(500).json({ error: "Failed to send test alert" });
  }
});

// Test all sites status report
router.post("/test-all-sites", authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();

    // Get all sites for this agency
    const sites = await new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM sites WHERE agency_id = ? AND is_active = 1",
        [req.agency.agencyId],
        (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        }
      );
    });

    if (sites.length === 0) {
      return res.status(400).json({ error: "No active sites found" });
    }

    // Send comprehensive status report
    await AlertService.sendAllSitesAlert(req.agency.agencyId, sites);

    res.json({
      message: `Test status report sent for ${sites.length} sites to all configured integrations`,
    });
  } catch (error) {
    console.error("Test all sites alert error:", error);
    res.status(500).json({ error: "Failed to send test status report" });
  }
});

// Get alert logs
router.get("/logs", authenticateToken, (req, res) => {
  const db = getDatabase();
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  db.all(
    `SELECT al.*, s.name as site_name, s.url as site_url 
     FROM alert_logs al 
     LEFT JOIN sites s ON al.site_id = s.id 
     WHERE al.agency_id = ? 
     ORDER BY al.sent_at DESC 
     LIMIT ? OFFSET ?`,
    [req.agency.agencyId, limit, offset],
    (err, logs) => {
      if (err) {
        return res.status(500).json({ error: "Failed to fetch alert logs" });
      }
      res.json({ logs });
    }
  );
});

module.exports = router;
