const axios = require("axios");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function testNewSlackWebhook() {
  console.log("=== SLACK WEBHOOK TESTER ===");
  console.log("This script will help you test a new Slack webhook URL");
  console.log("\nTo get a new webhook URL:");
  console.log("1. Go to https://api.slack.com/apps/");
  console.log("2. Create/select your app");
  console.log('3. Go to "Incoming Webhooks"');
  console.log("4. Add New Webhook to Workspace");
  console.log("5. Copy the webhook URL\n");

  return new Promise((resolve) => {
    rl.question("Enter your new Slack webhook URL: ", async (webhookUrl) => {
      if (!webhookUrl || !webhookUrl.startsWith("https://hooks.slack.com/")) {
        console.log(
          "❌ Invalid webhook URL. It should start with https://hooks.slack.com/"
        );
        rl.close();
        resolve();
        return;
      }

      try {
        console.log("\n=== TESTING NEW WEBHOOK ===");

        const testPayload = {
          username: "Agency Uptime",
          icon_emoji: ":white_check_mark:",
          text: "🎉 Slack Integration Working!",
          attachments: [
            {
              color: "good",
              title: "✅ Slack Webhook Test Successful",
              fields: [
                {
                  title: "Status",
                  value: "Connected & Working",
                  short: true,
                },
                {
                  title: "Test Time",
                  value: new Date().toLocaleString(),
                  short: true,
                },
              ],
              footer: "Agency Uptime - Slack Integration Test",
              ts: Math.floor(Date.now() / 1000),
            },
          ],
        };

        const response = await axios.post(webhookUrl, testPayload, {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
          },
        });

        console.log("✅ SUCCESS! Slack message sent successfully");
        console.log(`Response status: ${response.status}`);
        console.log("\nNow update this URL in your frontend:");
        console.log("1. Go to localhost:3000");
        console.log('2. Open "Manage Alerts"');
        console.log('3. Go to "Slack" tab');
        console.log("4. Paste this URL:", webhookUrl);
        console.log("5. Save the integration");
        console.log("6. Test the alert from the frontend");
      } catch (error) {
        console.error("❌ Test failed:", error.message);
        if (error.response) {
          console.error("Response status:", error.response.status);
          console.error("Response data:", error.response.data);

          if (error.response.status === 403) {
            console.log(
              "\n💡 Tip: Make sure the webhook URL is correct and the app has permissions"
            );
          }
        } else if (error.code === "ENOTFOUND") {
          console.log("\n💡 Tip: Check your internet connection");
        }
      }

      rl.close();
      resolve();
    });
  });
}

if (require.main === module) {
  testNewSlackWebhook();
}

module.exports = testNewSlackWebhook;
