const express = require("express")
const { getDatabase } = require("../config/database")

const router = express.Router()

// Public status page for a domain
router.get("/page/:domain", (req, res) => {
  const { domain } = req.params
  const db = getDatabase()

  // Find agency by custom domain
  db.get("SELECT * FROM agencies WHERE custom_domain = ?", [domain], (err, agency) => {
    if (err) {
      return res.status(500).json({ error: "Database error" })
    }

    if (!agency) {
      return res.status(404).json({ error: "Status page not found" })
    }

    // Check if status pages addon is active
    db.get(
      "SELECT * FROM addons WHERE agency_id = ? AND addon_type = ? AND is_active = 1",
      [agency.id, "status_pages"],
      (err, addon) => {
        if (err) {
          return res.status(500).json({ error: "Database error" })
        }

        if (!addon) {
          return res.status(404).json({ error: "Status page not available" })
        }

        // Get sites for this agency
        db.all(
          `SELECT s.*, 
             (SELECT ml.status FROM monitoring_logs ml WHERE ml.site_id = s.id ORDER BY ml.checked_at DESC LIMIT 1) as current_status,
             (SELECT COUNT(*) FROM monitoring_logs ml WHERE ml.site_id = s.id AND ml.status = 'up' AND ml.checked_at > datetime('now', '-24 hours')) as uptime_24h,
             (SELECT COUNT(*) FROM monitoring_logs ml WHERE ml.site_id = s.id AND ml.checked_at > datetime('now', '-24 hours')) as total_checks_24h
             FROM sites s WHERE s.agency_id = ? AND s.is_active = 1`,
          [agency.id],
          (err, sites) => {
            if (err) {
              return res.status(500).json({ error: "Database error" })
            }

            const sitesWithUptime = sites.map((site) => ({
              id: site.id,
              name: site.name,
              url: site.url,
              current_status: site.current_status || "unknown",
              uptime_percentage:
                site.total_checks_24h > 0 ? ((site.uptime_24h / site.total_checks_24h) * 100).toFixed(2) : 0,
            }))

            res.json({
              agency: {
                name: agency.name,
                logo_url: agency.logo_url,
                brand_color: agency.brand_color,
              },
              sites: sitesWithUptime,
              last_updated: new Date().toISOString(),
            })
          },
        )
      },
    )
  })
})

// Get incidents for status page
router.get("/page/:domain/incidents", (req, res) => {
  const { domain } = req.params
  const db = getDatabase()

  // Find agency by custom domain
  db.get("SELECT id FROM agencies WHERE custom_domain = ?", [domain], (err, agency) => {
    if (err) {
      return res.status(500).json({ error: "Database error" })
    }

    if (!agency) {
      return res.status(404).json({ error: "Status page not found" })
    }

    // Get recent incidents
    db.all(
      `SELECT i.*, s.name as site_name 
         FROM incidents i 
         JOIN sites s ON i.site_id = s.id 
         WHERE s.agency_id = ? 
         ORDER BY i.started_at DESC 
         LIMIT 10`,
      [agency.id],
      (err, incidents) => {
        if (err) {
          return res.status(500).json({ error: "Database error" })
        }

        res.json({ incidents })
      },
    )
  })
})

module.exports = router
