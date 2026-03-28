const jwt = require("jsonwebtoken");
const { ClerkExpressWithAuth } = require("@clerk/clerk-sdk-node");

const requireClerkAuth = ClerkExpressWithAuth();

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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SECRET');
      if (decoded && decoded.userId && decoded.source === "mobile") {
        req.auth = { userId: decoded.userId };
        return next();
      }
    } catch {
      // Not a valid GeoMind JWT — fall through
    }
  }

  const guestId = req.headers["x-guest-id"];
  if (guestId && guestId.startsWith("guest_")) {
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
