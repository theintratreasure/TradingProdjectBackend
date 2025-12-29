export function generateAccountNumber() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `AC${timestamp}${random}`;
}
