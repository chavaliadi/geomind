const jwt = require("jsonwebtoken");
const { ClerkExpressWithAuth } = require("@clerk/clerk-sdk-node");

const requireClerkAuth = ClerkExpressWithAuth();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET is not set. Mobile JWT auth is disabled until it is configured.");
}

/**
 * Dual auth middleware:
 *   1. If Authorization header starts with "Bearer " and the token
 *      decodes as a GeoMind JWT  → mobile JWT path (no Clerk call)
 *   2. If X-Guest-ID is present → anonymous guest session
 *   3. Otherwise → Clerk path (web)
 */
const protect = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (token) {
    try {
      if (!JWT_SECRET) throw new Error("JWT_SECRET missing");
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.userId && decoded.source === "mobile") {
        req.auth = { userId: decoded.userId };
        return next();
      }
    } catch {
      // Not a valid GeoMind JWT — fall through
    }
  }

  const guestId = req.headers["x-guest-id"];
  if (typeof guestId === "string" && /^guest_[A-Za-z0-9_-]{8,80}$/.test(guestId)) {
    req.auth = { userId: guestId };
    return next();
  }

  // Clerk path (web)
  requireClerkAuth(req, res, (err) => {
    if (err) return res.status(401).json({ error: "Auth failed" });
    if (!req.auth || !req.auth.userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }
    next();
  });
};

module.exports = { protect };
