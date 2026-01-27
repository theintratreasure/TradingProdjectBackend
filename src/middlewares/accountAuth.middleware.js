import { verifyAccountToken } from "../utils/jwt.util.js";
import Account from "../models/Account.model.js";

export function accountAuthMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = header.split(" ")[1];
    const decoded = verifyAccountToken(token);

    req.account = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function tradeOnly(req, res, next) {
  if (req.account.sessionType !== "TRADE") {
    return res.status(403).json({ message: "Trade permission required" });
  }
  next();
}
