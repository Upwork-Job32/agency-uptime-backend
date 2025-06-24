const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "your-secret-key",
    (err, agency) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return res.status(403).json({
            error: "Token expired",
            code: "TOKEN_EXPIRED",
            expiredAt: err.expiredAt,
          });
        } else if (err.name === "JsonWebTokenError") {
          return res.status(403).json({
            error: "Invalid token",
            code: "INVALID_TOKEN",
          });
        } else {
          return res.status(403).json({
            error: "Token verification failed",
            code: "TOKEN_VERIFICATION_FAILED",
          });
        }
      }

      req.agency = agency;
      next();
    }
  );
}

module.exports = {
  authenticateToken,
};
