const { getDatabase } = require("../config/database");

async function addIntegrationTables() {
  const db = getDatabase();

  try {
    console.log("Adding new integration tables...");

    // Create Discord integrations table
    await new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS discord_integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agency_id INTEGER NOT NULL,
          webhook_url TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) {
            console.error("Error creating discord_integrations table:", err);
            reject(err);
          } else {
            console.log("✓ Created discord_integrations table");
            resolve();
          }
        }
      );
    });

    // Create Telegram integrations table
    await new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS telegram_integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agency_id INTEGER NOT NULL,
          bot_token TEXT NOT NULL,
          chat_id TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) {
            console.error("Error creating telegram_integrations table:", err);
            reject(err);
          } else {
            console.log("✓ Created telegram_integrations table");
            resolve();
          }
        }
      );
    });

    // Create Teams integrations table
    await new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS teams_integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agency_id INTEGER NOT NULL,
          webhook_url TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) {
            console.error("Error creating teams_integrations table:", err);
            reject(err);
          } else {
            console.log("✓ Created teams_integrations table");
            resolve();
          }
        }
      );
    });

    // Create or update webhook_settings table with improved structure
    await new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS webhook_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agency_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          webhook_url TEXT NOT NULL,
          headers TEXT DEFAULT '{}',
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) {
            console.error("Error creating webhook_settings table:", err);
            reject(err);
          } else {
            console.log("✓ Created/Updated webhook_settings table");
            resolve();
          }
        }
      );
    });

    // Create alert_logs table for tracking sent alerts
    await new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS alert_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agency_id INTEGER NOT NULL,
          site_id INTEGER,
          incident_id INTEGER,
          alert_type TEXT NOT NULL,
          destination TEXT NOT NULL,
          message TEXT,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
          FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE
        )`,
        (err) => {
          if (err) {
            console.error("Error creating alert_logs table:", err);
            reject(err);
          } else {
            console.log("✓ Created alert_logs table");
            resolve();
          }
        }
      );
    });

    // Update alert_settings table to include new integration types
    await new Promise((resolve, reject) => {
      db.run(
        `ALTER TABLE alert_settings ADD COLUMN discord_alerts BOOLEAN DEFAULT 0`,
        (err) => {
          if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding discord_alerts column:", err);
            reject(err);
          } else {
            console.log("✓ Added discord_alerts column to alert_settings");
            resolve();
          }
        }
      );
    });

    await new Promise((resolve, reject) => {
      db.run(
        `ALTER TABLE alert_settings ADD COLUMN telegram_alerts BOOLEAN DEFAULT 0`,
        (err) => {
          if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding telegram_alerts column:", err);
            reject(err);
          } else {
            console.log("✓ Added telegram_alerts column to alert_settings");
            resolve();
          }
        }
      );
    });

    await new Promise((resolve, reject) => {
      db.run(
        `ALTER TABLE alert_settings ADD COLUMN teams_alerts BOOLEAN DEFAULT 0`,
        (err) => {
          if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding teams_alerts column:", err);
            reject(err);
          } else {
            console.log("✓ Added teams_alerts column to alert_settings");
            resolve();
          }
        }
      );
    });

    console.log("\n🎉 Integration tables added successfully!");
    console.log("New integrations available:");
    console.log("📢 Discord webhooks");
    console.log("📱 Telegram bot");
    console.log("👥 Microsoft Teams");
    console.log("🔗 Enhanced generic webhooks");
  } catch (error) {
    console.error("❌ Failed to add integration tables:", error);
  }
}

// Run the migration
if (require.main === module) {
  addIntegrationTables()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

module.exports = { addIntegrationTables };
