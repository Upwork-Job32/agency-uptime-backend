require("dotenv").config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 5000,
  JWT_SECRET:
    process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  // Database
  DB_PATH: process.env.DB_PATH || "./database/agency_uptime.db",

  // Email configuration
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  FROM_EMAIL: process.env.FROM_EMAIL || "noreply@agencyuptime.com",

  // Stripe configuration (Test Keys)
  STRIPE_SECRET_KEY:
    process.env.STRIPE_SECRET_KEY ||
    "sk_test_51Raoq8Q83GeCuA12gtwh5fA9scmlE2M8IhzJCOSPfXty4a6Efheqn7KoaxhGfdr7p2rlTQRzOk73byD1FArSEe1T00gYbB6oek",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  STRIPE_PUBLISHABLE_KEY:
    process.env.STRIPE_PUBLISHABLE_KEY ||
    "pk_test_51Raoq8Q83GeCuA12DTVYHo8v9CXvYW0A6EXVzHvBz5ryr0nfnZq1KrLiOAQU4Z6fhlKPz2QbZWLdtbvJFigeFrja007HebadKw",

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100, // limit each IP to 100 requests per windowMs

  // CORS configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || [
    "http://localhost:3000",
    "http://localhost:3001",
  ],
};
