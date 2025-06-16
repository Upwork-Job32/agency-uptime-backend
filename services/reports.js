const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs").promises;
const { getDatabase } = require("../config/database");

class ReportService {
  async generatePDFReport(agencyId, month, year) {
    try {
      const db = getDatabase();

      // Get agency details
      const agency = await this.getAgency(agencyId);
      if (!agency) {
        throw new Error("Agency not found");
      }

      // Get sites and their stats for the month
      const sites = await this.getSitesWithStats(agencyId, month, year);

      // Get detailed monitoring history
      const monitoringHistory = await this.getMonitoringHistory(
        agencyId,
        month,
        year
      );
      const dailyTrends = await this.getDailyUptimeTrends(
        agencyId,
        month,
        year
      );
      const incidents = await this.getIncidentsHistory(agencyId, month, year);

      // Generate HTML content
      const htmlContent = this.generateReportHTML(
        agency,
        sites,
        month,
        year,
        monitoringHistory,
        dailyTrends,
        incidents
      );

      // Create PDF using Puppeteer
      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      // Ensure reports directory exists
      const reportsDir = path.join(__dirname, "../reports");
      await fs.mkdir(reportsDir, { recursive: true });

      // Generate filename
      const filename = `${agency.name.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}_${year}_${month.toString().padStart(2, "0")}.pdf`;
      const filePath = path.join(reportsDir, filename);

      // Generate PDF
      await page.pdf({
        path: filePath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "20px",
          right: "20px",
          bottom: "20px",
          left: "20px",
        },
      });

      await browser.close();

      console.log(`PDF report generated: ${filePath}`);
      return `reports/${filename}`;
    } catch (error) {
      console.error("PDF generation error:", error);
      throw error;
    }
  }

  async getAgency(agencyId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM agencies WHERE id = ?",
        [agencyId],
        (err, agency) => {
          if (err) reject(err);
          else resolve(agency);
        }
      );
    });
  }

  async getSitesWithStats(agencyId, month, year) {
    const db = getDatabase();

    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
    const endDate = `${year}-${month.toString().padStart(2, "0")}-31`;

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
         s.*,
         COUNT(ml.id) as total_checks,
         COUNT(CASE WHEN ml.status = 'up' THEN 1 END) as up_checks,
         AVG(ml.response_time) as avg_response_time,
         COUNT(DISTINCT i.id) as incident_count
         FROM sites s
         LEFT JOIN monitoring_logs ml ON s.id = ml.site_id 
           AND DATE(ml.checked_at) BETWEEN ? AND ?
         LEFT JOIN incidents i ON s.id = i.site_id 
           AND DATE(i.started_at) BETWEEN ? AND ?
         WHERE s.agency_id = ?
         GROUP BY s.id`,
        [startDate, endDate, startDate, endDate, agencyId],
        (err, sites) => {
          if (err) reject(err);
          else {
            // Calculate uptime percentage
            const sitesWithStats = sites.map((site) => ({
              ...site,
              uptime_percentage:
                site.total_checks > 0
                  ? ((site.up_checks / site.total_checks) * 100).toFixed(2)
                  : 0,
              avg_response_time: site.avg_response_time
                ? Math.round(site.avg_response_time)
                : 0,
            }));
            resolve(sitesWithStats);
          }
        }
      );
    });
  }

  async getMonitoringHistory(agencyId, month, year) {
    const db = getDatabase();

    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
    const endDate = `${year}-${month.toString().padStart(2, "0")}-31`;

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
         s.name as site_name,
         ml.status,
         ml.response_time,
         ml.checked_at,
         ml.error_message,
         ml.status_code
         FROM monitoring_logs ml
         JOIN sites s ON ml.site_id = s.id
         WHERE s.agency_id = ? 
         AND DATE(ml.checked_at) BETWEEN ? AND ?
         ORDER BY ml.checked_at DESC
         LIMIT 1000`,
        [agencyId, startDate, endDate],
        (err, logs) => {
          if (err) reject(err);
          else resolve(logs || []);
        }
      );
    });
  }

  async getDailyUptimeTrends(agencyId, month, year) {
    const db = getDatabase();

    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
    const endDate = `${year}-${month.toString().padStart(2, "0")}-31`;

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
         DATE(ml.checked_at) as date,
         COUNT(*) as total_checks,
         COUNT(CASE WHEN ml.status = 'up' THEN 1 END) as up_checks,
         AVG(ml.response_time) as avg_response_time
         FROM monitoring_logs ml
         JOIN sites s ON ml.site_id = s.id
         WHERE s.agency_id = ? 
         AND DATE(ml.checked_at) BETWEEN ? AND ?
         GROUP BY DATE(ml.checked_at)
         ORDER BY date`,
        [agencyId, startDate, endDate],
        (err, trends) => {
          if (err) reject(err);
          else {
            const trendsWithUptime = trends.map((trend) => ({
              ...trend,
              uptime_percentage:
                trend.total_checks > 0
                  ? ((trend.up_checks / trend.total_checks) * 100).toFixed(2)
                  : 0,
              avg_response_time: trend.avg_response_time
                ? Math.round(trend.avg_response_time)
                : 0,
            }));
            resolve(trendsWithUptime || []);
          }
        }
      );
    });
  }

  async getIncidentsHistory(agencyId, month, year) {
    const db = getDatabase();

    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
    const endDate = `${year}-${month.toString().padStart(2, "0")}-31`;

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT 
         s.name as site_name,
         i.status,
         i.started_at,
         i.resolved_at,
         i.description,
         CASE 
           WHEN i.resolved_at IS NOT NULL 
           THEN ROUND((julianday(i.resolved_at) - julianday(i.started_at)) * 24 * 60, 2)
           ELSE NULL 
         END as duration_minutes
         FROM incidents i
         JOIN sites s ON i.site_id = s.id
         WHERE s.agency_id = ? 
         AND DATE(i.started_at) BETWEEN ? AND ?
         ORDER BY i.started_at DESC`,
        [agencyId, startDate, endDate],
        (err, incidents) => {
          if (err) reject(err);
          else resolve(incidents || []);
        }
      );
    });
  }

  generateReportHTML(
    agency,
    sites,
    month,
    year,
    monitoringHistory,
    dailyTrends,
    incidents
  ) {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const monthName = monthNames[month - 1];
    const brandColor = agency.brand_color || "#3B82F6";

    // Calculate overall stats
    const totalSites = sites.length;
    const totalChecks = sites.reduce(
      (sum, site) => sum + (site.total_checks || 0),
      0
    );
    const totalUpChecks = sites.reduce(
      (sum, site) => sum + (site.up_checks || 0),
      0
    );
    const overallUptime =
      totalChecks > 0 ? ((totalUpChecks / totalChecks) * 100).toFixed(2) : 0;
    const totalIncidents = sites.reduce(
      (sum, site) => sum + (site.incident_count || 0),
      0
    );

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Uptime Report - ${monthName} ${year}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
          }
          
          .header {
            background: ${brandColor};
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 300;
          }
          
          .header .period {
            font-size: 18px;
            opacity: 0.9;
            margin-top: 10px;
          }
          
          .content {
            padding: 30px;
          }
          
          .summary {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 40px;
          }
          
          .summary-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border-left: 4px solid ${brandColor};
          }
          
          .summary-card h3 {
            margin: 0 0 10px 0;
            font-size: 24px;
            color: ${brandColor};
          }
          
          .summary-card p {
            margin: 0;
            color: #666;
            font-size: 14px;
          }
          
          .sites-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          
          .sites-table th,
          .sites-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          
          .sites-table th {
            background: ${brandColor};
            color: white;
            font-weight: 500;
          }
          
          .sites-table tr:hover {
            background: #f5f5f5;
          }
          
          .uptime-good { color: #10b981; font-weight: bold; }
          .uptime-warning { color: #f59e0b; font-weight: bold; }
          .uptime-bad { color: #ef4444; font-weight: bold; }
          
          .section {
            margin: 40px 0;
            page-break-inside: avoid;
          }
          
          .section h2 {
            color: ${brandColor};
            border-bottom: 2px solid ${brandColor};
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          
          .history-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 12px;
          }
          
          .history-table th,
          .history-table td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          
          .history-table th {
            background: #f8f9fa;
            color: #333;
            font-weight: 600;
          }
          
          .status-up { 
            background: #dcfce7; 
            color: #166534; 
            padding: 2px 8px; 
            border-radius: 12px; 
            font-size: 11px;
            font-weight: 500;
          }
          
          .status-down { 
            background: #fecaca; 
            color: #991b1b; 
            padding: 2px 8px; 
            border-radius: 12px; 
            font-size: 11px;
            font-weight: 500;
          }
          
          .trends-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          
          .trends-table th,
          .trends-table td {
            padding: 10px 12px;
            text-align: center;
            border-bottom: 1px solid #ddd;
          }
          
          .trends-table th {
            background: ${brandColor};
            color: white;
            font-weight: 500;
          }
          
          .footer {
            margin-top: 40px;
            padding: 20px;
            background: #f8f9fa;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
          
          @media print {
            .header { break-inside: avoid; }
            .summary { break-inside: avoid; }
            .sites-table { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${
            agency.logo_url
              ? `<img src="${agency.logo_url}" alt="${agency.name}" style="max-height: 60px; margin-bottom: 20px;">`
              : ""
          }
          <h1>${agency.name} - Uptime Report</h1>
          <div class="period">${monthName} ${year}</div>
        </div>
        
        <div class="content">
          <div class="summary">
            <div class="summary-card">
              <h3>${totalSites}</h3>
              <p>Total Sites Monitored</p>
            </div>
            <div class="summary-card">
              <h3>${overallUptime}%</h3>
              <p>Overall Uptime</p>
            </div>
            <div class="summary-card">
              <h3>${totalIncidents}</h3>
              <p>Total Incidents</p>
            </div>
            <div class="summary-card">
              <h3>${totalChecks.toLocaleString()}</h3>
              <p>Total Checks Performed</p>
            </div>
                    </div>
          
          <div class="section">
            <h2>Site Details</h2>
            <table class="sites-table">
              <thead>
                <tr>
                  <th>Site Name</th>
                  <th>URL</th>
                  <th>Uptime %</th>
                  <th>Avg Response Time</th>
                  <th>Incidents</th>
                  <th>Total Checks</th>
                </tr>
              </thead>
              <tbody>
                ${sites
                  .map((site) => {
                    const uptimeClass =
                      site.uptime_percentage >= 99
                        ? "uptime-good"
                        : site.uptime_percentage >= 95
                        ? "uptime-warning"
                        : "uptime-bad";

                    return `
                    <tr>
                      <td>${site.name}</td>
                      <td>${site.url}</td>
                      <td class="${uptimeClass}">${site.uptime_percentage}%</td>
                      <td>${site.avg_response_time}ms</td>
                      <td>${site.incident_count || 0}</td>
                      <td>${site.total_checks || 0}</td>
                    </tr>
                   `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>

          ${
            dailyTrends.length > 0
              ? `
          <div class="section">
            <h2>Daily Uptime Trends</h2>
            <table class="trends-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Uptime %</th>
                  <th>Total Checks</th>
                  <th>Avg Response Time</th>
                </tr>
              </thead>
              <tbody>
                ${dailyTrends
                  .map((trend) => {
                    const date = new Date(trend.date).toLocaleDateString();
                    const uptimeClass =
                      trend.uptime_percentage >= 99
                        ? "uptime-good"
                        : trend.uptime_percentage >= 95
                        ? "uptime-warning"
                        : "uptime-bad";

                    return `
                    <tr>
                      <td>${date}</td>
                      <td class="${uptimeClass}">${trend.uptime_percentage}%</td>
                      <td>${trend.total_checks}</td>
                      <td>${trend.avg_response_time}ms</td>
                    </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
          `
              : ""
          }

          ${
            incidents.length > 0
              ? `
          <div class="section">
            <h2>Incidents History</h2>
            <table class="history-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Started</th>
                  <th>Resolved</th>
                  <th>Duration</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${incidents
                  .map((incident) => {
                    const startedAt = new Date(
                      incident.started_at
                    ).toLocaleString();
                    const resolvedAt = incident.resolved_at
                      ? new Date(incident.resolved_at).toLocaleString()
                      : "Ongoing";
                    const duration = incident.duration_minutes
                      ? `${Math.floor(
                          incident.duration_minutes / 60
                        )}h ${Math.round(incident.duration_minutes % 60)}m`
                      : "Ongoing";

                    return `
                    <tr>
                      <td>${incident.site_name}</td>
                      <td>${startedAt}</td>
                      <td>${resolvedAt}</td>
                      <td>${duration}</td>
                      <td>${incident.description || "Site down"}</td>
                    </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
          `
              : ""
          }

          ${
            monitoringHistory.length > 0
              ? `
          <div class="section">
            <h2>Recent Monitoring Activity (Last 100 Checks)</h2>
            <table class="history-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Response Time</th>
                  <th>Status Code</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${monitoringHistory
                  .slice(0, 100)
                  .map((log) => {
                    const checkedAt = new Date(log.checked_at).toLocaleString();
                    const statusClass =
                      log.status === "up" ? "status-up" : "status-down";

                    return `
                    <tr>
                      <td>${log.site_name}</td>
                      <td><span class="${statusClass}">${log.status.toUpperCase()}</span></td>
                      <td>${checkedAt}</td>
                      <td>${
                        log.response_time ? log.response_time + "ms" : "N/A"
                      }</td>
                      <td>${log.status_code || "N/A"}</td>
                      <td>${log.error_message || "-"}</td>
                    </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
          `
              : ""
          }

        </div>
        
        <div class="footer">
          <p>Generated on ${new Date().toLocaleDateString()} by Agency Uptime</p>
          <p>This report covers the period from ${monthName} 1, ${year} to ${monthName} 31, ${year}</p>
        </div>
      </body>
      </html>
    `;
  }
}

const reportService = new ReportService();

module.exports = {
  generatePDFReport: (agencyId, month, year) =>
    reportService.generatePDFReport(agencyId, month, year),
  ReportService,
};
