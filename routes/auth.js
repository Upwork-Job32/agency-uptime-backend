const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { getDatabase } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Register agency
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Agency name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password } = req.body;
      const db = getDatabase();

      // Check if agency already exists
      db.get(
        "SELECT id FROM agencies WHERE email = ?",
        [email],
        async (err, row) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }

          if (row) {
            return res.status(400).json({ error: "Agency already exists" });
          }

          // Hash password
          const passwordHash = await bcrypt.hash(password, 10);

          // Create agency
          db.run(
            "INSERT INTO agencies (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash],
            function (err) {
              if (err) {
                return res
                  .status(500)
                  .json({ error: "Failed to create agency" });
              }

              // Create default subscription with trial period
              const now = new Date();
              const trialEndDate = new Date();
              trialEndDate.setDate(trialEndDate.getDate() + 15); // 15-day trial

              db.run(
                "INSERT INTO subscriptions (agency_id, plan_type, status, trial_start_date, current_period_start, current_period_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                  this.lastID,
                  "trial",
                  "trialing",
                  now.toISOString(),
                  now.toISOString(),
                  trialEndDate.toISOString(),
                  now.toISOString(),
                ]
              );

              // Generate JWT token
              const token = jwt.sign(
                { agencyId: this.lastID, email },
                process.env.JWT_SECRET || "your-secret-key",
                {
                  expiresIn: "24h",
                }
              );

              res.status(201).json({
                message: "Agency created successfully",
                token,
                agency: {
                  id: this.lastID,
                  name,
                  email,
                  subscription_status: "trial",
                },
              });
            }
          );
        }
      );
    } catch (error) {
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      const db = getDatabase();

      db.get(
        "SELECT * FROM agencies WHERE email = ?",
        [email],
        async (err, agency) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }

          if (!agency) {
            return res.status(401).json({ error: "Invalid credentials" });
          }

          // Check password
          const isValidPassword = await bcrypt.compare(
            password,
            agency.password_hash
          );
          if (!isValidPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
          }

          // Generate JWT token
          const token = jwt.sign(
            { agencyId: agency.id, email: agency.email },
            process.env.JWT_SECRET || "your-secret-key",
            { expiresIn: "24h" }
          );

          res.json({
            message: "Login successful",
            token,
            agency: {
              id: agency.id,
              name: agency.name,
              email: agency.email,
              logo_url: agency.logo_url,
              brand_color: agency.brand_color,
              custom_domain: agency.custom_domain,
              subscription_status: agency.subscription_status,
            },
          });
        }
      );
    } catch (error) {
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Get current agency profile
router.get("/profile", authenticateToken, (req, res) => {
  const db = getDatabase();

  db.get(
    "SELECT id, name, email, logo_url, brand_color, custom_domain, subscription_status FROM agencies WHERE id = ?",
    [req.agency.agencyId],
    (err, agency) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      if (!agency) {
        return res.status(404).json({ error: "Agency not found" });
      }

      res.json({ agency });
    }
  );
});

// Update agency profile
router.put(
  "/profile",
  authenticateToken,
  [
    body("name").optional().notEmpty().withMessage("Name cannot be empty"),
    body("brand_color")
      .optional()
      .matches(/^#[0-9A-F]{6}$/i)
      .withMessage("Invalid color format"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, brand_color, custom_domain, logo_url } = req.body;
    const db = getDatabase();

    // Check if user is trying to update white label settings
    const hasWhiteLabelSettings = brand_color || custom_domain || logo_url;

    if (hasWhiteLabelSettings) {
      // Check subscription status for white label features
      db.get(
        "SELECT * FROM subscriptions WHERE agency_id = ? AND status = 'active' AND plan_type = 'basic'",
        [req.agency.agencyId],
        (err, subscription) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }

          if (!subscription) {
            return res.status(403).json({
              error: "White label features require Pro subscription",
              upgrade_required: true,
            });
          }

          // User has Pro subscription, proceed with update
          performProfileUpdate();
        }
      );
    } else {
      // No white label settings, proceed normally
      performProfileUpdate();
    }

    function performProfileUpdate() {
      const updates = [];
      const values = [];

      if (name) {
        updates.push("name = ?");
        values.push(name);
      }
      if (brand_color) {
        updates.push("brand_color = ?");
        values.push(brand_color);
      }
      if (custom_domain !== undefined) {
        updates.push("custom_domain = ?");
        values.push(custom_domain);
      }
      if (logo_url !== undefined) {
        updates.push("logo_url = ?");
        values.push(logo_url);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(req.agency.agencyId);

      db.run(
        `UPDATE agencies SET ${updates.join(", ")} WHERE id = ?`,
        values,
        (err) => {
          if (err) {
            return res.status(500).json({ error: "Failed to update profile" });
          }

          res.json({ message: "Profile updated successfully" });
        }
      );
    }
  }
);

module.exports = router;
