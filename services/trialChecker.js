const { checkTrialExpiry } = require("../scripts/check-trial-expiry");

class TrialCheckerService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    this.intervalId = null;
  }

  start() {
    if (this.isRunning) {
      console.log("🔄 Trial checker service is already running");
      return;
    }

    console.log("🚀 Starting trial checker service...");
    this.isRunning = true;

    // Run an initial check
    this.performCheck();

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.performCheck();
    }, this.checkInterval);

    console.log(`✅ Trial checker service started (checking every 24 hours)`);
  }

  stop() {
    if (!this.isRunning) {
      console.log("⏹️  Trial checker service is not running");
      return;
    }

    console.log("⏹️  Stopping trial checker service...");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log("✅ Trial checker service stopped");
  }

  async performCheck() {
    try {
      console.log("\n🔍 Running scheduled trial expiry check...");
      await checkTrialExpiry();
      console.log("✅ Scheduled trial expiry check completed\n");
    } catch (error) {
      console.error("❌ Error during scheduled trial check:", error);
    }
  }

  // Method to manually trigger a check
  async triggerCheck() {
    console.log("🔍 Manual trial expiry check triggered...");
    await this.performCheck();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      nextCheck: this.intervalId
        ? new Date(Date.now() + this.checkInterval)
        : null,
    };
  }
}

// Create a singleton instance
const trialCheckerService = new TrialCheckerService();

module.exports = trialCheckerService;
