const nodemailer = require("nodemailer")
const axios = require("axios")
const { getDatabase } = require("../config/database")

class AlertService {
  constructor() {
    // Configure email transporter
    this.emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }

  async sendAlert(agencyId, site, incident, alertType = "all") {
    const db = getDatabase()

    // Get agency details
    const agency = await this.getAgency(agencyId)
    if (!agency) {
      throw new Error("Agency not found")
    }

    const alertPromises = []

    if (alertType === "all" || alertType === "email") {
      alertPromises.push(this.sendEmailAlert(agency, site, incident))
    }

    if (alertType === "all" || alertType === "ghl") {
      alertPromises.push(this.sendGHLAlert(agency, site, incident))
    }

    if (alertType === "all" || alertType === "webhook") {
      alertPromises.push(this.sendWebhookAlert(agency, site, incident))
    }

    await Promise.allSettled(alertPromises)
  }

  async getAgency(agencyId) {
    const db = getDatabase()

    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM agencies WHERE id = ?", [agencyId], (err, agency) => {
        if (err) {
          reject(err)
        } else {
          resolve(agency)
        }
      })
    })
  }

  async sendEmailAlert(agency, site, incident) {
    try {
      const isDown = incident.status === "down"
      const subject = isDown ? `🚨 ${site.name} is DOWN` : `✅ ${site.name} is back UP`

      const message = isDown
        ? `Your monitored site "${site.name}" (${site.url}) is currently down.\n\nIncident started: ${incident.started_at || new Date().toISOString()}\nDescription: ${incident.description || "Site is not responding"}`
        : `Your monitored site "${site.name}" (${site.url}) is back online.\n\nIncident resolved: ${new Date().toISOString()}`

      const mailOptions = {
        from: process.env.FROM_EMAIL || "alerts@agencyuptime.com",
        to: agency.email,
        subject: subject,
        text: message,
        html: this.generateEmailHTML(agency, site, incident, isDown),
      }

      await this.emailTransporter.sendMail(mailOptions)

      // Log the alert
      this.logAlert(agency.id, site.id, incident.id, "email", agency.email, message)

      console.log(`Email alert sent to ${agency.email} for site ${site.name}`)
    } catch (error) {
      console.error("Failed to send email alert:", error)
      throw error
    }
  }

  async sendGHLAlert(agency, site, incident) {
    try {
      const db = getDatabase()

      // Get GHL integration settings
      const ghlIntegration = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM ghl_integrations WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, integration) => {
            if (err) reject(err)
            else resolve(integration)
          },
        )
      })

      if (!ghlIntegration) {
        console.log("No active GHL integration found for agency:", agency.id)
        return
      }

      const isDown = incident.status === "down"
      const message = isDown
        ? `🚨 ALERT: ${site.name} is DOWN. Please check immediately.`
        : `✅ RESOLVED: ${site.name} is back online.`

      // Send webhook to GHL
      if (ghlIntegration.webhook_url) {
        await axios.post(ghlIntegration.webhook_url, {
          type: "uptime_alert",
          site_name: site.name,
          site_url: site.url,
          status: incident.status,
          message: message,
          timestamp: new Date().toISOString(),
        })
      }

      // Log the alert
      this.logAlert(agency.id, site.id, incident.id, "ghl", ghlIntegration.webhook_url, message)

      console.log(`GHL alert sent for site ${site.name}`)
    } catch (error) {
      console.error("Failed to send GHL alert:", error)
      throw error
    }
  }

  async sendWebhookAlert(agency, site, incident) {
    try {
      // This would be implemented if agencies have custom webhook URLs
      // For now, we'll just log it
      console.log(`Webhook alert would be sent for site ${site.name}`)
    } catch (error) {
      console.error("Failed to send webhook alert:", error)
      throw error
    }
  }

  generateEmailHTML(agency, site, incident, isDown) {
    const statusColor = isDown ? "#ef4444" : "#10b981"
    const statusText = isDown ? "DOWN" : "UP"
    const brandColor = agency.brand_color || "#3B82F6"

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Site Alert</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${brandColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          ${agency.logo_url ? `<img src="${agency.logo_url}" alt="${agency.name}" style="max-height: 50px; margin-bottom: 10px;">` : ""}
          <h1 style="margin: 0;">${agency.name}</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e9ecef;">
          <div style="background: ${statusColor}; color: white; padding: 15px; border-radius: 6px; text-align: center; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 24px;">Site is ${statusText}</h2>
          </div>
          
          <h3 style="color: #495057; margin-bottom: 15px;">${site.name}</h3>
          <p style="margin-bottom: 10px;"><strong>URL:</strong> <a href="${site.url}" style="color: ${brandColor};">${site.url}</a></p>
          <p style="margin-bottom: 10px;"><strong>Status:</strong> ${statusText}</p>
          <p style="margin-bottom: 10px;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          
          ${incident.description ? `<p style="margin-bottom: 20px;"><strong>Details:</strong> ${incident.description}</p>` : ""}
          
          <div style="background: white; padding: 20px; border-radius: 6px; border: 1px solid #dee2e6;">
            <p style="margin: 0; color: #6c757d; font-size: 14px;">
              This alert was sent by Agency Uptime monitoring service. 
              ${agency.custom_domain ? `Visit your dashboard at ${agency.custom_domain}` : "Visit your dashboard to manage alerts."}
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  }

  logAlert(agencyId, siteId, incidentId, type, recipient, message) {
    const db = getDatabase()

    db.run(
      "INSERT INTO alerts (agency_id, site_id, incident_id, type, recipient, message) VALUES (?, ?, ?, ?, ?, ?)",
      [agencyId, siteId, incidentId, type, recipient, message],
      (err) => {
        if (err) {
          console.error("Failed to log alert:", err)
        }
      },
    )
  }
}

const alertService = new AlertService()

module.exports = {
  sendAlert: (agencyId, site, incident, alertType) => alertService.sendAlert(agencyId, site, incident, alertType),
  AlertService,
}
