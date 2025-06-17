const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const { getDatabase } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { generatePDFReport } = require("../services/reports");
const PDFDocument = require("pdfkit");

const router = express.Router();

// Middleware to detect if request is from custom domain
const detectCustomDomain = (req, res, next) => {
  const host = req.get("host");

  // Check if it's a reports subdomain
  if (host && host.includes("reports.")) {
    const domain = host.replace("reports.", "");
    req.customDomain = domain;
    req.isCustomDomain = true;
  }

  next();
};

// Get reports for agency
router.get("/", authenticateToken, (req, res) => {
  const db = getDatabase();

  db.all(
    "SELECT * FROM reports WHERE agency_id = ? ORDER BY generated_at DESC",
    [req.agency.agencyId],
    (err, reports) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      res.json({ reports });
    }
  );
});

// Generate monthly report
router.post("/generate", authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }

    // Check if PDF reports addon is active
    const db = getDatabase();

    db.get(
      "SELECT * FROM addons WHERE agency_id = ? AND addon_type = ? AND is_active = 1",
      [req.agency.agencyId, "pdf_reports"],
      async (err, addon) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!addon) {
          return res
            .status(403)
            .json({ error: "PDF Reports add-on not active" });
        }

        try {
          const reportPath = await generatePDFReport(
            req.agency.agencyId,
            month,
            year
          );

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
                console.error("Failed to save report record:", err);
              }
            }
          );

          res.json({
            message: "Report generated successfully",
            download_url: `/api/reports/download/${path.basename(reportPath)}`,
          });
        } catch (error) {
          console.error("Report generation error:", error);
          res.status(500).json({ error: "Failed to generate report" });
        }
      }
    );
  } catch (error) {
    console.error("Report generation error:", error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// Download report
router.get("/download/:filename", authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const db = getDatabase();

    // Verify report belongs to agency
    db.get(
      "SELECT * FROM reports WHERE agency_id = ? AND file_path LIKE ?",
      [req.agency.agencyId, `%${filename}`],
      async (err, report) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!report) {
          return res.status(404).json({ error: "Report not found" });
        }

        try {
          const filePath = path.join(__dirname, "../", report.file_path);
          await fs.access(filePath);

          res.download(filePath, filename);
        } catch (error) {
          res.status(404).json({ error: "Report file not found" });
        }
      }
    );
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Failed to download report" });
  }
});

// Public white-labeled report access (no auth required for custom domains)
router.get("/public/:reportId", detectCustomDomain, (req, res) => {
  const { reportId } = req.params;
  const db = getDatabase();

  if (req.isCustomDomain) {
    // Find agency by custom domain
    db.get(
      "SELECT * FROM agencies WHERE custom_domain = ?",
      [req.customDomain],
      (err, agency) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        if (!agency) {
          return res.status(404).json({ error: "Agency not found" });
        }

        // Get the report for this agency
        db.get(
          "SELECT * FROM reports WHERE id = ? AND agency_id = ?",
          [reportId, agency.id],
          (err, report) => {
            if (err) {
              return res.status(500).json({ error: "Database error" });
            }

            if (!report) {
              return res.status(404).json({ error: "Report not found" });
            }

            // Serve the white-labeled report
            const reportPath = path.join(__dirname, "..", report.file_path);
            if (fs.existsSync(reportPath)) {
              res.setHeader("Content-Type", "application/pdf");
              res.setHeader(
                "Content-Disposition",
                `inline; filename="${agency.name}_Report_${reportId}.pdf"`
              );
              fs.createReadStream(reportPath).pipe(res);
            } else {
              res.status(404).json({ error: "Report file not found" });
            }
          }
        );
      }
    );
  } else {
    res
      .status(400)
      .json({ error: "Access only available through custom domain" });
  }
});

// White-labeled dashboard for reports
router.get("/dashboard", detectCustomDomain, (req, res) => {
  if (!req.isCustomDomain) {
    return res
      .status(400)
      .json({ error: "Access only available through custom domain" });
  }

  const db = getDatabase();

  // Find agency by custom domain
  db.get(
    "SELECT * FROM agencies WHERE custom_domain = ?",
    [req.customDomain],
    (err, agency) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }

      // Get recent reports for this agency
      db.all(
        "SELECT * FROM reports WHERE agency_id = ? ORDER BY generated_at DESC LIMIT 10",
        [agency.id],
        (err, reports) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }

          // Get sites for overview
          db.all(
            "SELECT id, name, url, current_status FROM sites WHERE agency_id = ? AND is_active = 1",
            [agency.id],
            (err, sites) => {
              if (err) {
                return res.status(500).json({ error: "Database error" });
              }

              res.json({
                agency: {
                  name: agency.name,
                  logo_url: agency.logo_url,
                  brand_color: agency.brand_color,
                  custom_domain: agency.custom_domain,
                },
                reports: reports.map((report) => ({
                  id: report.id,
                  report_type: report.report_type,
                  period_start: report.period_start,
                  period_end: report.period_end,
                  generated_at: report.generated_at,
                  download_url: `/api/reports/public/${report.id}`,
                })),
                sites: sites,
                stats: {
                  total_sites: sites.length,
                  sites_up: sites.filter((s) => s.current_status === "up")
                    .length,
                  total_reports: reports.length,
                },
              });
            }
          );
        }
      );
    }
  );
});

