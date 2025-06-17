const axios = require("axios");
const { getDatabase } = require("../config/database");

class ThirdPartyIntegrationsService {
  constructor() {
    this.timeouts = {
      webhook: 10000,
      telegram: 5000,
      discord: 10000,
      teams: 10000,
      slack: 10000,
    };
  }

  // Generic webhook integration
  async sendWebhookAlert(agencyId, site, incident, webhookConfig) {
    try {
      const isDown = incident.status === "down";

      const payload = {
        event: "site_status_change",
        timestamp: new Date().toISOString(),
        site: {
          id: site.id,
          name: site.name,
          url: site.url,
          status: incident.status,
        },
        incident: {
          id: incident.id,
          status: incident.status,
          description: incident.description,
          started_at: incident.started_at,
          resolved_at: incident.resolved_at,
        },
        agency: {
          id: agencyId,
          name: webhookConfig.agency_name,
        },
        alert: {
          message: isDown
            ? `🚨 ${site.name} is DOWN`
            : `✅ ${site.name} is back UP`,
          severity: isDown ? "critical" : "resolved",
          type: "uptime_alert",
        },
      };

      const headers = {
        "Content-Type": "application/json",
        "User-Agent": "Agency-Uptime-Monitor/1.0",
        ...webhookConfig.headers,
      };

      const response = await axios.post(webhookConfig.url, payload, {
        headers,
        timeout: this.timeouts.webhook,
      });

      console.log(`✅ Generic webhook alert sent to ${webhookConfig.name}`);
      return { success: true, response: response.data };
    } catch (error) {
      console.error(
        `❌ Failed to send webhook alert to ${webhookConfig.name}:`,
        error.message
      );
      throw error;
    }
  }

  // Discord webhook integration
  async sendDiscordAlert(agencyId, site, incident, discordConfig) {
    try {
      const isDown = incident.status === "down";
      const color = isDown ? 15158332 : 3066993; // Red or Green
      const statusEmoji = isDown ? "🚨" : "✅";
      const statusText = isDown ? "DOWN" : "BACK UP";

      const embed = {
        title: `${statusEmoji} ${site.name} is ${statusText}`,
        url: site.url,
        color: color,
        fields: [
          {
            name: "Site",
            value: `[${site.name}](${site.url})`,
            inline: true,
          },
          {
            name: "Status",
            value: statusText,
            inline: true,
          },
          {
            name: "Time",
            value: new Date().toLocaleString(),
            inline: true,
          },
        ],
        footer: {
          text: `Agency Uptime Monitor | ${discordConfig.agency_name}`,
        },
        timestamp: new Date().toISOString(),
      };

      if (incident.description) {
        embed.fields.push({
          name: "Description",
          value: incident.description,
          inline: false,
        });
      }

      const payload = {
        username: "Agency Uptime",
        avatar_url: "https://cdn-icons-png.flaticon.com/512/1828/1828490.png",
        embeds: [embed],
      };

      const response = await axios.post(discordConfig.webhook_url, payload, {
        timeout: this.timeouts.discord,
      });

      console.log(`✅ Discord alert sent successfully`);
      return { success: true, response: response.data };
    } catch (error) {
      console.error(`❌ Failed to send Discord alert:`, error.message);
      throw error;
    }
  }

  // Telegram bot integration
  async sendTelegramAlert(agencyId, site, incident, telegramConfig) {
    try {
      const isDown = incident.status === "down";
      const statusEmoji = isDown ? "🚨" : "✅";
      const statusText = isDown ? "DOWN" : "BACK UP";

      const message = `${statusEmoji} *${site.name}* is ${statusText}

🔗 *Site:* [${site.name}](${site.url})
📊 *Status:* ${statusText}
⏰ *Time:* ${new Date().toLocaleString()}
🏢 *Agency:* ${telegramConfig.agency_name}

${incident.description ? `📝 *Description:* ${incident.description}` : ""}

_Powered by Agency Uptime Monitor_`;

      const payload = {
        chat_id: telegramConfig.chat_id,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      };

      const url = `https://api.telegram.org/bot${telegramConfig.bot_token}/sendMessage`;

      const response = await axios.post(url, payload, {
        timeout: this.timeouts.telegram,
      });

      console.log(`✅ Telegram alert sent successfully`);
      return { success: true, response: response.data };
    } catch (error) {
      console.error(`❌ Failed to send Telegram alert:`, error.message);
      throw error;
    }
  }

