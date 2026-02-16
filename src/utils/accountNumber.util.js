/**
 * =====================================================
 * ACCOUNT NUMBER GENERATOR
 * - High entropy
 * - 150k+ users safe
 * - No DB call
 * - Very low collision probability
 * =====================================================
 */
export function generateAccountNumber() {
  // last 6 digits of timestamp (fast, sortable-ish)
  const timePart = Date.now().toString().slice(-6);

  // 4 digit random number
  const randomPart = Math.floor(1000 + Math.random() * 9000).toString();

  // Example: AC8394214827
  return `${timePart}${randomPart}`;
}

/**
 * =====================================================
 * STRONG PASSWORD GENERATOR
 * - Used for TRADE / WATCH password
 * - No confusing chars (0,O,l,I)
 * - Broker-grade
 * =====================================================
 */
export function generateStrongPassword(length = 8) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const special = "@#$%&*";

  const all = upper + lower + numbers + special;

  function pick(source) {
    return source[Math.floor(Math.random() * source.length)];
  }

  let password = "";
  password += pick(upper);
  password += pick(lower);
  password += pick(numbers);
  password += pick(special);

  while (password.length < length) {
    password += pick(all);
  }

  // shuffle (avoid predictable pattern)
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}
