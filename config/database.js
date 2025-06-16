const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "../database/agency_uptime.db");

let db;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("Error opening database:", err);
      } else {
        console.log("Connected to SQLite database");
      }
    });
  }
  return db;
}

async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();

    // Create tables
    const createTables = `
      -- Agencies table
      CREATE TABLE IF NOT EXISTS agencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        logo_url TEXT,
        brand_color TEXT DEFAULT '#3B82F6',
        custom_domain TEXT,
        subscription_status TEXT DEFAULT 'trial',
        subscription_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Sites table
      CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        check_interval INTEGER DEFAULT 300,
        check_type TEXT DEFAULT 'http',
        is_active BOOLEAN DEFAULT 1,
        current_status TEXT DEFAULT 'unknown',
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      );

      -- Monitoring logs table
      CREATE TABLE IF NOT EXISTS monitoring_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        response_time INTEGER,
        status_code INTEGER,
        error_message TEXT,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        worker_node TEXT,
        FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE
      );

      -- Incidents table
      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at DATETIME NOT NULL,
        resolved_at DATETIME,
        duration INTEGER,
        description TEXT,
        FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE
      );

      -- Alerts table
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        site_id INTEGER NOT NULL,
        incident_id INTEGER,
        type TEXT NOT NULL,
        recipient TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'sent',
        FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE,
        FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE SET NULL
      );

      -- Subscriptions table
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        plan_type TEXT DEFAULT 'basic',
        status TEXT DEFAULT 'active',
        stripe_subscription_id TEXT,
        current_period_start DATETIME,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      );

      -- Add-ons table
      CREATE TABLE IF NOT EXISTS addons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        addon_type TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 0,
        stripe_subscription_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      );

      -- GHL integrations table
      CREATE TABLE IF NOT EXISTS ghl_integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        location_id TEXT NOT NULL,
        webhook_url TEXT,
        api_key TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      );

      -- Reports table
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        report_type TEXT NOT NULL,
        period_start DATETIME NOT NULL,
        period_end DATETIME NOT NULL,
        file_path TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      );

      -- Client access table (for resell dashboard addon)
      CREATE TABLE IF NOT EXISTS client_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        client_email TEXT NOT NULL,
        client_name TEXT,
        password_hash TEXT NOT NULL,
        allowed_sites TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      );

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

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_sites_agency_id ON sites(agency_id);
      CREATE INDEX IF NOT EXISTS idx_monitoring_logs_site_id ON monitoring_logs(site_id);
      CREATE INDEX IF NOT EXISTS idx_monitoring_logs_checked_at ON monitoring_logs(checked_at);
      CREATE INDEX IF NOT EXISTS idx_incidents_site_id ON incidents(site_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_agency_id ON alerts(agency_id);
    `;

    db.exec(createTables, (err) => {
      if (err) {
        console.error("Error creating tables:", err);
        reject(err);
      } else {
        console.log("Database tables created successfully");
        resolve();
      }
    });
  });
}

module.exports = {
  getDatabase,
  initializeDatabase,
};
