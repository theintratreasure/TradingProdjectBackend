import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL = '12h';
const ACCOUNT_JWT_SECRET = process.env.ACCOUNT_JWT_SECRET;
const ACCOUNT_JWT_EXPIRE = "15m";

console.log("JWT_SECRET:", process.env.JWT_SECRET);
console.log("ACCOUNT_JWT_SECRET:", process.env.ACCOUNT_JWT_SECRET);

export function signAccessToken(user) {
  return jwt.sign(
    {
      uid: user._id,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}


export function signAccountToken(payload) {
  return jwt.sign(payload, ACCOUNT_JWT_SECRET, {
    expiresIn: ACCOUNT_JWT_EXPIRE,
  });
}

export function verifyAccountToken(token) {
  return jwt.verify(token, ACCOUNT_JWT_SECRET);
}
