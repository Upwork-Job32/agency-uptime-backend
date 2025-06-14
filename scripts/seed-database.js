const bcrypt = require("bcryptjs")
const { getDatabase } = require("../config/database")

async function seedDatabase() {
  const db = getDatabase()

  try {
    // Create a demo agency
    const passwordHash = await bcrypt.hash("demo123", 10)

    db.run(
      "INSERT OR IGNORE INTO agencies (name, email, password_hash, brand_color, custom_domain) VALUES (?, ?, ?, ?, ?)",
      ["Demo Agency", "demo@agencyuptime.com", passwordHash, "#3B82F6", "demo.agencyuptime.com"],
      function (err) {
        if (err) {
          console.error("Error creating demo agency:", err)
          return
        }

        const agencyId = this.lastID || 1

        // Create subscription
        db.run("INSERT OR IGNORE INTO subscriptions (agency_id, plan_type, status) VALUES (?, ?, ?)", [
          agencyId,
          "basic",
          "active",
        ])

        // Create demo sites
        const demoSites = [
          { name: "Google", url: "https://google.com" },
          { name: "GitHub", url: "https://github.com" },
          { name: "Stack Overflow", url: "https://stackoverflow.com" },
        ]

        demoSites.forEach((site) => {
          db.run(
            "INSERT OR IGNORE INTO sites (agency_id, name, url, check_interval, is_active) VALUES (?, ?, ?, ?, ?)",
            [agencyId, site.name, site.url, 300, 1],
          )
        })

        // Enable all addons for demo
        const addons = ["pdf_reports", "status_pages", "resell_dashboard"]
        addons.forEach((addon) => {
          db.run("INSERT OR IGNORE INTO addons (agency_id, addon_type, is_active) VALUES (?, ?, ?)", [
            agencyId,
            addon,
            1,
          ])
        })

        console.log("Demo data seeded successfully")
        console.log("Demo login: demo@agencyuptime.com / demo123")
      },
    )
  } catch (error) {
    console.error("Error seeding database:", error)
  }
}

seedDatabase()
