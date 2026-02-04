// AES-256-GCM Encryption for PII Data
// deno-lint-ignore-file no-explicit-any

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 128; // 128 bits authentication tag

// Convert base64 key to CryptoKey
async function getKey(base64Key: string): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
  
  if (keyData.length !== 32) {
    throw new Error(`Invalid key length: ${keyData.length}. Expected 32 bytes for AES-256.`);
  }
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// Generate random IV
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

// Encrypt a string with AES-256-GCM
export async function encryptAES256(
  plaintext: string,
  base64Key: string
): Promise<{ encrypted: string; iv: string }> {
  const key = await getKey(base64Key);
  const ivBytes = generateIV();
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: ivBytes,
      tagLength: TAG_LENGTH,
    } as any,
    key,
    data
  );
  
  // Convert to base64 for storage
  const encrypted = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivBase64 = btoa(String.fromCharCode(...ivBytes));
  
  return { encrypted, iv: ivBase64 };
}

// Decrypt a string with AES-256-GCM
export async function decryptAES256(
  encryptedBase64: string,
  ivBase64: string,
  base64Key: string
): Promise<string> {
  const key = await getKey(base64Key);
  
  // Convert from base64
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH,
    } as any,
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Generate a new encryption key (for initial setup)
export function generateEncryptionKey(): string {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...keyBytes));
}

// Validate key format
export function isValidKey(base64Key: string): boolean {
  try {
    const keyData = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
    return keyData.length === 32;
  } catch {
    return false;
  }
}
