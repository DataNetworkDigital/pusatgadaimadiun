export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`pgm-salt::${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin, hash) {
  const computed = await hashPin(pin);
  return computed === hash;
}
