const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "../database/agency_uptime.db");

function runMigration() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("Error opening database:", err);
      process.exit(1);
    } else {
      console.log("Connected to SQLite database for migration");
    }
  });

  const migrations = `
    -- Slack integrations table
    CREATE TABLE IF NOT EXISTS slack_integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      webhook_url TEXT NOT NULL,
      channel TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
    );

    -- Alert settings table
    CREATE TABLE IF NOT EXISTS alert_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      email_alerts BOOLEAN DEFAULT 1,
      slack_alerts BOOLEAN DEFAULT 0,
      webhook_alerts BOOLEAN DEFAULT 0,
      ghl_alerts BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
    );

    -- Webhook settings table
    CREATE TABLE IF NOT EXISTS webhook_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      webhook_url TEXT NOT NULL,
      name TEXT,
      headers TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
    );

    -- Add indexes
    CREATE INDEX IF NOT EXISTS idx_slack_integrations_agency_id ON slack_integrations(agency_id);
    CREATE INDEX IF NOT EXISTS idx_alert_settings_agency_id ON alert_settings(agency_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_settings_agency_id ON webhook_settings(agency_id);
  `;

  db.exec(migrations, (err) => {
    if (err) {
      console.error("Migration failed:", err);
      process.exit(1);
    } else {
      console.log("✅ Database migration completed successfully!");
      console.log("- Added slack_integrations table");
      console.log("- Added alert_settings table");
      console.log("- Added webhook_settings table");
      console.log("- Added necessary indexes");
    }

    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err);
      } else {
        console.log("Database connection closed.");
      }
    });
  });
}

if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
