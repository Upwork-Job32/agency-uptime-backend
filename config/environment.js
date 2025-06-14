require("dotenv").config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 5000,
  JWT_SECRET:
    process.env.JWT_SECRET ||
    "agency-uptime-super-secret-key-change-in-production",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  // Database
  DB_PATH: process.env.DB_PATH || "./database/agency_uptime.db",

  // Email configuration
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  FROM_EMAIL: process.env.FROM_EMAIL || "noreply@agencyuptime.com",

  // Stripe configuration
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
};
