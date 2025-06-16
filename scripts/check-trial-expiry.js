const { getDatabase } = require("../config/database");

async function checkTrialExpiry() {
  const db = getDatabase();

  try {
    console.log("🔍 Checking for expired trials...");

    // Calculate the date 15 days ago
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const expiryDate = fifteenDaysAgo.toISOString();

    console.log(`📅 Expiry threshold: ${expiryDate}`);

    // Find expired trials
    await new Promise((resolve, reject) => {
      db.all(
        `SELECT s.*, a.name, a.email 
         FROM subscriptions s 
         JOIN agencies a ON s.agency_id = a.id 
         WHERE s.status = 'trialing' 
         AND s.trial_start_date IS NOT NULL 
         AND s.trial_start_date <= ?`,
        [expiryDate],
        (err, rows) => {
          if (err) {
            console.error("Error finding expired trials:", err);
            reject(err);
            return;
          }

          if (rows.length === 0) {
            console.log("✅ No expired trials found");
            resolve();
            return;
          }

          console.log(`⚠️  Found ${rows.length} expired trial(s):`);

          rows.forEach((row) => {
            const startDate = new Date(row.trial_start_date);
            const daysSinceStart = Math.floor(
              (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            console.log(
              `   • ${row.name} (${row.email}) - Started ${daysSinceStart} days ago`
            );
          });

          // Update expired trials
          db.run(
            `UPDATE subscriptions 
             SET status = 'expired'
             WHERE status = 'trialing' 
             AND trial_start_date IS NOT NULL 
             AND trial_start_date <= ?`,
            [expiryDate],
            function (err) {
              if (err) {
                console.error("Error updating expired trials:", err);
                reject(err);
              } else {
                console.log(
                  `✅ Updated ${this.changes} trial(s) to expired status`
                );

                // Also update agency subscription status
                db.run(
                  `UPDATE agencies 
                   SET subscription_status = 'expired' 
                   WHERE id IN (
                     SELECT agency_id FROM subscriptions 
                     WHERE status = 'expired'
                   )`,
                  (err) => {
                    if (err) {
                      console.error("Error updating agency status:", err);
                      reject(err);
                    } else {
                      console.log("✅ Updated agency subscription statuses");
                      resolve();
                    }
                  }
                );
              }
            }
          );
        }
      );
    });
  } catch (error) {
    console.error("❌ Failed to check trial expiry:", error);
    throw error;
  }
}

// If running directly (not imported)
if (require.main === module) {
  checkTrialExpiry()
    .then(() => {
      console.log("\n🎉 Trial expiry check completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Trial expiry check failed:", error);
      process.exit(1);
    });
}

module.exports = { checkTrialExpiry };