// Generate white-labeled report with custom branding
const generateWhiteLabeledReport = async (
  agency,
  sites,
  period_start,
  period_end
) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const fileName = `white_label_report_${agency.id}_${Date.now()}.pdf`;
      const filePath = path.join(__dirname, "..", "reports", fileName);

      // Ensure reports directory exists
      const reportsDir = path.dirname(filePath);
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Use agency branding
      const brandColor = agency.brand_color || "#3B82F6";
      const logoUrl = agency.logo_url;

      // Header with agency branding
      doc.fillColor(brandColor).fontSize(24).text(agency.name, 50, 50);

      doc
        .fillColor("#000000")
        .fontSize(18)
        .text("Uptime Monitoring Report", 50, 80);

      doc
        .fontSize(12)
        .text(
          `Period: ${new Date(period_start).toLocaleDateString()} - ${new Date(
            period_end
          ).toLocaleDateString()}`,
          50,
          110
        )
        .text(`Generated: ${new Date().toLocaleDateString()}`, 50, 130);

      // Sites overview
      let yPosition = 170;
      doc
        .fontSize(16)
        .fillColor(brandColor)
        .text("Monitored Sites Overview", 50, yPosition);

      yPosition += 30;

      sites.forEach((site, index) => {
        if (yPosition > 700) {
          doc.addPage();
          yPosition = 50;
        }

        doc
          .fillColor("#000000")
          .fontSize(12)
          .text(`${index + 1}. ${site.name}`, 70, yPosition)
          .text(`URL: ${site.url}`, 90, yPosition + 15)
          .text(
            `Status: ${site.current_status || "Unknown"}`,
            90,
            yPosition + 30
          );

        yPosition += 60;
      });

      // Footer with custom domain
      if (agency.custom_domain) {
        doc
          .fontSize(10)
          .fillColor("#666666")
          .text(
            `This report is available at: reports.${agency.custom_domain}`,
            50,
            doc.page.height - 50
          );
      }

      doc.end();

      stream.on("finish", () => {
        resolve(`reports/${fileName}`);
      });

      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
};

// Generate white-labeled report endpoint
router.post("/generate-white-label", authenticateToken, async (req, res) => {
  const { period_start, period_end, report_type = "monthly" } = req.body;
  const db = getDatabase();

  // Check subscription status for white label features
  const subscription = await new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM subscriptions WHERE agency_id = ? AND status = 'active' AND plan_type = 'basic'",
      [req.agency.agencyId],
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });

  if (!subscription) {
    return res.status(403).json({
      error: "White label reports require Pro subscription",
      upgrade_required: true,
    });
  }

  try {
    // Get agency details
    const agency = await new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM agencies WHERE id = ?",
        [req.agency.agencyId],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    if (!agency) {
      return res.status(404).json({ error: "Agency not found" });
    }

    // Get sites for this agency
    const sites = await new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM sites WHERE agency_id = ? AND is_active = 1",
        [agency.id],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
    });

    // Generate the white-labeled report
    const filePath = await generateWhiteLabeledReport(
      agency,
      sites,
      period_start,
      period_end
    );

    // Save report record to database
    db.run(
      "INSERT INTO reports (agency_id, report_type, period_start, period_end, file_path) VALUES (?, ?, ?, ?, ?)",
      [agency.id, report_type, period_start, period_end, filePath],
      function (err) {
        if (err) {
          return res.status(500).json({ error: "Failed to save report" });
        }

        res.json({
          message: "White-labeled report generated successfully",
          report_id: this.lastID,
          file_path: filePath,
          public_url: agency.custom_domain
            ? `https://reports.${agency.custom_domain}/api/reports/public/${this.lastID}`
            : null,
        });
      }
    );
  } catch (error) {
    console.error("Error generating white-labeled report:", error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

module.exports = router;
