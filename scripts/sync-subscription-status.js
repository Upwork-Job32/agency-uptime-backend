const { getDatabase } = require("../config/database");

async function syncSubscriptionStatus() {
  const db = getDatabase();

  try {
    console.log("🔄 Synchronizing subscription statuses...");

    // Get all agencies with their subscription info
    await new Promise((resolve, reject) => {
      db.all(
        `SELECT a.id, a.name, a.email, a.subscription_status as agency_status,
         s.plan_type, s.status as subscription_status, s.stripe_subscription_id
         FROM agencies a 
         LEFT JOIN subscriptions s ON a.id = s.agency_id`,
        [],
        (err, rows) => {
          if (err) {
            console.error("Error fetching agencies and subscriptions:", err);
            reject(err);
            return;
          }

          if (rows.length === 0) {
            console.log("✅ No agencies found");
            resolve();
            return;
          }

          console.log(`📋 Found ${rows.length} agencies to check:`);

          let updatedCount = 0;
          let processedCount = 0;
          const agenciesToUpdate = [];

          rows.forEach((row) => {
            // Determine the correct subscription status
            let correctStatus = "trial";

            if (row.subscription_status) {
              if (
                row.subscription_status === "active" &&
                row.plan_type === "basic"
              ) {
                correctStatus = "active"; // This is Pro
              } else if (row.subscription_status === "trialing") {
                correctStatus = "trial";
              } else {
                correctStatus = row.subscription_status;
              }
            }

            console.log(
              `   • ${row.name} (${row.email}): Agency=${row.agency_status}, Subscription=${row.subscription_status}/${row.plan_type} → ${correctStatus}`
            );

            // Update if they differ
            if (row.agency_status !== correctStatus) {
              agenciesToUpdate.push({ ...row, correctStatus });
            } else {
              console.log(`     ✓ Already correct`);
            }
          });

          // If no updates needed
          if (agenciesToUpdate.length === 0) {
            console.log(
              "\n✅ All agencies already have correct subscription status"
            );
            resolve();
            return;
          }

          // Process updates
          agenciesToUpdate.forEach((row) => {
            db.run(
              "UPDATE agencies SET subscription_status = ? WHERE id = ?",
              [row.correctStatus, row.id],
              function (err) {
                processedCount++;

                if (err) {
                  console.error(`     ❌ Failed to update ${row.name}:`, err);
                } else {
                  updatedCount++;
                  console.log(
                    `     ✅ Updated ${row.name} to "${row.correctStatus}"`
                  );
                }

                // Check if all agencies processed
                if (processedCount === agenciesToUpdate.length) {
                  console.log(
                    `\n🎉 Synchronization complete! Updated ${updatedCount} agencies.`
                  );
                  resolve();
                }
              }
            );
          });
        }
      );
    });
  } catch (error) {
    console.error("❌ Failed to sync subscription statuses:", error);
    throw error;
  }
}

// If running directly (not imported)
if (require.main === module) {
  syncSubscriptionStatus()
    .then(() => {
      console.log("\n🎉 Subscription status sync completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Subscription status sync failed:", error);
      process.exit(1);
    });
}

module.exports = { syncSubscriptionStatus };
