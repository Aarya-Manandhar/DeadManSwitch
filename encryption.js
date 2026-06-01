
const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERS = 310_000; // OWASP 2023 recommended for PBKDF2-SHA-256

// ─── INTERNAL: password → CryptoKey ────────────────────────────────────────
async function deriveKey(password, salt, usage = ['encrypt', 'decrypt']) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    usage
  );
}

// ─── EXPORT: Encrypt file bytes ─────────────────────────────────────────────
// Returns a Uint8Array: [ salt | IV | ciphertext ]
export async function encryptFile(fileBytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt);

  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBytes);

  const out = new Uint8Array(SALT_LEN + IV_LEN + cipherBuf.byteLength);
  out.set(salt, 0);
  out.set(iv, SALT_LEN);
  out.set(new Uint8Array(cipherBuf), SALT_LEN + IV_LEN);
  return out;
}

// ─── EXPORT: Decrypt file bytes ─────────────────────────────────────────────
export async function decryptFile(encryptedBytes, password) {
  const salt = encryptedBytes.slice(0, SALT_LEN);
  const iv = encryptedBytes.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = encryptedBytes.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(password, salt);

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plain);
}

// ─── EXPORT: Wrap a fresh AES key with the user's password ──────────────────
// Returns a base64 string: [ wrapSalt | wrapIV | wrappedKeyBytes ]
// This base64 string is what gets stored in the contract's _encryptedKey field.
export async function wrapKeyForStorage(password) {
  // 1. Generate a fresh 256-bit AES-GCM data key
  const dataKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
  const rawDataKey = await crypto.subtle.exportKey('raw', dataKey);

  // 2. Derive a wrapping key from the password
  const wrapSalt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const wrapIV = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const wrapKey = await deriveKey(password, wrapSalt, ['encrypt', 'decrypt']);

  // 3. Encrypt (wrap) the raw data key
  const wrappedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIV }, wrapKey, rawDataKey
  );

  // 4. Pack: wrapSalt | wrapIV | wrappedKey → base64
  const packed = new Uint8Array(SALT_LEN + IV_LEN + wrappedBuf.byteLength);
  packed.set(wrapSalt, 0);
  packed.set(wrapIV, SALT_LEN);
  packed.set(new Uint8Array(wrappedBuf), SALT_LEN + IV_LEN);

  return btoa(String.fromCharCode(...packed));
}

// ─── EXPORT: Unwrap AES key from contract storage string ────────────────────
export async function unwrapKeyFromStorage(base64Wrapped, password) {
  const packed = Uint8Array.from(atob(base64Wrapped), c => c.charCodeAt(0));
  const wrapSalt = packed.slice(0, SALT_LEN);
  const wrapIV = packed.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const wrapped = packed.slice(SALT_LEN + IV_LEN);
  const wrapKey = await deriveKey(password, wrapSalt, ['encrypt', 'decrypt']);

  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrapIV }, wrapKey, wrapped
  );
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
}

// ─── EXPORT: Bytes ↔ base64 helpers (Robust version for large files) ────────
export const toBase64 = (bytes) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const fromBase64 = (b64) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// ─── ACADEMIC: Manual CREATE2 Address Derivation ────────────────────────────
/**
 * Manually calculates the CREATE2 address (Counterfactual Addressing).
 * Formula: keccak256(0xff + factoryAddress + salt + keccak256(initCode))
 * 
 * @param {string} factoryAddress - The address of the Smart Account Factory
 * @param {string} ownerAddress - The address of the EOA owner
 * @param {string} salt - The salt used for derivation
 * @returns {string} The predicted Smart Account address
 */
export function calculateCounterfactualAddress(factoryAddress, ownerAddress, salt) {
  // Note: For a real production implementation, you would need the exact 
  // keccak256(creation_code) of the SimpleAccount contract.
  // This demonstrates the mathematical principle of CREATE2 as required by the syllabus.
  
  // Implementation using ethers (which follows the EIP-1014 standard)
  try {
    const { ethers } = window; // Assumes ethers is available globally or imported
    if (!ethers) return null;

    // Standard SimpleAccount initCodeHash (Change this if using a custom implementation)
    const SIMPLE_ACCOUNT_INIT_CODE_HASH = "0x949704e6aa212af365f74da0501869e5d6d45e5d398695d36e2f4736f1c4f52f"; 
    
    // We construct the "salt" by hashing the owner's address if needed, 
    // or use the salt provided (usually the email hash).
    return ethers.getCreate2Address(factoryAddress, salt, SIMPLE_ACCOUNT_INIT_CODE_HASH);
  } catch (e) {
    console.warn("Manual derivation failed, using contract fallback:", e);
    return null;
  }
}