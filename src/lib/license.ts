/**
 * BuzzNa D74 - Offline License Key Validator & Generator
 * Completely offline cryptographic simulation for air-gapped retail terminals.
 */

/**
 * BuzzNa D74 - Offline License Key Validator & Generator
 * Completely offline cryptographic simulation for air-gapped retail terminals.
 */

const SALT_1 = "BUZZNA_OFFLINE_SECURE_SALT_2026_D74_KEY_8829";
const SALT_2 = "AIR_GAPPED_MUNICIPAL_TERMINAL_VERIFIER_1109";

/**
 * Generate a deterministic high-entropy segment of exactly 5 alphanumeric uppercase characters.
 */
function hashToSegment(input: string, salt: string, multiplier: number): string {
  const combined = input + salt;
  let h1 = 0x811c9dc5;
  let h2 = 0x12345678;
  
  for (let i = 0; i < combined.length; i++) {
    h1 = Math.imul(h1 ^ combined.charCodeAt(i), multiplier);
    h2 = Math.imul(h2 ^ combined.charCodeAt(i), 0x5bd1e995);
  }
  
  // Combine both hashes
  const combinedHash = Math.abs(h1 ^ h2);
  const code = combinedHash.toString(36).toUpperCase();
  const pad = "KJZ74BZN99OFFLINEPROSYSTEM";
  
  return (code + pad).substring(0, 5);
}

/**
 * Generate a deterministic offline activation key for a given business legal name.
 * Produces a highly secure, 5-segment 25-character premium key to prevent guessing.
 * Format: BZN74-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
 */
export function generateOfflineKey(legalName: string): string {
  const clean = legalName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (!clean) return 'BZN74-ERROR-EMPTY-BUSINESS-NAME-PROVIDED';

  // Segment 1: Encodes base business name using SALT_1
  const s1 = hashToSegment(clean, SALT_1, 0x5bd1e995);
  
  // Segment 2: Encodes base business name using SALT_2
  const s2 = hashToSegment(clean, SALT_2, 0x15715433);
  
  // Segment 3: Length-tied verification block
  const lengthSalt = `len:${clean.length}:${clean.charAt(0)}:${clean.charAt(clean.length - 1)}`;
  const s3 = hashToSegment(lengthSalt, SALT_1, 0x241577);
  
  // Segment 4: Checksum of segments 1, 2, and 3
  const s4 = hashToSegment(s1 + s2 + s3, SALT_2, 0x9e3779b9);
  
  // Segment 5: Business-owner vertical tier lock signature
  const tierSalt = `enterprise:annual:d74:buzzna`;
  const s5 = hashToSegment(clean + tierSalt, SALT_1 + SALT_2, 0x11091988);

  return `BZN74-${s1}-${s2}-${s3}-${s4}-${s5}`;
}

/**
 * Validates whether an offline activation key matches the given legal business name.
 */
export function validateOfflineKey(legalName: string, key: string): boolean {
  if (!legalName || !key) return false;
  const expectedKey = generateOfflineKey(legalName);
  return key.trim().toUpperCase() === expectedKey.trim().toUpperCase();
}

