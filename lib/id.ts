// Compact, collision-resistant id generator. Crypto when available, fallback otherwise.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function nanoid(size = 12): string {
  let id = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    for (let i = 0; i < size; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
    return id;
  }
  for (let i = 0; i < size; i++) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return id;
}

// Deterministic-ish seed for per-element stable randomness (unused jitter hooks).
export function makeSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
