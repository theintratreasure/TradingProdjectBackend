import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL = '12h';

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
