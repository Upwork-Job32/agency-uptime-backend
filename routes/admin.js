const express = require("express")
const { getDatabase } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Dashboard stats
router.get("/dashboard", authenticateToken, (req, res) => {
  const db = getDatabase()

  // Get various stats for the agency
  const queries = [
    "SELECT COUNT(*) as total_sites FROM sites WHERE agency_id = ?",
    "SELECT COUNT(*) as active_sites FROM sites WHERE agency_id = ? AND is_active = 1",
    'SELECT COUNT(*) as total_incidents FROM incidents i JOIN sites s ON i.site_id = s.id WHERE s.agency_id = ? AND i.started_at > datetime("now", "-30 days")',
    'SELECT COUNT(*) as total_alerts FROM alerts WHERE agency_id = ? AND sent_at > datetime("now", "-30 days")',
  ]

  const stats = {}
  let completed = 0

  queries.forEach((query, index) => {
    db.get(query, [req.agency.agencyId], (err, result) => {
      if (err) {
        console.error("Dashboard query error:", err)
        return
      }

      const keys = ["total_sites", "active_sites", "total_incidents", "total_alerts"]
      stats[keys[index]] = Object.values(result)[0]

      completed++
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
              console.error("Uptime query error:", err)
              stats.uptime_percentage = 0
            } else {
              stats.uptime_percentage =
                uptimeResult.total_checks > 0
                  ? ((uptimeResult.up_checks / uptimeResult.total_checks) * 100).toFixed(2)
                  : 0
            }

            res.json({ stats })
          },
        )
      }
    })
  })
})

// Get recent activity
router.get("/activity", authenticateToken, (req, res) => {
  const { limit = 20 } = req.query
  const db = getDatabase()

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
        return res.status(500).json({ error: "Database error" })
      }

      res.json({ activities })
    },
  )
})

module.exports = router
