const nodemailer = require("nodemailer");
const axios = require("axios");
const { getDatabase } = require("../config/database");
const ThirdPartyIntegrationsService = require("./third-party-integrations");

class AlertService {
  constructor() {
    // Configure email transporter
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendAlert(agencyId, site, incident, alertType = "all") {
    const db = getDatabase();

    // Get agency details and alert settings
    const [agency, alertSettings] = await Promise.all([
      this.getAgency(agencyId),
      this.getAlertSettings(agencyId),
    ]);

    if (!agency) {
      throw new Error("Agency not found");
    }

    const alertPromises = [];

    // Check if alert type is enabled and send accordingly
    if (alertType === "all") {
      if (alertSettings.email_alerts) {
        alertPromises.push(this.sendEmailAlert(agency, site, incident));
      }
      if (alertSettings.slack_alerts) {
        alertPromises.push(this.sendSlackAlert(agency, site, incident));
      }
      if (alertSettings.discord_alerts) {
        alertPromises.push(this.sendDiscordAlert(agency, site, incident));
      }
      if (alertSettings.telegram_alerts) {
        alertPromises.push(this.sendTelegramAlert(agency, site, incident));
      }
      if (alertSettings.teams_alerts) {
        alertPromises.push(this.sendTeamsAlert(agency, site, incident));
      }
      if (alertSettings.webhook_alerts) {
        alertPromises.push(this.sendWebhookAlert(agency, site, incident));
      }
      if (alertSettings.ghl_alerts) {
        alertPromises.push(this.sendGHLAlert(agency, site, incident));
      }
    } else {
      // Send specific alert type
      switch (alertType) {
        case "email":
          alertPromises.push(this.sendEmailAlert(agency, site, incident));
          break;
        case "slack":
          alertPromises.push(this.sendSlackAlert(agency, site, incident));
          break;
        case "discord":
          alertPromises.push(this.sendDiscordAlert(agency, site, incident));
          break;
        case "telegram":
          alertPromises.push(this.sendTelegramAlert(agency, site, incident));
          break;
        case "teams":
          alertPromises.push(this.sendTeamsAlert(agency, site, incident));
          break;
        case "webhook":
          alertPromises.push(this.sendWebhookAlert(agency, site, incident));
          break;
        case "ghl":
          alertPromises.push(this.sendGHLAlert(agency, site, incident));
          break;
      }
    }

    await Promise.allSettled(alertPromises);
  }

  async sendAllSitesAlert(agencyId, sites, alertType = "all") {
    const db = getDatabase();

    // Get agency details and alert settings
    const [agency, alertSettings] = await Promise.all([
      this.getAgency(agencyId),
      this.getAlertSettings(agencyId),
    ]);

    if (!agency) {
      throw new Error("Agency not found");
    }

    const alertPromises = [];

    // Check if alert type is enabled and send accordingly
    if (alertType === "all") {
      if (alertSettings.slack_alerts) {
        alertPromises.push(this.sendAllSitesSlackAlert(agency, sites));
      }
      if (alertSettings.email_alerts) {
        alertPromises.push(this.sendAllSitesEmailAlert(agency, sites));
      }
      if (alertSettings.webhook_alerts) {
        alertPromises.push(this.sendAllSitesWebhookAlert(agency, sites));
      }
      if (alertSettings.ghl_alerts) {
        alertPromises.push(this.sendAllSitesGHLAlert(agency, sites));
      }
    } else {
      // Send specific alert type
      switch (alertType) {
        case "slack":
          alertPromises.push(this.sendAllSitesSlackAlert(agency, sites));
          break;
        case "email":
          alertPromises.push(this.sendAllSitesEmailAlert(agency, sites));
          break;
        case "webhook":
          alertPromises.push(this.sendAllSitesWebhookAlert(agency, sites));
          break;
        case "ghl":
          alertPromises.push(this.sendAllSitesGHLAlert(agency, sites));
          break;
      }
    }

    await Promise.allSettled(alertPromises);
  }

  async getAgency(agencyId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM agencies WHERE id = ?",
        [agencyId],
        (err, agency) => {
          if (err) {
            reject(err);
          } else {
            resolve(agency);
          }
        }
      );
    });
  }

  async getAlertSettings(agencyId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM alert_settings WHERE agency_id = ?",
        [agencyId],
        (err, settings) => {
          if (err) {
            reject(err);
          } else {
            // Return default settings if none exist
            resolve(
              settings || {
                email_alerts: true,
                slack_alerts: false,
                webhook_alerts: false,
                ghl_alerts: false,
              }
            );
          }
        }
      );
    });
  }

  async sendEmailAlert(agency, site, incident) {
    try {
      const isDown = incident.status === "down";
      const subject = isDown
        ? `🚨 ${site.name} is DOWN`
        : `✅ ${site.name} is back UP`;

      const message = isDown
        ? `Your monitored site "${site.name}" (${
            site.url
          }) is currently down.\n\nIncident started: ${
            incident.started_at || new Date().toISOString()
          }\nDescription: ${incident.description || "Site is not responding"}`
        : `Your monitored site "${site.name}" (${
            site.url
          }) is back online.\n\nIncident resolved: ${new Date().toISOString()}`;

      const mailOptions = {
        from: process.env.FROM_EMAIL || "alerts@agencyuptime.com",
        to: agency.email,
        subject: subject,
        text: message,
        html: this.generateEmailHTML(agency, site, incident, isDown),
      };

      await this.emailTransporter.sendMail(mailOptions);

      // Log the alert
      this.logAlert(
        agency.id,
        site.id,
        incident.id,
        "email",
        agency.email,
        message
      );

      console.log(`Email alert sent to ${agency.email} for site ${site.name}`);
    } catch (error) {
      console.error("Failed to send email alert:", error);
      throw error;
    }
  }

  async sendSlackAlert(agency, site, incident) {
    try {
      console.log(
        `[DEBUG] Sending Slack alert for agency ${agency.id}, site ${site.name}`
      );
      const db = getDatabase();

      // Get Slack integration settings
      const slackIntegration = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM slack_integrations WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, integration) => {
            if (err) {
              console.error(
                "[DEBUG] Database error getting Slack integration:",
                err
              );
              reject(err);
            } else {
              console.log(
                `[DEBUG] Slack integration found:`,
                integration ? "Yes" : "No"
              );
              resolve(integration);
            }
          }
        );
      });

      if (!slackIntegration) {
        console.log("No active Slack integration found for agency:", agency.id);
        return;
      }

      console.log(
        `[DEBUG] Using webhook: ${slackIntegration.webhook_url.substring(
          0,
          50
        )}...`
      );

      const isDown = incident.status === "down";
      const statusEmoji = isDown ? "🚨" : "✅";
      const statusText = isDown ? "DOWN" : "BACK UP";
      const color = isDown ? "danger" : "good";

      const slackPayload = {
        username: "Agency Uptime",
        icon_emoji: ":warning:",
        attachments: [
          {
            color: color,
            title: `${statusEmoji} ${site.name} is ${statusText}`,
            title_link: site.url,
            fields: [
              {
                title: "Site",
                value: `<${site.url}|${site.name}>`,
                short: true,
              },
              {
                title: "Status",
                value: statusText,
                short: true,
              },
              {
                title: "Time",
                value: new Date().toLocaleString(),
                short: true,
              },
              {
                title: "Agency",
                value: agency.name,
                short: true,
              },
            ],
            footer: "Agency Uptime",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      // Override channel if specified
      if (slackIntegration.channel) {
        slackPayload.channel = slackIntegration.channel;
        console.log(
          `[DEBUG] Using channel override: ${slackIntegration.channel}`
        );
      }

      // Add description if available
      if (incident.description) {
        slackPayload.attachments[0].fields.push({
          title: "Description",
          value: incident.description,
          short: false,
        });
      }

      console.log(`[DEBUG] Sending Slack message...`);
      const response = await axios.post(
        slackIntegration.webhook_url,
        slackPayload,
        {
          timeout: 10000,
        }
      );
      console.log(
        `[DEBUG] Slack response: ${response.status} - ${response.data}`
      );

      // Log the alert
      this.logAlert(
        agency.id,
        site.id,
        incident.id,
        "slack",
        slackIntegration.webhook_url,
        `Slack alert: ${site.name} is ${statusText}`
      );

      console.log(`✅ Slack alert sent successfully for site ${site.name}`);
    } catch (error) {
      console.error("❌ Failed to send Slack alert:", error.message);
      if (error.response) {
        console.error(
          "Slack API response:",
          error.response.status,
          error.response.data
        );
      }
      throw error;
    }
  }

  async sendAllSitesSlackAlert(agency, sites) {
    try {
      console.log(
        `[DEBUG] Sending all sites Slack alert for agency ${agency.id}`
      );
      const db = getDatabase();

      // Get Slack integration settings
      const slackIntegration = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM slack_integrations WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, integration) => {
            if (err) {
              console.error(
                "[DEBUG] Database error getting Slack integration:",
                err
              );
              reject(err);
            } else {
              console.log(
                `[DEBUG] Slack integration found:`,
                integration ? "Yes" : "No"
              );
              resolve(integration);
            }
          }
        );
      });

      if (!slackIntegration) {
        console.log("No active Slack integration found for agency:", agency.id);
        return;
      }

      console.log(
        `[DEBUG] Using webhook: ${slackIntegration.webhook_url.substring(
          0,
          50
        )}...`
      );

      // Get real site statuses from monitoring data
      const siteStatuses = await Promise.all(
        sites.map(async (site) => {
          return new Promise((resolve) => {
            // Get the latest monitoring log for this site
            db.get(
              `SELECT status, response_time, checked_at, error_message 
               FROM monitoring_logs 
               WHERE site_id = ? 
               ORDER BY checked_at DESC 
               LIMIT 1`,
              [site.id],
              (err, latestLog) => {
                if (err) {
                  console.error(
                    `Error getting status for site ${site.name}:`,
                    err
                  );
                  // Fallback to site's current_status
                  resolve({
                    ...site,
                    status: site.current_status || "unknown",
                    last_checked: new Date().toISOString(),
                    response_time: null,
                    error_message: "Unable to fetch monitoring data",
                  });
                } else if (latestLog) {
                  // Use real monitoring data
                  resolve({
                    ...site,
                    status: latestLog.status,
                    last_checked: latestLog.checked_at,
                    response_time: latestLog.response_time,
                    error_message: latestLog.error_message,
                  });
                } else {
                  // No monitoring data yet, use site's current status or default
                  resolve({
                    ...site,
                    status: site.current_status || "unknown",
                    last_checked: "Never checked",
                    response_time: null,
                    error_message: "No monitoring data available",
                  });
                }
              }
            );
          });
        })
      );

      console.log(
        `[DEBUG] Real site statuses:`,
        siteStatuses.map((s) => `${s.name}: ${s.status}`)
      );

      const upSites = siteStatuses.filter((site) => site.status === "up");
      const downSites = siteStatuses.filter((site) => site.status === "down");
      const unknownSites = siteStatuses.filter(
        (site) => site.status === "unknown"
      );

      // Create comprehensive Slack message
      const hasIssues = downSites.length > 0 || unknownSites.length > 0;
      const mainColor = hasIssues ? "danger" : "good";
      const mainEmoji = hasIssues ? "🚨" : "✅";
      const overallStatus = hasIssues
        ? "ISSUES DETECTED"
        : "ALL SYSTEMS OPERATIONAL";

      const slackPayload = {
        username: "Agency Uptime",
        icon_emoji: ":warning:",
        text: `${mainEmoji} ${agency.name} - Sites Status Report`,
        attachments: [
          {
            color: mainColor,
            title: `${overallStatus}`,
            fields: [
              {
                title: "📊 Overview",
                value: `Total Sites: ${sites.length}\n✅ Up: ${
                  upSites.length
                }\n❌ Down: ${downSites.length}${
                  unknownSites.length > 0
                    ? `\n❓ Unknown: ${unknownSites.length}`
                    : ""
                }`,
                short: true,
              },
              {
                title: "🕐 Report Time",
                value: new Date().toLocaleString(),
                short: true,
              },
            ],
            footer: "Agency Uptime Status Report",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      // Add detailed status for each site
      if (downSites.length > 0) {
        slackPayload.attachments.push({
          color: "danger",
          title: `🚨 Sites Currently DOWN (${downSites.length})`,
          fields: downSites.map((site) => {
            const lastChecked =
              site.last_checked === "Never checked"
                ? "Never checked"
                : new Date(site.last_checked).toLocaleString();

            const errorInfo = site.error_message
              ? `\n❌ Error: ${site.error_message}`
              : "";

            return {
              title: site.name,
              value: `🔗 ${site.url}\n⏰ Last checked: ${lastChecked}${errorInfo}`,
              short: true,
            };
          }),
          footer: "Immediate attention required",
        });
      }

      if (unknownSites.length > 0) {
        slackPayload.attachments.push({
          color: "warning",
          title: `❓ Sites with Unknown Status (${unknownSites.length})`,
          fields: unknownSites.map((site) => {
            const lastChecked =
              site.last_checked === "Never checked"
                ? "Never checked"
                : new Date(site.last_checked).toLocaleString();

            return {
              title: site.name,
              value: `🔗 ${site.url}\n⏰ Last checked: ${lastChecked}\n💭 ${
                site.error_message || "No monitoring data available"
              }`,
              short: true,
            };
          }),
          footer: "Monitoring setup may be required",
        });
      }

      if (upSites.length > 0) {
        slackPayload.attachments.push({
          color: "good",
          title: `✅ Sites Currently UP (${upSites.length})`,
          fields: upSites.map((site) => {
            const responseTime = site.response_time
              ? `${site.response_time}ms`
              : "N/A";
            const lastChecked =
              site.last_checked === "Never checked"
                ? "Never checked"
                : new Date(site.last_checked).toLocaleString();

            return {
              title: site.name,
              value: `🔗 ${site.url}\n⚡ Response: ${responseTime}\n⏰ Last checked: ${lastChecked}`,
              short: true,
            };
          }),
          footer: "All systems operational",
        });
      }

      // Override channel if specified
      if (slackIntegration.channel) {
        slackPayload.channel = slackIntegration.channel;
        console.log(
          `[DEBUG] Using channel override: ${slackIntegration.channel}`
        );
      }

      console.log(`[DEBUG] Sending comprehensive Slack status report...`);
      const response = await axios.post(
        slackIntegration.webhook_url,
        slackPayload,
        {
          timeout: 10000,
        }
      );
      console.log(
        `[DEBUG] Slack response: ${response.status} - ${response.data}`
      );

      // Log the alert
      this.logAlert(
        agency.id,
        null, // No specific site for comprehensive report
        null, // No specific incident
        "slack",
        slackIntegration.webhook_url,
        `All sites status report: ${upSites.length} up, ${
          downSites.length
        } down${
          unknownSites.length > 0 ? `, ${unknownSites.length} unknown` : ""
        }`
      );

      console.log(`✅ All sites Slack status report sent successfully`);
    } catch (error) {
      console.error("❌ Failed to send all sites Slack alert:", error.message);
      if (error.response) {
        console.error(
          "Slack API response:",
          error.response.status,
          error.response.data
        );
      }
      throw error;
    }
  }

  async sendAllSitesEmailAlert(agency, sites) {
    // TODO: Implement comprehensive email report
    console.log("Email all sites report not yet implemented");
  }

  async sendAllSitesWebhookAlert(agency, sites) {
    // TODO: Implement comprehensive webhook report
    console.log("Webhook all sites report not yet implemented");
  }

  async sendAllSitesGHLAlert(agency, sites) {
    // TODO: Implement comprehensive GHL report
    console.log("GHL all sites report not yet implemented");
  }

  async sendWebhookAlert(agency, site, incident) {
    try {
      const db = getDatabase();

      // Get webhook settings
      const webhookSettings = await new Promise((resolve, reject) => {
        db.all(
          "SELECT * FROM webhook_settings WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, settings) => {
            if (err) reject(err);
            else resolve(settings || []);
          }
        );
      });

      if (webhookSettings.length === 0) {
        console.log("No active webhook settings found for agency:", agency.id);
        return;
      }

      const isDown = incident.status === "down";
      const webhookPayload = {
        type: "uptime_alert",
        agency: {
          id: agency.id,
          name: agency.name,
          email: agency.email,
        },
        site: {
          id: site.id,
          name: site.name,
          url: site.url,
        },
        incident: {
          id: incident.id,
          status: incident.status,
          description: incident.description,
          started_at: incident.started_at,
          resolved_at: incident.resolved_at,
        },
        alert: {
          message: isDown
            ? `🚨 ${site.name} is DOWN`
            : `✅ ${site.name} is back UP`,
          timestamp: new Date().toISOString(),
          severity: isDown ? "critical" : "resolved",
        },
      };

      // Send to all configured webhooks
      const webhookPromises = webhookSettings.map(async (webhook) => {
        try {
          const headers = {
            "Content-Type": "application/json",
            "User-Agent": "Agency-Uptime-Monitor/1.0",
          };

          // Add custom headers if configured
          if (webhook.headers) {
            const customHeaders = JSON.parse(webhook.headers);
            Object.assign(headers, customHeaders);
          }

          await axios.post(webhook.webhook_url, webhookPayload, { headers });

          // Log the alert
          this.logAlert(
            agency.id,
            site.id,
            incident.id,
            "webhook",
            webhook.webhook_url,
            `Webhook alert sent to ${webhook.name || webhook.webhook_url}`
          );

          console.log(
            `Webhook alert sent to ${
              webhook.name || webhook.webhook_url
            } for site ${site.name}`
          );
        } catch (error) {
          console.error(
            `Failed to send webhook alert to ${webhook.webhook_url}:`,
            error.message
          );
        }
      });

      await Promise.allSettled(webhookPromises);
    } catch (error) {
      console.error("Failed to send webhook alerts:", error);
      throw error;
    }
  }

  async sendDiscordAlert(agency, site, incident) {
    try {
      const db = getDatabase();

      // Get Discord integration settings
      const discordIntegration = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM discord_integrations WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, integration) => {
            if (err) reject(err);
            else resolve(integration);
          }
        );
      });

      if (!discordIntegration) {
        console.log(
          "No active Discord integration found for agency:",
          agency.id
        );
        return;
      }

      const result = await ThirdPartyIntegrationsService.sendDiscordAlert(
        agency.id,
        site,
        incident,
        {
          webhook_url: discordIntegration.webhook_url,
          agency_name: agency.name,
        }
      );

      if (result.success) {
        this.logAlert(
          agency.id,
          site.id,
          incident.id,
          "discord",
          discordIntegration.webhook_url,
          `Discord alert: ${site.name} is ${incident.status}`
        );
      }
    } catch (error) {
      console.error("Failed to send Discord alert:", error);
      throw error;
    }
  }

  async sendTelegramAlert(agency, site, incident) {
    try {
      const db = getDatabase();

      // Get Telegram integration settings
      const telegramIntegration = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM telegram_integrations WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, integration) => {
            if (err) reject(err);
            else resolve(integration);
          }
        );
      });

      if (!telegramIntegration) {
        console.log(
          "No active Telegram integration found for agency:",
          agency.id
        );
        return;
      }

      const result = await ThirdPartyIntegrationsService.sendTelegramAlert(
        agency.id,
        site,
        incident,
        {
          bot_token: telegramIntegration.bot_token,
          chat_id: telegramIntegration.chat_id,
          agency_name: agency.name,
        }
      );

      if (result.success) {
        this.logAlert(
          agency.id,
          site.id,
          incident.id,
          "telegram",
          `Bot: ${telegramIntegration.bot_token.substring(0, 10)}...`,
          `Telegram alert: ${site.name} is ${incident.status}`
        );
      }
    } catch (error) {
      console.error("Failed to send Telegram alert:", error);
      throw error;
    }
  }

  async sendTeamsAlert(agency, site, incident) {
    try {
      const db = getDatabase();

      // Get Teams integration settings
      const teamsIntegration = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM teams_integrations WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, integration) => {
            if (err) reject(err);
            else resolve(integration);
          }
        );
      });

      if (!teamsIntegration) {
        console.log("No active Teams integration found for agency:", agency.id);
        return;
      }

      const result = await ThirdPartyIntegrationsService.sendTeamsAlert(
        agency.id,
        site,
        incident,
        {
          webhook_url: teamsIntegration.webhook_url,
          agency_name: agency.name,
        }
      );

      if (result.success) {
        this.logAlert(
          agency.id,
          site.id,
          incident.id,
          "teams",
          teamsIntegration.webhook_url,
          `Teams alert: ${site.name} is ${incident.status}`
        );
      }
    } catch (error) {
      console.error("Failed to send Teams alert:", error);
      throw error;
    }
  }

  async sendGHLAlert(agency, site, incident) {
    try {
      const db = getDatabase();

      // Get GHL integration settings
      const ghlIntegration = await new Promise((resolve, reject) => {
        db.get(
          "SELECT * FROM ghl_integrations WHERE agency_id = ? AND is_active = 1",
          [agency.id],
          (err, integration) => {
            if (err) reject(err);
            else resolve(integration);
          }
        );
      });

      if (!ghlIntegration) {
        console.log("No active GHL integration found for agency:", agency.id);
        return;
      }

      const isDown = incident.status === "down";
      const message = isDown
        ? `🚨 ALERT: ${site.name} is DOWN. Please check immediately.`
        : `✅ RESOLVED: ${site.name} is back online.`;

      // Send webhook to GHL
      if (ghlIntegration.webhook_url) {
        await axios.post(ghlIntegration.webhook_url, {
          type: "uptime_alert",
          site_name: site.name,
          site_url: site.url,
          status: incident.status,
          message: message,
          timestamp: new Date().toISOString(),
        });
      }

      // Log the alert
      this.logAlert(
        agency.id,
        site.id,
        incident.id,
        "ghl",
        ghlIntegration.webhook_url,
        message
      );

      console.log(`GHL alert sent for site ${site.name}`);
    } catch (error) {
      console.error("Failed to send GHL alert:", error);
      throw error;
    }
  }

  generateEmailHTML(agency, site, incident, isDown) {
    const statusColor = isDown ? "#ef4444" : "#10b981";
    const statusText = isDown ? "DOWN" : "UP";
    const brandColor = agency.brand_color || "#3B82F6";

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
          ${
            agency.logo_url
              ? `<img src="${agency.logo_url}" alt="${agency.name}" style="max-height: 50px; margin-bottom: 10px;">`
              : ""
          }
          <h1 style="margin: 0;">${agency.name}</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e9ecef;">
          <div style="background: ${statusColor}; color: white; padding: 15px; border-radius: 6px; text-align: center; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 24px;">Site is ${statusText}</h2>
          </div>
          
          <h3 style="color: #495057; margin-bottom: 15px;">${site.name}</h3>
          <p style="margin-bottom: 10px;"><strong>URL:</strong> <a href="${
            site.url
          }" style="color: ${brandColor};">${site.url}</a></p>
          <p style="margin-bottom: 10px;"><strong>Status:</strong> ${statusText}</p>
          <p style="margin-bottom: 10px;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          
          ${
            incident.description
              ? `<p style="margin-bottom: 20px;"><strong>Details:</strong> ${incident.description}</p>`
              : ""
          }
          
          <div style="background: white; padding: 20px; border-radius: 6px; border: 1px solid #dee2e6;">
            <p style="margin: 0; color: #6c757d; font-size: 14px;">
              This alert was sent by Agency Uptime monitoring service. 
              ${
                agency.custom_domain
                  ? `Visit your dashboard at ${agency.custom_domain}`
                  : "Visit your dashboard to manage alerts."
              }
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  logAlert(agencyId, siteId, incidentId, type, recipient, message) {
    const db = getDatabase();

    db.run(
      "INSERT INTO alerts (agency_id, site_id, incident_id, type, recipient, message) VALUES (?, ?, ?, ?, ?, ?)",
      [agencyId, siteId, incidentId || null, type, recipient, message],
      (err) => {
        if (err) {
          console.error("Failed to log alert:", err);
        }
      }
    );
  }
}

const alertService = new AlertService();

module.exports = {
  sendAlert: (agencyId, site, incident, alertType) =>
    alertService.sendAlert(agencyId, site, incident, alertType),
  sendAllSitesAlert: (agencyId, sites, alertType) =>
    alertService.sendAllSitesAlert(agencyId, sites, alertType),
  AlertService,
};
