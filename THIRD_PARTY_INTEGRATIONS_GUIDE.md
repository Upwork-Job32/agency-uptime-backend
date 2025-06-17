# Third-Party Integrations Setup Guide

## Overview

Agency Uptime Monitor supports comprehensive third-party integrations to send real-time alerts when your monitored sites go down. This guide covers setup for all supported platforms.

## Supported Integrations

- 🔔 **Slack** - Send alerts to Slack channels
- 📢 **Discord** - Send alerts to Discord servers
- 📱 **Telegram** - Send alerts via Telegram bot
- 👥 **Microsoft Teams** - Send alerts to Teams channels
- 🔗 **Custom Webhooks** - Send alerts to any API endpoint

## 1. Slack Integration

### Setup Instructions

1. Go to [Slack Apps](https://api.slack.com/apps/)
2. Click **"Create New App"** → **"From scratch"**
3. Name your app (e.g., "Agency Uptime Alerts")
4. Select your Slack workspace
5. Navigate to **"Incoming Webhooks"**
6. Toggle **"Activate Incoming Webhooks"** to ON
7. Click **"Add New Webhook to Workspace"**
8. Choose the channel for alerts
9. Copy the webhook URL

### Configuration

```bash
# Webhook URL format:
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX

# Optional: Specify custom channel
Channel: #alerts or @username
```

### Features

- Rich formatted messages with site status
- Direct links to monitored sites
- Color-coded alerts (red for down, green for up)
- Customizable channel overrides

## 2. Discord Integration

### Setup Instructions

1. Go to your Discord server
2. Right-click the channel → **"Edit Channel"**
3. Navigate to **"Integrations"** → **"Webhooks"**
4. Click **"New Webhook"**
5. Configure the webhook:
   - Name: "Agency Uptime"
   - Channel: Select target channel
6. Copy the webhook URL

### Configuration

```bash
# Webhook URL format:
https://discord.com/api/webhooks/123456789/abcdefghijklmnopqrstuvwxyz
```

### Features

- Rich embed messages with status indicators
- Colored embeds (red for down, green for up)
- Clickable site links
- Timestamp information
- Custom avatar and username

## 3. Telegram Integration

### Setup Instructions

1. Open Telegram and message [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow prompts to name your bot
4. Copy the bot token provided
5. Add your bot to a group or get your chat ID:
   - For groups: Add bot and use group chat ID (negative number)
   - For channels: Use @channel_username format
   - For direct messages: Use your user ID

### Getting Chat ID

**For Groups:**

1. Add your bot to the group
2. Send a message mentioning the bot
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for the "chat" object and copy the "id" (negative number)

**For Channels:**

1. Add your bot as admin to the channel
2. Use the channel username format: `@yourchannel`

### Configuration

```bash
# Bot Token format:
123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Chat ID examples:
-1001234567890  # Group chat
@mychannel      # Channel username
123456789       # Direct message user ID
```

### Features

- Markdown-formatted messages
- Clickable site links
- Emoji status indicators
- Agency branding
- Bot commands support

## 4. Microsoft Teams Integration

### Setup Instructions

1. Go to your Teams channel
2. Click **"..." (More options)** → **"Connectors"**
3. Search for **"Incoming Webhook"**
4. Click **"Configure"**
5. Provide a name (e.g., "Agency Uptime Alerts")
6. Upload an image (optional)
7. Click **"Create"**
8. Copy the webhook URL

### Configuration

```bash
# Webhook URL format:
https://outlook.office.com/webhook/12345678-1234-1234-1234-123456789012@12345678-1234-1234-1234-123456789012/IncomingWebhook/abcdefghijklmnopqrstuvwxyz/12345678-1234-1234-1234-123456789012
```

### Features

- Microsoft Teams cards with rich formatting
- Color-coded alerts
- Action buttons (Visit Site)
- Structured fact display
- Professional appearance

## 5. Custom Webhooks

### Setup Instructions

Custom webhooks allow you to integrate with any API endpoint that accepts HTTP POST requests.

### Configuration

```bash
# Webhook URL: Any valid HTTPS endpoint
https://api.example.com/webhooks/uptime

# Custom Headers (optional):
{
  "Authorization": "Bearer your-api-key",
  "Content-Type": "application/json",
  "X-API-Version": "v1"
}
```

### Payload Format

Your endpoint will receive the following JSON payload:

```json
{
  "event": "site_status_change",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "site": {
    "id": 123,
    "name": "My Website",
    "url": "https://example.com",
    "status": "down"
  },
  "incident": {
    "id": 456,
    "status": "down",
    "description": "HTTP timeout after 30 seconds",
    "started_at": "2024-01-01T12:00:00.000Z",
    "resolved_at": null
  },
  "agency": {
    "id": 1,
    "name": "My Agency"
  },
  "alert": {
    "message": "🚨 My Website is DOWN",
    "severity": "critical",
    "type": "uptime_alert"
  }
}
```

### Features

- Complete flexibility with custom endpoints
- Custom headers support
- Structured JSON payload
- Real-time delivery
- Retry mechanism with exponential backoff

## Testing Integrations

### Built-in Test Feature

All integrations include a test button that sends a sample alert to verify configuration:

1. Configure your integration
2. Click the **Test** button (🧪)
3. Check your platform for the test message
4. Verify the formatting and delivery

### Test Message Content

Test messages include:

- Sample site name and URL
- Test status (DOWN)
- Current timestamp
- Your agency name
- Platform-specific formatting

## Alert Content

### Standard Information

All alerts include:

- **Site Name** and **URL**
- **Current Status** (UP/DOWN)
- **Timestamp** of the incident
- **Agency Name**
- **Description** (if available)

### Platform-Specific Features

| Platform | Rich Formatting | Images    | Actions    | Custom Fields       |
| -------- | --------------- | --------- | ---------- | ------------------- |
| Slack    | ✅ Attachments  | ✅ Icons  | ❌         | ✅ Custom channels  |
| Discord  | ✅ Embeds       | ✅ Avatar | ❌         | ✅ Color coding     |
| Telegram | ✅ Markdown     | ❌        | ❌         | ✅ Bot commands     |
| Teams    | ✅ Cards        | ✅ Icons  | ✅ Buttons | ✅ Structured facts |
| Webhook  | ✅ JSON         | ❌        | ❌         | ✅ Custom headers   |

## Troubleshooting

### Common Issues

#### "Webhook URL is invalid"

- **Solution**: Verify the URL format matches the platform requirements
- **Check**: Ensure HTTPS protocol is used
- **Test**: Use the built-in test feature

#### "Test shows success but no message received"

- **Solution**: Check webhook URL and permissions
- **Telegram**: Verify bot is added to group/channel
- **Discord**: Ensure webhook channel permissions
- **Teams**: Verify connector is properly configured

#### "Integration saves but alerts not sent"

- **Solution**: Check alert settings are enabled
- **Verify**: Integration toggle is ON in General settings
- **Check**: Site monitoring is active

#### "Message formatting issues"

- **Slack**: Check channel permissions and webhook format
- **Discord**: Verify embed permissions in channel
- **Telegram**: Ensure bot has message permissions
- **Teams**: Check connector configuration

### Debug Steps

1. **Verify Integration Status**

   ```bash
   # Check integration is active
   GET /api/alerts/settings
   ```

2. **Test Individual Integration**

   ```bash
   # Send test alert
   POST /api/alerts/test-integration
   {
     "integration_type": "slack",
     "config": { "webhook_url": "your-url" }
   }
   ```

3. **Check Alert Logs**
   ```bash
   # View recent alerts
   GET /api/alerts/logs?limit=50
   ```

### Support

If you're experiencing issues:

1. Check the backend logs for detailed error messages
2. Verify your webhook URL is valid by testing directly
3. Ensure the integration platform has proper permissions
4. Test with the built-in test functionality
5. Check our troubleshooting guide for platform-specific issues

## Security Best Practices

### Webhook Security

1. **Use HTTPS Only**: All webhook URLs must use HTTPS
2. **Validate Webhook URLs**: Only use official platform webhook formats
3. **Secure Headers**: Use authentication headers for custom webhooks
4. **Monitor Access**: Regularly review webhook access logs

### Token Security

1. **Keep Tokens Private**: Never commit tokens to version control
2. **Rotate Regularly**: Update bot tokens and webhook URLs periodically
3. **Limit Permissions**: Use minimal required permissions for bots
4. **Monitor Usage**: Check for unauthorized API usage

### Data Privacy

1. **Minimal Data**: Only necessary alert information is sent
2. **No Sensitive Data**: Personal information is never included
3. **Audit Trail**: All sent alerts are logged for review
4. **Compliance**: Ensure platform usage meets your compliance requirements

## Advanced Configuration

### Custom Alert Templates

You can customize alert messages by modifying the integration service:

```javascript
// Example: Custom Slack message format
const customSlackPayload = {
  text: `🚨 ALERT: ${site.name} is DOWN`,
  attachments: [
    {
      color: "danger",
      fields: [
        { title: "Site", value: site.name, short: true },
        { title: "URL", value: site.url, short: true },
        { title: "Time", value: new Date().toLocaleString(), short: true },
      ],
    },
  ],
};
```

### Multiple Webhooks

You can configure multiple webhook endpoints for the same platform:

1. Set up multiple integrations with different configurations
2. Use different channels/groups for different alert types
3. Implement custom routing based on site categories

### Integration Monitoring

Monitor your integrations with:

1. **Alert Logs**: Track successful/failed alert deliveries
2. **Response Monitoring**: Monitor webhook response times
3. **Error Tracking**: Log and alert on integration failures
4. **Usage Analytics**: Track alert volume and patterns

## API Reference

### Integration Endpoints

```bash
# Get current settings
GET /api/alerts/settings

# Update general settings
POST /api/alerts/settings

# Configure Slack
POST /api/alerts/slack-integration

# Configure Discord
POST /api/alerts/discord-integration

# Configure Telegram
POST /api/alerts/telegram-integration

# Configure Teams
POST /api/alerts/teams-integration

# Configure Custom Webhook
POST /api/alerts/webhook-integration

# Test Integration
POST /api/alerts/test-integration

# Get Alert Logs
GET /api/alerts/logs
```

### Example API Calls

```bash
# Configure Slack integration
curl -X POST http://localhost:5000/api/alerts/slack-integration \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://hooks.slack.com/services/...",
    "channel": "#alerts"
  }'

# Test Discord integration
curl -X POST http://localhost:5000/api/alerts/test-integration \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "integration_type": "discord",
    "config": {
      "webhook_url": "https://discord.com/api/webhooks/..."
    }
  }'
```

---

## Quick Setup Checklist

- [ ] Choose your preferred platforms
- [ ] Set up webhook URLs/bot tokens
- [ ] Configure integrations in dashboard
- [ ] Test each integration
- [ ] Enable alert types in General settings
- [ ] Monitor first real alerts
- [ ] Review alert logs periodically

**Need help?** Check our troubleshooting section or contact support with your integration logs and configuration details.
