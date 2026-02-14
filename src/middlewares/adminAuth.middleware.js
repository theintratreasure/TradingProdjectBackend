import { authMiddleware } from "./auth.middleware.js";

function checkAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  if (req.user.userType !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }

  return next();
}

export function adminAuth(req, res, next) {
  try {
    if (req.user) {
      return checkAdmin(req, res, next);
    }

    return authMiddleware(req, res, () => checkAdmin(req, res, next));
  } catch {
    return res.status(500).json({
      success: false,
      message: "Authorization failed",
    });
  }
}
