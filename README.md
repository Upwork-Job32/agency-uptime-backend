# Agency Uptime Backend

A comprehensive Node.js backend for the Agency Uptime monitoring service that provides white-labeled uptime monitoring for agencies.

## Features

- **Core Monitoring System**: HTTP/HTTPS endpoint monitoring with configurable intervals
- **Multi-Region Monitoring**: Support for distributed worker nodes
- **Alerting System**: Email, GoHighLevel, and webhook notifications
- **Agency Dashboard**: Complete CRUD operations for sites and settings
- **Billing Integration**: Stripe subscription management with add-ons
- **PDF Reports**: Automated monthly uptime reports
- **Public Status Pages**: White-labeled status pages for clients
- **Client Dashboard**: Reseller dashboard for end clients
- **Real-time Monitoring**: Live status updates and incident tracking

## Tech Stack

- **Runtime**: Node.js with Express.js
- **Database**: SQLite (easily replaceable with PostgreSQL/MySQL)
- **Authentication**: JWT-based authentication
- **Payments**: Stripe integration
- **PDF Generation**: Puppeteer
- **Email**: Nodemailer with SMTP
- **Monitoring**: Custom monitoring service with axios
- **Scheduling**: Cron jobs for automated tasks

## Installation

1. Clone the repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Copy environment variables:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

4. Configure your environment variables in `.env`

5. Initialize the database:
   \`\`\`bash
   npm run init-db
   \`\`\`

6. Seed with demo data (optional):
   \`\`\`bash
   npm run seed-db
   \`\`\`

7. Start the server:
   \`\`\`bash
   npm run dev
   \`\`\`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new agency
- `POST /api/auth/login` - Agency login
- `GET /api/auth/profile` - Get agency profile
- `PUT /api/auth/profile` - Update agency profile

### Sites Management
- `GET /api/sites` - Get all sites for agency
- `POST /api/sites` - Add new site
- `GET /api/sites/:id` - Get single site
- `PUT /api/sites/:id` - Update site
- `DELETE /api/sites/:id` - Delete site
- `GET /api/sites/:id/logs` - Get monitoring logs
- `GET /api/sites/:id/incidents` - Get site incidents

### Alerts
- `GET /api/alerts` - Get alert history
- `GET /api/alerts/settings` - Get alert settings
- `POST /api/alerts/ghl-integration` - Configure GHL integration
- `POST /api/alerts/test` - Send test alert

### Billing
- `GET /api/billing/subscription` - Get subscription status
- `POST /api/billing/create-checkout-session` - Create Stripe checkout
- `GET /api/billing/success/:session_id` - Handle successful payment
- `POST /api/billing/toggle-addon` - Toggle add-on features

### Reports
- `GET /api/reports` - Get generated reports
- `POST /api/reports/generate` - Generate monthly report
- `GET /api/reports/download/:filename` - Download report

### Status Pages
- `GET /api/status/page/:domain` - Public status page data
- `GET /api/status/page/:domain/incidents` - Public incidents

### Admin
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/activity` - Recent activity

### Webhooks
- `POST /api/webhooks/report` - Worker node reports
- `POST /api/webhooks/stripe` - Stripe webhook handler

## Database Schema

The application uses SQLite with the following main tables:

- `agencies` - Agency accounts and settings
- `sites` - Monitored websites
- `monitoring_logs` - Check results and response times
- `incidents` - Downtime incidents
- `alerts` - Alert history
- `subscriptions` - Billing and subscription data
- `addons` - Add-on features per agency
- `ghl_integrations` - GoHighLevel integration settings
- `reports` - Generated PDF reports
- `client_access` - Client dashboard access (resell addon)

## Monitoring Service

The built-in monitoring service:

- Checks all active sites every 30 seconds
- Supports HTTP/HTTPS monitoring
- Tracks response times and status codes
- Automatically creates incidents on status changes
- Triggers alerts via multiple channels
- Handles redundant confirmation logic

## Add-ons

### PDF Reports ($29/month)
- Automated monthly uptime reports
- Branded with agency logo and colors
- Email delivery to agency
- Historical report archive

### Status Pages ($19/month)
- Public status pages for clients
- Custom domain support
- Real-time status updates
- Incident history display

### Resell Dashboard ($49/month)
- White-labeled client access
- Site-specific permissions
- Branded as agency's product
- Client user management

## Deployment

1. Set up your production environment variables
2. Configure your database (SQLite/PostgreSQL/MySQL)
3. Set up SMTP for email alerts
4. Configure Stripe webhooks
5. Deploy to your preferred hosting platform
6. Set up SSL certificates for custom domains

## Environment Variables

See `.env.example` for all required environment variables including:

- Database configuration
- JWT secrets
- SMTP settings
- Stripe keys
- External service APIs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the repository or contact the development team.
