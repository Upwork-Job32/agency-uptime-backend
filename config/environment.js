require("dotenv").config();

function getRequiredEnvVar(name, fallback = null) {
  const value = process.env[name];
  if (!value && !fallback) {
    console.error(`❌ Required environment variable ${name} is not set!`);
    console.error(`Please add ${name}=your_value to your .env file`);
    process.exit(1);
  }
  return value || fallback;
}

function getOptionalEnvVar(name, fallback = "") {
  return process.env[name] || fallback;
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000"),

  // Security - JWT Secret (REQUIRED)
  JWT_SECRET: getRequiredEnvVar("JWT_SECRET"),

  // URLs
  FRONTEND_URL: getOptionalEnvVar("FRONTEND_URL", "http://localhost:3000"),

  // Database
  DB_PATH: getOptionalEnvVar("DB_PATH", "./database/agency_uptime.db"),

  // Email configuration (Optional for development)
  SMTP_HOST: getOptionalEnvVar("SMTP_HOST"),
  SMTP_PORT: parseInt(getOptionalEnvVar("SMTP_PORT", "587")),
  SMTP_USER: getOptionalEnvVar("SMTP_USER"),
  SMTP_PASS: getOptionalEnvVar("SMTP_PASS"),
  FROM_EMAIL: getOptionalEnvVar("FROM_EMAIL", "noreply@agencyuptime.com"),

  // Stripe configuration (REQUIRED for production)
  STRIPE_SECRET_KEY: getRequiredEnvVar("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: getOptionalEnvVar("STRIPE_WEBHOOK_SECRET"),
  STRIPE_PUBLISHABLE_KEY: getRequiredEnvVar("STRIPE_PUBLISHABLE_KEY"),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(
    getOptionalEnvVar("RATE_LIMIT_MAX_REQUESTS", "100")
  ),

  // CORS configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:3000", "http://localhost:3001"],

  // Optional external service API keys
  GHL_API_KEY: getOptionalEnvVar("GHL_API_KEY"),
  TELEGRAM_BOT_TOKEN: getOptionalEnvVar("TELEGRAM_BOT_TOKEN"),
  DISCORD_WEBHOOK_URL: getOptionalEnvVar("DISCORD_WEBHOOK_URL"),
};
