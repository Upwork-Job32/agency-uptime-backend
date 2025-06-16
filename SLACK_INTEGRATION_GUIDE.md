# Slack Integration Setup Guide

## Overview

This guide will help you set up Slack alerts for your Agency Uptime monitoring system.

## Prerequisites

- Node.js backend server running
- Frontend application running
- A Slack workspace where you have permission to add apps

## Step 1: Create a Slack Webhook

1. Go to [https://api.slack.com/apps/](https://api.slack.com/apps/)
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Enter an app name (e.g., "Agency Uptime Alerts")
5. Select your Slack workspace
6. Click **"Create App"**

### Configure Incoming Webhooks

1. In your app settings, go to **"Incoming Webhooks"**
2. Toggle **"Activate Incoming Webhooks"** to ON
3. Click **"Add New Webhook to Workspace"**
4. Choose the channel where you want alerts to be sent
5. Click **"Allow"**
6. Copy the webhook URL (starts with `https://hooks.slack.com/services/...`)

## Step 2: Test the Webhook (Optional but Recommended)

Run the test script to verify your webhook works:

```bash
cd backend
node test-new-slack-webhook.js
```

Follow the prompts and paste your webhook URL. You should see a test message in your Slack channel.

## Step 3: Configure in Frontend

1. Open your frontend application (usually at `http://localhost:3000`)
2. Log in to your account
3. Click **"Manage Alerts"**
4. Go to the **"Slack"** tab
5. Paste your webhook URL
6. (Optional) Specify a channel name if you want to override the default
7. Click **"Save Slack Integration"**

## Step 4: Enable Slack Alerts

1. In the **"General"** tab of Manage Alerts
2. Toggle **"Slack Alerts"** to ON
3. Click **"Save Settings"**

## Step 5: Test the Integration

### Frontend Test

1. In the **"General"** tab, click **"Test Slack"**
2. You should see a success message and receive an alert in Slack

### Backend Test

```bash
cd backend
node scripts/test-slack-integration.js
```

## Troubleshooting

### Common Issues

#### "No active Slack integration found"

- **Solution**: Make sure you've completed Step 3 and saved the integration
- **Check**: Verify the `slack_integrations` table has an entry with `is_active = 1`

#### "Webhook URL is invalid"

- **Solution**: Ensure the URL starts with `https://hooks.slack.com/services/`
- **Check**: Test the webhook URL directly using the test script

#### "Test shows success but no message in Slack"

- **Solution**: Check if the webhook URL is correct and the channel still exists
- **Verification**: Run the standalone webhook test: `node test-new-slack-webhook.js`

#### "Database error" or "Table doesn't exist"

- **Solution**: Run the migration script: `node scripts/migrate-database.js`
- **Check**: Restart the backend server after migration

### Database Verification

You can check your database directly:

```bash
# Check if slack integrations exist
sqlite3 database/agency_uptime.db "SELECT * FROM slack_integrations;"

# Check alert settings
sqlite3 database/agency_uptime.db "SELECT * FROM alert_settings;"
```

### Manual Database Insert (if needed)

If the frontend isn't working, you can manually insert a Slack integration:

```sql
INSERT INTO slack_integrations (agency_id, webhook_url, channel, is_active)
VALUES (1, 'your_webhook_url_here', '#general', 1);

INSERT INTO alert_settings (agency_id, email_alerts, slack_alerts, webhook_alerts, ghl_alerts)
VALUES (1, 1, 1, 0, 0);
```

## Alert Message Format

Slack alerts include:

- ✅/🚨 Status indicator
- Site name and URL
- Current status (UP/DOWN)
- Timestamp
- Agency name
- Description (if available)

## Advanced Configuration

### Custom Channels

You can specify different channels for different integrations by entering the channel name (e.g., `#alerts` or `@username`) in the channel field.

### Multiple Webhooks

Each agency can have one Slack integration. To use multiple channels, create separate webhook URLs in Slack for each channel.

## API Endpoints

The following endpoints are available for Slack integration:

- `POST /api/alerts/slack-integration` - Save/update integration
- `GET /api/alerts/settings` - Get current settings
- `POST /api/alerts/test` - Test single site alert
- `POST /api/alerts/test-all-sites` - Test all sites status report

## Support

If you're still having issues:

1. Check the backend logs for detailed error messages
2. Verify your webhook URL is valid by testing it directly
3. Ensure the database migration was successful
4. Restart both frontend and backend servers

## Webhook URL Security

- Keep your webhook URLs private and secure
- Regenerate webhook URLs if they're compromised
- Don't commit webhook URLs to version control
