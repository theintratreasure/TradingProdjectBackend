import { verifyAccountToken } from "../utils/jwt.util.js";

export function accountAuthMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = header.split(" ")[1];
    const decoded = verifyAccountToken(token);

    if (
      !decoded.accountId ||
      !decoded.userId ||
      !decoded.sessionType
    ) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    req.account = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
