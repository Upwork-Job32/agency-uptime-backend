const express = require("express")
const path = require("path")
const fs = require("fs").promises
const { getDatabase } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const { generatePDFReport } = require("../services/reports")

const router = express.Router()

// Get reports for agency
router.get("/", authenticateToken, (req, res) => {
  const db = getDatabase()

  db.all(
    "SELECT * FROM reports WHERE agency_id = ? ORDER BY generated_at DESC",
    [req.agency.agencyId],
    (err, reports) => {
      if (err) {
        return res.status(500).json({ error: "Database error" })
      }

      res.json({ reports })
    },
  )
})

// Generate monthly report
router.post("/generate", authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.body

    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" })
    }

    // Check if PDF reports addon is active
    const db = getDatabase()

    db.get(
      "SELECT * FROM addons WHERE agency_id = ? AND addon_type = ? AND is_active = 1",
      [req.agency.agencyId, "pdf_reports"],
      async (err, addon) => {
        if (err) {
          return res.status(500).json({ error: "Database error" })
        }

        if (!addon) {
          return res.status(403).json({ error: "PDF Reports add-on not active" })
        }

        try {
          const reportPath = await generatePDFReport(req.agency.agencyId, month, year)

          // Save report record
          db.run(
            "INSERT INTO reports (agency_id, report_type, period_start, period_end, file_path) VALUES (?, ?, ?, ?, ?)",
            [
              req.agency.agencyId,
              "monthly_pdf",
              `${year}-${month.toString().padStart(2, "0")}-01`,
              `${year}-${month.toString().padStart(2, "0")}-31`,
              reportPath,
            ],
            (err) => {
              if (err) {
                console.error("Failed to save report record:", err)
              }
            },
          )

          res.json({
            message: "Report generated successfully",
            download_url: `/api/reports/download/${path.basename(reportPath)}`,
          })
        } catch (error) {
          console.error("Report generation error:", error)
          res.status(500).json({ error: "Failed to generate report" })
        }
      },
    )
  } catch (error) {
    console.error("Report generation error:", error)
    res.status(500).json({ error: "Failed to generate report" })
  }
})

// Download report
router.get("/download/:filename", authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params
    const db = getDatabase()

    // Verify report belongs to agency
    db.get(
      "SELECT * FROM reports WHERE agency_id = ? AND file_path LIKE ?",
      [req.agency.agencyId, `%${filename}`],
      async (err, report) => {
        if (err) {
          return res.status(500).json({ error: "Database error" })
        }

        if (!report) {
          return res.status(404).json({ error: "Report not found" })
        }

        try {
          const filePath = path.join(__dirname, "../", report.file_path)
          await fs.access(filePath)

          res.download(filePath, filename)
        } catch (error) {
          res.status(404).json({ error: "Report file not found" })
        }
      },
    )
  } catch (error) {
    console.error("Download error:", error)
    res.status(500).json({ error: "Failed to download report" })
  }
})

module.exports = router
