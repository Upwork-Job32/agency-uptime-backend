const { getDatabase } = require("../config/database");
const { AlertService } = require("../services/alerts");

async function testSlackIntegration() {
  console.log("🧪 Testing Slack Integration...\n");

  const db = getDatabase();

  // Check if there are any Slack integrations
  db.all(
    "SELECT * FROM slack_integrations WHERE is_active = 1",
    [],
    async (err, integrations) => {
      if (err) {
        console.error("❌ Database error:", err);
        return;
      }

      if (!integrations || integrations.length === 0) {
        console.log("ℹ️  No active Slack integrations found.");
        console.log(
          "Please add a Slack webhook URL through the frontend first."
        );
        return;
      }

      console.log(
        `✅ Found ${integrations.length} active Slack integration(s)`
      );

      for (const integration of integrations) {
        console.log(
          `\n📋 Testing integration for agency ${integration.agency_id}`
        );
        console.log(
          `🔗 Webhook: ${integration.webhook_url.substring(0, 50)}...`
        );

        // Get agency info
        db.get(
          "SELECT * FROM agencies WHERE id = ?",
          [integration.agency_id],
          async (err, agency) => {
            if (err || !agency) {
              console.error("❌ Agency not found:", err);
              return;
            }

            // Get a test site
            db.get(
              "SELECT * FROM sites WHERE agency_id = ? LIMIT 1",
              [integration.agency_id],
              async (err, site) => {
                if (err || !site) {
                  console.error("❌ No sites found for this agency");
                  return;
                }

                try {
                  const alertService = new AlertService();

                  // Create test incident
                  const testIncident = {
                    site_id: site.id,
                    status: "down",
                    started_at: new Date().toISOString(),
                    description:
                      "🧪 Test alert from Slack integration test script",
                  };

                  console.log(`📧 Sending test alert for site: ${site.name}`);
                  await alertService.sendSlackAlert(agency, site, testIncident);
                  console.log("✅ Test alert sent successfully!");
                } catch (error) {
                  console.error("❌ Failed to send test alert:", error.message);
                }
              }
            );
          }
        );
      }
    }
  );
}

if (require.main === module) {
  testSlackIntegration();
}

module.exports = testSlackIntegration;
