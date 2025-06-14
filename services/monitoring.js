const axios = require("axios")
const { getDatabase } = require("../config/database")

class MonitoringService {
  constructor() {
    this.isRunning = false
    this.checkInterval = 30000 // 30 seconds
  }

  start() {
    if (this.isRunning) return

    this.isRunning = true
    console.log("Monitoring service started")

    // Start the monitoring loop
    this.monitoringLoop()
  }

  stop() {
    this.isRunning = false
    console.log("Monitoring service stopped")
  }

  async monitoringLoop() {
    while (this.isRunning) {
      try {
        await this.checkAllSites()
        await this.sleep(this.checkInterval)
      } catch (error) {
        console.error("Monitoring loop error:", error)
        await this.sleep(5000) // Wait 5 seconds before retrying
      }
    }
  }

  async checkAllSites() {
    const db = getDatabase()

    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM sites WHERE is_active = 1", [], async (err, sites) => {
        if (err) {
          reject(err)
          return
        }

        // Process sites in batches to avoid overwhelming the system
        const batchSize = 10
        for (let i = 0; i < sites.length; i += batchSize) {
          const batch = sites.slice(i, i + batchSize)
          await Promise.all(batch.map((site) => this.checkSite(site)))
        }

        resolve()
      })
    })
  }

  async checkSite(site) {
    const startTime = Date.now()
    let status = "down"
    let statusCode = null
    let errorMessage = null

    try {
      const response = await axios.get(site.url, {
        timeout: 30000,
        validateStatus: (status) => status < 500, // Consider 4xx as up, 5xx as down
      })

      statusCode = response.status
      status = response.status < 500 ? "up" : "down"
    } catch (error) {
      errorMessage = error.message
      if (error.response) {
        statusCode = error.response.status
        status = error.response.status < 500 ? "up" : "down"
      }
    }

    const responseTime = Date.now() - startTime

    // Log the result
    const db = getDatabase()
    db.run(
      "INSERT INTO monitoring_logs (site_id, status, response_time, status_code, error_message, worker_node) VALUES (?, ?, ?, ?, ?, ?)",
      [site.id, status, responseTime, statusCode, errorMessage, "local-node"],
      (err) => {
        if (err) {
          console.error("Failed to log monitoring result:", err)
        }
      },
    )

    // Check for status changes and handle incidents
    this.handleStatusChange(site, status, errorMessage)
  }

  async handleStatusChange(site, currentStatus, errorMessage) {
    const db = getDatabase()

    // Get the previous status
    db.get(
      "SELECT status FROM monitoring_logs WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1 OFFSET 1",
      [site.id],
      (err, previousLog) => {
        if (err) {
          console.error("Error checking previous status:", err)
          return
        }

        const previousStatus = previousLog ? previousLog.status : "up"

        if (currentStatus === "down" && previousStatus === "up") {
          // Site went down - create incident
          db.run(
            "INSERT INTO incidents (site_id, status, started_at, description) VALUES (?, ?, ?, ?)",
            [site.id, "down", new Date().toISOString(), errorMessage || "Site is down"],
            function (err) {
              if (err) {
                console.error("Failed to create incident:", err)
              } else {
                // Trigger alerts
                this.triggerAlerts(site, this.lastID, "down")
              }
            },
          )
        } else if (currentStatus === "up" && previousStatus === "down") {
          // Site came back up - resolve incident
          const resolvedAt = new Date().toISOString()
          db.run(
            'UPDATE incidents SET status = ?, resolved_at = ? WHERE site_id = ? AND status = "down"',
            ["resolved", resolvedAt, site.id],
            function (err) {
              if (err) {
                console.error("Failed to resolve incident:", err)
              } else {
                // Trigger recovery alerts
                this.triggerAlerts(site, null, "up")
              }
            },
          )
        }
      },
    )
  }

  async triggerAlerts(site, incidentId, status) {
    try {
      const alertService = require("./alerts")
      await alertService.sendAlert(site.agency_id, site, { id: incidentId, status }, "all")
    } catch (error) {
      console.error("Failed to send alerts:", error)
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

const monitoringService = new MonitoringService()

function startMonitoringService() {
  monitoringService.start()
}

function stopMonitoringService() {
  monitoringService.stop()
}

module.exports = {
  startMonitoringService,
  stopMonitoringService,
  monitoringService,
}
