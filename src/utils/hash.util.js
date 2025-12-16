import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';

/**
 * Hash plain password
 */
export async function hashPassword(password) {
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(password, rounds);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * SHA256 hash (for tokens)
 */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Secure random token
 */
export function randomToken() {
  return randomBytes(32).toString('hex');
}
  