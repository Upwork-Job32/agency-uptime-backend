const axios = require("axios");
const { getDatabase } = require("../config/database");

class MonitoringService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 30000; // 30 seconds for checking which sites need monitoring
    this.siteTimers = new Map(); // Track individual site timers
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("Monitoring service started");

    // Start the main monitoring loop
    this.monitoringLoop();
  }

  stop() {
    this.isRunning = false;

    // Clear all site timers
    this.siteTimers.forEach((timer) => clearInterval(timer));
    this.siteTimers.clear();

    console.log("Monitoring service stopped");
  }

  async monitoringLoop() {
    while (this.isRunning) {
      try {
        await this.setupSiteMonitoring();
        await this.sleep(this.checkInterval);
      } catch (error) {
        console.error("Monitoring loop error:", error);
        await this.sleep(5000); // Wait 5 seconds before retrying
      }
    }
  }

  async setupSiteMonitoring() {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM sites WHERE is_active = 1",
        [],
        async (err, sites) => {
          if (err) {
            reject(err);
            return;
          }

          // Set up individual monitoring for each site
          sites.forEach((site) => {
            const siteKey = `site_${site.id}`;

            // If this site isn't already being monitored with current interval
            if (!this.siteTimers.has(siteKey)) {
              const intervalMs = (site.check_interval || 300) * 1000; // Convert to milliseconds

              const timer = setInterval(() => {
                this.checkSite(site);
              }, intervalMs);

              this.siteTimers.set(siteKey, timer);

              // Also check immediately
              this.checkSite(site);
            }
          });

          // Remove timers for sites that no longer exist or are inactive
          const activeSiteIds = sites.map((site) => `site_${site.id}`);
          this.siteTimers.forEach((timer, key) => {
            if (!activeSiteIds.includes(key)) {
              clearInterval(timer);
              this.siteTimers.delete(key);
            }
          });

          resolve();
        }
      );
    });
  }

  async checkSite(site) {
    const startTime = Date.now();
    let status = "down";
    let statusCode = null;
    let errorMessage = null;

    try {
      console.log(`Checking site: ${site.name} (${site.url})`);

      const response = await axios.get(site.url, {
        timeout: 30000,
        validateStatus: (status) => true, // Don't throw on any status code
        headers: {
          "User-Agent": "Agency Uptime Monitor/1.0",
        },
      });

      statusCode = response.status;

      // Consider site up if status is 2xx or 3xx
      // Consider site down if status is 4xx or 5xx
      if (response.status >= 200 && response.status < 400) {
        status = "up";
      } else if (response.status === 404) {
        status = "down";
        errorMessage = "Site not found (404) - possibly deleted";
      } else if (response.status >= 400 && response.status < 500) {
        status = "down";
        errorMessage = `Client error: ${response.status} ${response.statusText}`;
      } else if (response.status >= 500) {
        status = "down";
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }
    } catch (error) {
      console.log(`Error checking site ${site.name}:`, error.message);
      errorMessage = error.message;

      if (error.response) {
        statusCode = error.response.status;
        if (error.response.status === 404) {
          errorMessage = "Site not found (404) - possibly deleted from Vercel";
        } else if (
          error.response.status >= 400 &&
          error.response.status < 500
        ) {
          status = "down";
          errorMessage = `Client error: ${error.response.status}`;
        } else if (error.response.status >= 500) {
          status = "down";
          errorMessage = `Server error: ${error.response.status}`;
        }
      } else if (error.code === "ENOTFOUND") {
        errorMessage = "Domain not found - site may have been deleted";
      } else if (error.code === "ECONNREFUSED") {
        errorMessage = "Connection refused - server is not responding";
      } else if (error.code === "ETIMEDOUT") {
        errorMessage = "Request timed out - server is too slow or down";
      }
    }

    const responseTime = Date.now() - startTime;

    // Log the result
    const db = getDatabase();
    db.run(
      "INSERT INTO monitoring_logs (site_id, status, response_time, status_code, error_message, worker_node) VALUES (?, ?, ?, ?, ?, ?)",
      [site.id, status, responseTime, statusCode, errorMessage, "local-node"],
      (err) => {
        if (err) {
          console.error("Failed to log monitoring result:", err);
        } else {
          console.log(
            `${site.name}: ${status} (${responseTime}ms) - ${
              statusCode || "No response"
            }`
          );
        }
      }
    );

    // Check for status changes and handle incidents
    await this.handleStatusChange(site, status, errorMessage);
  }

  async handleStatusChange(site, currentStatus, errorMessage) {
    const db = getDatabase();

    return new Promise((resolve) => {
      // Get the previous status
      db.get(
        "SELECT status FROM monitoring_logs WHERE site_id = ? ORDER BY checked_at DESC LIMIT 1 OFFSET 1",
        [site.id],
        async (err, previousLog) => {
          if (err) {
            console.error("Error checking previous status:", err);
            resolve();
            return;
          }

          const previousStatus = previousLog ? previousLog.status : "up";

          if (currentStatus === "down" && previousStatus === "up") {
            // Site went down - create incident
            console.log(
              `🚨 SITE DOWN: ${site.name} - ${errorMessage || "Unknown error"}`
            );

            db.run(
              "INSERT INTO incidents (site_id, status, started_at, description) VALUES (?, ?, ?, ?)",
              [
                site.id,
                "down",
                new Date().toISOString(),
                errorMessage || "Site is down",
              ],
              function (err) {
                if (err) {
                  console.error("Failed to create incident:", err);
                } else {
                  // Trigger alerts
                  const incidentId = this.lastID;
                  setTimeout(() => {
                    triggerAlerts(site, incidentId, "down");
                  }, 100);
                }
                resolve();
              }
            );
          } else if (currentStatus === "up" && previousStatus === "down") {
            // Site came back up - resolve incident
            console.log(`✅ SITE RESTORED: ${site.name}`);

            const resolvedAt = new Date().toISOString();
            db.run(
              'UPDATE incidents SET status = ?, resolved_at = ? WHERE site_id = ? AND status = "down"',
              ["resolved", resolvedAt, site.id],
              function (err) {
                if (err) {
                  console.error("Failed to resolve incident:", err);
                } else {
                  // Trigger recovery alerts
                  setTimeout(() => {
                    triggerAlerts(site, null, "up");
                  }, 100);
                }
                resolve();
              }
            );
          } else {
            resolve();
          }
        }
      );
    });
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function triggerAlerts(site, incidentId, status) {
  try {
    const alertService = require("./alerts");
    await alertService.sendAlert(
      site.agency_id,
      site,
      { id: incidentId, status },
      "all"
    );
  } catch (error) {
    console.error("Failed to send alerts:", error);
  }
}

const monitoringService = new MonitoringService();

function startMonitoringService() {
  monitoringService.start();
}

function stopMonitoringService() {
  monitoringService.stop();
}

module.exports = {
  startMonitoringService,
  stopMonitoringService,
  monitoringService,
};
