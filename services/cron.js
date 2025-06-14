const cron = require("cron")
const { generatePDFReport } = require("./reports")
const { getDatabase } = require("../config/database")

class CronService {
  constructor() {
    this.jobs = []
  }

  start() {
    // Monthly report generation (1st day of each month at 9 AM)
    const monthlyReportJob = new cron.CronJob("0 9 1 * *", async () => {
      console.log("Starting monthly report generation...")
      await this.generateMonthlyReports()
    })

    // Cleanup old logs (daily at 2 AM)
    const cleanupJob = new cron.CronJob("0 2 * * *", async () => {
      console.log("Starting log cleanup...")
      await this.cleanupOldLogs()
    })

    // Update incident durations (every 5 minutes)
    const incidentUpdateJob = new cron.CronJob("*/5 * * * *", async () => {
      await this.updateIncidentDurations()
    })

    this.jobs.push(monthlyReportJob, cleanupJob, incidentUpdateJob)

    // Start all jobs
    this.jobs.forEach((job) => job.start())

    console.log("Cron jobs started")
  }

  stop() {
    this.jobs.forEach((job) => job.stop())
    console.log("Cron jobs stopped")
  }

  async generateMonthlyReports() {
    try {
      const db = getDatabase()

      // Get all agencies with PDF reports addon
      db.all(
        `SELECT DISTINCT a.* 
         FROM agencies a 
         JOIN addons ad ON a.id = ad.agency_id 
         WHERE ad.addon_type = 'pdf_reports' AND ad.is_active = 1`,
        [],
        async (err, agencies) => {
          if (err) {
            console.error("Error fetching agencies for reports:", err)
            return
          }

          const now = new Date()
          const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
          const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

          for (const agency of agencies) {
            try {
              console.log(`Generating monthly report for agency: ${agency.name}`)
              const reportPath = await generatePDFReport(agency.id, lastMonth, year)

              // Save report record
              db.run(
                "INSERT INTO reports (agency_id, report_type, period_start, period_end, file_path) VALUES (?, ?, ?, ?, ?)",
                [
                  agency.id,
                  "monthly_pdf",
                  `${year}-${lastMonth.toString().padStart(2, "0")}-01`,
                  `${year}-${lastMonth.toString().padStart(2, "0")}-31`,
                  reportPath,
                ],
              )

              // TODO: Send email with report attachment
              console.log(`Monthly report generated for ${agency.name}: ${reportPath}`)
            } catch (error) {
              console.error(`Failed to generate report for agency ${agency.name}:`, error)
            }
          }
        },
      )
    } catch (error) {
      console.error("Monthly report generation error:", error)
    }
  }

  async cleanupOldLogs() {
    try {
      const db = getDatabase()

      // Delete monitoring logs older than 90 days
      db.run('DELETE FROM monitoring_logs WHERE checked_at < datetime("now", "-90 days")', [], function (err) {
        if (err) {
          console.error("Error cleaning up monitoring logs:", err)
        } else {
          console.log(`Cleaned up ${this.changes} old monitoring log entries`)
        }
      })

      // Delete old alerts (older than 1 year)
      db.run('DELETE FROM alerts WHERE sent_at < datetime("now", "-1 year")', [], function (err) {
        if (err) {
          console.error("Error cleaning up alerts:", err)
        } else {
          console.log(`Cleaned up ${this.changes} old alert entries`)
        }
      })
    } catch (error) {
      console.error("Log cleanup error:", error)
    }
  }

  async updateIncidentDurations() {
    try {
      const db = getDatabase()

      // Update durations for resolved incidents
      db.run(
        `UPDATE incidents 
         SET duration = (
           CAST((julianday(resolved_at) - julianday(started_at)) * 24 * 60 AS INTEGER)
         )
         WHERE status = 'resolved' AND duration IS NULL`,
        [],
        (err) => {
          if (err) {
            console.error("Error updating incident durations:", err)
          }
        },
      )
    } catch (error) {
      console.error("Incident duration update error:", error)
    }
  }
}

const cronService = new CronService()

function startCronJobs() {
  cronService.start()
}

function stopCronJobs() {
  cronService.stop()
}

module.exports = {
  startCronJobs,
  stopCronJobs,
  cronService,
}
