const express = require("express")
const { body, validationResult } = require("express-validator")
const { getDatabase } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Get all sites for agency
router.get("/", authenticateToken, (req, res) => {
  const db = getDatabase()

  db.all(
    `SELECT s.*, 
     (SELECT COUNT(*) FROM monitoring_logs ml WHERE ml.site_id = s.id AND ml.status = 'up' AND ml.checked_at > datetime('now', '-24 hours')) as uptime_24h,
     (SELECT COUNT(*) FROM monitoring_logs ml WHERE ml.site_id = s.id AND ml.checked_at > datetime('now', '-24 hours')) as total_checks_24h,
     (SELECT ml.status FROM monitoring_logs ml WHERE ml.site_id = s.id ORDER BY ml.checked_at DESC LIMIT 1) as current_status
     FROM sites s WHERE s.agency_id = ? ORDER BY s.created_at DESC`,
    [req.agency.agencyId],
    (err, sites) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      // Calculate uptime percentage
      const sitesWithUptime = sites.map((site) => ({
        ...site,
        uptime_percentage: site.total_checks_24h > 0 ? ((site.uptime_24h / site.total_checks_24h) * 100).toFixed(2) : 0,
      }))

      res.json({ sites: sitesWithUptime })
    },
  )
})

// Get single site
router.get("/:id", authenticateToken, (req, res) => {
  const db = getDatabase()

  db.get("SELECT * FROM sites WHERE id = ? AND agency_id = ?", [req.params.id, req.agency.agencyId], (err, site) => {
    if (err) {
      return res.status(500).json({ error: "Database error" })
    }

    if (!site) {
      return res.status(404).json({ error: "Site not found" })
    }

    res.json({ site })
  })
})

// Add new site
router.post(
  "/",
  authenticateToken,
  [
    body("name").notEmpty().withMessage("Site name is required"),
    body("url").isURL().withMessage("Valid URL is required"),
    body("check_interval").optional().isInt({ min: 60 }).withMessage("Check interval must be at least 60 seconds"),
  ],
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { name, url, check_interval = 300, check_type = "http", tags } = req.body
    const db = getDatabase()

    // Check site limit (1000 sites per agency as per TOS)
    db.get("SELECT COUNT(*) as site_count FROM sites WHERE agency_id = ?", [req.agency.agencyId], (err, result) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      if (result.site_count >= 1000) {
        return res.status(400).json({ error: "Site limit reached (1000 sites maximum)" })
      }

      db.run(
        "INSERT INTO sites (agency_id, name, url, check_interval, check_type, tags) VALUES (?, ?, ?, ?, ?, ?)",
        [req.agency.agencyId, name, url, check_interval, check_type, tags],
        function (err) {
          if (err) {
            return res.status(500).json({ error: "Failed to add site" })
          }

          res.status(201).json({
            message: "Site added successfully",
            site: {
              id: this.lastID,
              name,
              url,
              check_interval,
              check_type,
              tags,
              is_active: 1,
            },
          })
        },
      )
    })
  },
)

// Update site
router.put(
  "/:id",
  authenticateToken,
  [
    body("name").optional().notEmpty().withMessage("Site name cannot be empty"),
    body("url").optional().isURL().withMessage("Valid URL is required"),
    body("check_interval").optional().isInt({ min: 60 }).withMessage("Check interval must be at least 60 seconds"),
  ],
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }

    const { name, url, check_interval, check_type, tags, is_active } = req.body
    const db = getDatabase()

    const updates = []
    const values = []

    if (name) {
      updates.push("name = ?")
      values.push(name)
    }
    if (url) {
      updates.push("url = ?")
      values.push(url)
    }
    if (check_interval) {
      updates.push("check_interval = ?")
      values.push(check_interval)
    }
    if (check_type) {
      updates.push("check_type = ?")
      values.push(check_type)
    }
    if (tags !== undefined) {
      updates.push("tags = ?")
      values.push(tags)
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?")
      values.push(is_active ? 1 : 0)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" })
    }

    updates.push("updated_at = CURRENT_TIMESTAMP")
    values.push(req.params.id, req.agency.agencyId)

    db.run(`UPDATE sites SET ${updates.join(", ")} WHERE id = ? AND agency_id = ?`, values, function (err) {
      if (err) {
        return res.status(500).json({ error: "Failed to update site" })
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Site not found" })
      }

      res.json({ message: "Site updated successfully" })
    })
  },
)

// Delete site
router.delete("/:id", authenticateToken, (req, res) => {
  const db = getDatabase()

  db.run("DELETE FROM sites WHERE id = ? AND agency_id = ?", [req.params.id, req.agency.agencyId], function (err) {
    if (err) {
      return res.status(500).json({ error: "Failed to delete site" })
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: "Site not found" })
    }

    res.json({ message: "Site deleted successfully" })
  })
})

// Get site monitoring logs
router.get("/:id/logs", authenticateToken, (req, res) => {
  const { limit = 50, offset = 0 } = req.query
  const db = getDatabase()

  // First verify site belongs to agency
  db.get("SELECT id FROM sites WHERE id = ? AND agency_id = ?", [req.params.id, req.agency.agencyId], (err, site) => {
    if (err) {
      return res.status(500).json({ error: "Database error" })
    }

    if (!site) {
      return res.status(404).json({ error: "Site not found" })
    }

    // Get monitoring logs
    db.all(
      "SELECT * FROM monitoring_logs WHERE site_id = ? ORDER BY checked_at DESC LIMIT ? OFFSET ?",
      [req.params.id, Number.parseInt(limit), Number.parseInt(offset)],
      (err, logs) => {
        if (err) {
          return res.status(500).json({ error: "Database error" })
        }

        res.json({ logs })
      },
    )
  })
})

// Get site incidents
router.get("/:id/incidents", authenticateToken, (req, res) => {
  const db = getDatabase()

  // First verify site belongs to agency
  db.get("SELECT id FROM sites WHERE id = ? AND agency_id = ?", [req.params.id, req.agency.agencyId], (err, site) => {
    if (err) {
      return res.status(500).json({ error: "Database error" })
    }

    if (!site) {
      return res.status(404).json({ error: "Site not found" })
    }

    // Get incidents
    db.all("SELECT * FROM incidents WHERE site_id = ? ORDER BY started_at DESC", [req.params.id], (err, incidents) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      res.json({ incidents })
    })
  })
})

module.exports = router