  // Microsoft Teams webhook integration
  async sendTeamsAlert(agencyId, site, incident, teamsConfig) {
    try {
      const isDown = incident.status === "down";
      const color = isDown ? "attention" : "good";
      const statusEmoji = isDown ? "🚨" : "✅";
      const statusText = isDown ? "DOWN" : "BACK UP";

      const card = {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        themeColor: isDown ? "FF0000" : "00FF00",
        summary: `${site.name} is ${statusText}`,
        sections: [
          {
            activityTitle: `${statusEmoji} Site Status Alert`,
            activitySubtitle: `${site.name} is ${statusText}`,
            activityImage:
              "https://cdn-icons-png.flaticon.com/512/1828/1828490.png",
            facts: [
              {
                name: "Site",
                value: site.name,
              },
              {
                name: "URL",
                value: site.url,
              },
              {
                name: "Status",
                value: statusText,
              },
              {
                name: "Time",
                value: new Date().toLocaleString(),
              },
              {
                name: "Agency",
                value: teamsConfig.agency_name,
              },
            ],
            markdown: true,
          },
        ],
        potentialAction: [
          {
            "@type": "OpenUri",
            name: "Visit Site",
            targets: [
              {
                os: "default",
                uri: site.url,
              },
            ],
          },
        ],
      };

      if (incident.description) {
        card.sections[0].facts.push({
          name: "Description",
          value: incident.description,
        });
      }

      const response = await axios.post(teamsConfig.webhook_url, card, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: this.timeouts.teams,
      });

      console.log(`✅ Teams alert sent successfully`);
      return { success: true, response: response.data };
    } catch (error) {
      console.error(`❌ Failed to send Teams alert:`, error.message);
      throw error;
    }
  }

  // Enhanced Slack integration (improved from existing)
  async sendSlackAlert(agencyId, site, incident, slackConfig) {
    try {
      const isDown = incident.status === "down";
      const statusEmoji = isDown ? "🚨" : "✅";
      const statusText = isDown ? "DOWN" : "BACK UP";
      const color = isDown ? "danger" : "good";

      const payload = {
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
                value: slackConfig.agency_name,
                short: true,
              },
            ],
            footer: "Agency Uptime Monitor",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };

      if (slackConfig.channel) {
        payload.channel = slackConfig.channel;
      }

      if (incident.description) {
        payload.attachments[0].fields.push({
          title: "Description",
          value: incident.description,
          short: false,
        });
      }

      const response = await axios.post(slackConfig.webhook_url, payload, {
        timeout: this.timeouts.slack,
      });

      console.log(`✅ Slack alert sent successfully`);
      return { success: true, response: response.data };
    } catch (error) {
      console.error(`❌ Failed to send Slack alert:`, error.message);
      throw error;
    }
  }

  // Test integration with a sample message
  async testIntegration(agencyId, integrationType, config) {
    const testSite = {
      id: 999,
      name: "Test Site",
      url: "https://example.com",
    };

    const testIncident = {
      id: 999,
      status: "down",
      description: "🧪 This is a test alert from Agency Uptime Monitor",
      started_at: new Date().toISOString(),
    };

    try {
      let result;

      switch (integrationType) {
        case "slack":
          result = await this.sendSlackAlert(
            agencyId,
            testSite,
            testIncident,
            config
          );
          break;
        case "discord":
          result = await this.sendDiscordAlert(
            agencyId,
            testSite,
            testIncident,
            config
          );
          break;
        case "telegram":
          result = await this.sendTelegramAlert(
            agencyId,
            testSite,
            testIncident,
            config
          );
          break;
        case "teams":
          result = await this.sendTeamsAlert(
            agencyId,
            testSite,
            testIncident,
            config
          );
          break;
        case "webhook":
          result = await this.sendWebhookAlert(
            agencyId,
            testSite,
            testIncident,
            config
          );
          break;
        default:
          throw new Error(`Unsupported integration type: ${integrationType}`);
      }

      return {
        success: true,
        message: `Test ${integrationType} alert sent successfully`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ThirdPartyIntegrationsService();
