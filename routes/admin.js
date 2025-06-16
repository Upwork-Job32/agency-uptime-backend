const express = require("express");
const { getDatabase } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { monitoringService } = require("../services/monitoring");
const trialCheckerService = require("../services/trialChecker");

const router = express.Router();

// Dashboard stats
router.get("/dashboard", authenticateToken, (req, res) => {
  const db = getDatabase();

  // Get various stats for the agency
  const queries = [
    "SELECT COUNT(*) as total_sites FROM sites WHERE agency_id = ?",
    "SELECT COUNT(*) as active_sites FROM sites WHERE agency_id = ? AND is_active = 1",
    'SELECT COUNT(*) as total_incidents FROM incidents i JOIN sites s ON i.site_id = s.id WHERE s.agency_id = ? AND i.started_at > datetime("now", "-30 days")',
    'SELECT COUNT(*) as total_alerts FROM alerts WHERE agency_id = ? AND sent_at > datetime("now", "-30 days")',
  ];

  const stats = {};
  let completed = 0;

  queries.forEach((query, index) => {
    db.get(query, [req.agency.agencyId], (err, result) => {
      if (err) {
        console.error("Dashboard query error:", err);
        return;
      }

      const keys = [
        "total_sites",
        "active_sites",
        "total_incidents",
        "total_alerts",
      ];
      stats[keys[index]] = Object.values(result)[0];

      completed++;
      if (completed === queries.length) {
        // Get uptime percentage for last 24 hours
        db.get(
          `SELECT 
           COUNT(CASE WHEN ml.status = 'up' THEN 1 END) as up_checks,
           COUNT(*) as total_checks
           FROM monitoring_logs ml 
           JOIN sites s ON ml.site_id = s.id 
           WHERE s.agency_id = ? AND ml.checked_at > datetime('now', '-24 hours')`,
          [req.agency.agencyId],
          (err, uptimeResult) => {
            if (err) {
              console.error("Uptime query error:", err);
              stats.uptime_percentage = 0;
            } else {
              stats.uptime_percentage =
                uptimeResult.total_checks > 0
                  ? (
                      (uptimeResult.up_checks / uptimeResult.total_checks) *
                      100
                    ).toFixed(2)
                  : 0;
            }

            res.json({ stats });
          }
        );
      }
    });
  });
});

// Get recent activity
router.get("/activity", authenticateToken, (req, res) => {
  const { limit = 20 } = req.query;
  const db = getDatabase();

  db.all(
    `SELECT 
     'incident' as type, 
     i.id,
     s.name as site_name,
     i.status,
     i.started_at as timestamp,
     i.description
     FROM incidents i 
     JOIN sites s ON i.site_id = s.id 
     WHERE s.agency_id = ?
     
     UNION ALL
     
     SELECT 
     'alert' as type,
     a.id,
     s.name as site_name,
     a.type as status,
     a.sent_at as timestamp,
     a.message as description
     FROM alerts a 
     JOIN sites s ON a.site_id = s.id 
     WHERE a.agency_id = ?
     
     ORDER BY timestamp DESC 
     LIMIT ?`,
    [req.agency.agencyId, req.agency.agencyId, Number.parseInt(limit)],
    (err, activities) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ activities });
    }
  );
});

// Manual monitoring check for specific site
router.post(
  "/monitoring/check/:siteId",
  authenticateToken,
  async (req, res) => {
    try {
      const db = getDatabase();

      // Verify site belongs to agency
      db.get(
        "SELECT * FROM sites WHERE id = ? AND agency_id = ?",
        [req.params.siteId, req.agency.agencyId],
        async (err, site) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }

          if (!site) {
            return res.status(404).json({ error: "Site not found" });
          }

          // Trigger manual check
          try {
            await monitoringService.checkSite(site);
            res.json({ message: "Manual check completed", site: site.name });
          } catch (error) {
            console.error("Manual check error:", error);
            res.status(500).json({ error: "Failed to check site" });
          }
        }
      );
    } catch (error) {
      console.error("Manual monitoring check error:", error);
      res.status(500).json({ error: "Failed to trigger check" });
    }
  }
);

// Get monitoring service status
router.get("/monitoring/status", authenticateToken, (req, res) => {
  const db = getDatabase();

  // Get active sites count for this specific agency
  db.get(
    "SELECT COUNT(*) as active_sites FROM sites WHERE agency_id = ? AND is_active = 1",
    [req.agency.agencyId],
    (err, result) => {
      if (err) {
        console.error("Error getting active sites count:", err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        isRunning: monitoringService.isRunning,
        activeSiteTimers: result.active_sites || 0, // Agency-specific count
        checkInterval: monitoringService.checkInterval,
        totalSystemSites: monitoringService.siteTimers.size, // Optional: show total system count
      });
    }
  );
});

// Restart monitoring service
router.post("/monitoring/restart", authenticateToken, (req, res) => {
  try {
    monitoringService.stop();
    setTimeout(() => {
      monitoringService.start();
      res.json({ message: "Monitoring service restarted" });
    }, 1000);
  } catch (error) {
    console.error("Monitoring restart error:", error);
    res.status(500).json({ error: "Failed to restart monitoring service" });
  }
});

// Trial management endpoints

// Get trial checker service status
router.get("/trials/status", authenticateToken, (req, res) => {
  const status = trialCheckerService.getStatus();
  res.json({
    service: status,
    message: "Trial checker service status retrieved",
  });
});

// Manually trigger trial expiry check
router.post("/trials/check", authenticateToken, async (req, res) => {
  try {
    await trialCheckerService.triggerCheck();
    res.json({ message: "Trial expiry check completed successfully" });
  } catch (error) {
    console.error("Manual trial check error:", error);
    res.status(500).json({ error: "Failed to run trial check" });
  }
});

// Get all trial users and their status
router.get("/trials/list", authenticateToken, (req, res) => {
  const db = getDatabase();

  db.all(
    `SELECT 
     a.id, a.name, a.email, a.created_at as agency_created,
     s.plan_type, s.status, s.trial_start_date, s.current_period_end,
     CASE 
       WHEN s.trial_start_date IS NOT NULL 
       THEN CAST((julianday('now') - julianday(s.trial_start_date)) AS INTEGER)
       ELSE NULL 
     END as days_since_trial_start
     FROM agencies a
     LEFT JOIN subscriptions s ON a.id = s.agency_id
     WHERE s.plan_type = 'trial' OR s.status = 'trialing' OR s.status = 'expired'
     ORDER BY s.trial_start_date DESC`,
    [],
    (err, trials) => {
      if (err) {
        console.error("Error fetching trials:", err);
        return res.status(500).json({ error: "Database error" });
      }

      const enrichedTrials = trials.map((trial) => ({
        ...trial,
        is_expired: trial.days_since_trial_start >= 15,
        days_remaining: Math.max(0, 15 - (trial.days_since_trial_start || 0)),
      }));

      res.json({
        trials: enrichedTrials,
        total: enrichedTrials.length,
        active_trials: enrichedTrials.filter((t) => t.status === "trialing")
          .length,
        expired_trials: enrichedTrials.filter((t) => t.status === "expired")
          .length,
      });
    }
  );
});

module.exports = router;
