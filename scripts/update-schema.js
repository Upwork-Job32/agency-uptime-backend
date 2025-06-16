const bcrypt = require("bcryptjs");
const { getDatabase } = require("../config/database");

async function updateSchema() {
  const db = getDatabase();

  try {
    console.log("Updating database schema...");

    // Add trial_start_date column to subscriptions table if it doesn't exist
    await new Promise((resolve, reject) => {
      db.run(
        `ALTER TABLE subscriptions ADD COLUMN trial_start_date DATETIME`,
        (err) => {
          if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding trial_start_date column:", err);
            reject(err);
          } else {
            console.log(
              "✓ Added trial_start_date column to subscriptions table"
            );
            resolve();
          }
        }
      );
    });

    // Create the test admin user with pro plan
    console.log("Creating test admin user...");
    const adminPasswordHash = await bcrypt.hash("1234567890", 10);

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO agencies (id, name, email, password_hash, brand_color, subscription_status, created_at, updated_at) 
         VALUES (999, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "Admin Test Agency",
          "admin@gmail.com",
          adminPasswordHash,
          "#3B82F6",
          "active",
          new Date().toISOString(),
          new Date().toISOString(),
        ],
        function (err) {
          if (err) {
            console.error("Error creating admin user:", err);
            reject(err);
          } else {
            console.log(
              "✓ Created admin test user (admin@gmail.com / 1234567890)"
            );
            resolve();
          }
        }
      );
    });

    // Create active pro subscription for admin user
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO subscriptions (id, agency_id, plan_type, status, current_period_start, current_period_end, created_at) 
         VALUES (999, 999, ?, ?, ?, ?, ?)`,
        [
          "basic", // Pro plan is called "basic" in the system
          "active",
          new Date().toISOString(),
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          new Date().toISOString(),
        ],
        (err) => {
          if (err) {
            console.error("Error creating admin subscription:", err);
            reject(err);
          } else {
            console.log("✓ Created active pro subscription for admin user");
            resolve();
          }
        }
      );
    });

    // Enable all addons for admin user
    const addons = ["pdf_reports", "status_pages", "resell_dashboard"];
    for (const addon of addons) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO addons (agency_id, addon_type, is_active, created_at) 
           VALUES (999, ?, ?, ?)`,
          [addon, 1, new Date().toISOString()],
          (err) => {
            if (err) {
              console.error(`Error creating ${addon} addon:`, err);
              reject(err);
            } else {
              console.log(`✓ Enabled ${addon} addon for admin user`);
              resolve();
            }
          }
        );
      });
    }

    // Create some test sites for admin user
    const testSites = [
      {
        name: "portfolio",
        url: "https://portfolio-for-upwork-1inn-enlmuhl4m-renans-projects-87f78c79.vercel.app/",
      },
      {
        name: "Portfolio",
        url: "https://portfolio-for-upwork-5mbbx6q2t-renans-projects-87f78c79.vercel.app/",
      },
      {
        name: "NFT token",
        url: "https://shopify-ecommerce-nft-frontend-6lmmgwlr3.vercel.app/",
      },
    ];

    for (const site of testSites) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR IGNORE INTO sites (agency_id, name, url, check_interval, is_active, created_at, updated_at) 
           VALUES (999, ?, ?, ?, ?, ?, ?)`,
          [
            site.name,
            site.url,
            300, // 5 minutes
            1,
            new Date().toISOString(),
            new Date().toISOString(),
          ],
          (err) => {
            if (err) {
              console.error(`Error creating site ${site.name}:`, err);
              reject(err);
            } else {
              console.log(`✓ Created test site: ${site.name}`);
              resolve();
            }
          }
        );
      });
    }

    // Update existing trial users to have trial_start_date set
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE subscriptions 
         SET trial_start_date = COALESCE(created_at, CURRENT_TIMESTAMP)
         WHERE status = 'trialing' AND trial_start_date IS NULL`,
        (err) => {
          if (err) {
            console.error("Error updating existing trial dates:", err);
            reject(err);
          } else {
            console.log("✓ Updated existing trial users with start dates");
            resolve();
          }
        }
      );
    });

    console.log("\n🎉 Database schema update completed successfully!");
    console.log("\nTest admin user created:");
    console.log("📧 Email: admin@gmail.com");
    console.log("🔑 Password: 1234567890");
    console.log("📊 Plan: Pro (with all addons enabled)");
    console.log("\nYou can now test the application with this user!");
  } catch (error) {
    console.error("❌ Failed to update database schema:", error);
  }
}

// Run the update
updateSchema()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Update failed:", error);
    process.exit(1);
  });
