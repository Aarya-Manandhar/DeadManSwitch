
const SALT_LEN = 16;
const IV_LEN = 12;
const PBKDF2_ITERS = 310_000;
const ENVELOPE_MAGIC = new Uint8Array([0x44, 0x4d, 0x53, 0x32]); // DMS2

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
    false,
    usage
  );
}

// ─── EXPORT: Encrypt file bytes with a random data key ───────────────────────
// Returns { encryptedBytes, encryptedKey }. DMS2 distinguishes this format from
// the legacy password-derived file format so existing vaults remain decryptable.
export async function encryptFile(fileBytes, password) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const dataKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );

  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, fileBytes);

  const encryptedBytes = new Uint8Array(ENVELOPE_MAGIC.length + IV_LEN + cipherBuf.byteLength);
  encryptedBytes.set(ENVELOPE_MAGIC, 0);
  encryptedBytes.set(iv, ENVELOPE_MAGIC.length);
  encryptedBytes.set(new Uint8Array(cipherBuf), ENVELOPE_MAGIC.length + IV_LEN);
  return {
    encryptedBytes,
    encryptedKey: await wrapKeyForStorage(dataKey, password),
  };
}

// ─── EXPORT: Decrypt file bytes ─────────────────────────────────────────────
export async function decryptFile(encryptedBytes, password, base64WrappedKey) {
  const isCurrentFormat = ENVELOPE_MAGIC.every((byte, index) => encryptedBytes[index] === byte);
  if (isCurrentFormat) {
    if (!base64WrappedKey) throw new Error('Wrapped data key is missing.');
    const key = await unwrapKeyFromStorage(base64WrappedKey, password);
    const ivStart = ENVELOPE_MAGIC.length;
    const iv = encryptedBytes.slice(ivStart, ivStart + IV_LEN);
    const ciphertext = encryptedBytes.slice(ivStart + IV_LEN);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new Uint8Array(plain);
  }

  // Legacy vaults encrypted the file directly with a password-derived key.
  const salt = encryptedBytes.slice(0, SALT_LEN);
  const iv = encryptedBytes.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = encryptedBytes.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(password, salt);

  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plain);
}

// ─── EXPORT: Wrap the file's AES data key with the user's password ──────────
// Returns a base64 string: [ wrapSalt | wrapIV | wrappedKeyBytes ]
// This base64 string is what gets stored in the contract's _encryptedKey field.
export async function wrapKeyForStorage(dataKey, password) {
  // 1. Export the random 256-bit data key so it can be wrapped.
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

  try {
    const { ethers } = window; // Assumes ethers is available globally or imported
    if (!ethers) return null;

    // Standard SimpleAccount initCodeHash (Change this if using a custom implementation)
    const SIMPLE_ACCOUNT_INIT_CODE_HASH = "0x949704e6aa212af365f74da0501869e5d6d45e5d398695d36e2f4736f1c4f52f";


    // or use the salt provided (usually the email hash).
    return ethers.getCreate2Address(factoryAddress, salt, SIMPLE_ACCOUNT_INIT_CODE_HASH);
  } catch (e) {
    console.warn("Manual derivation failed, using contract fallback:", e);
    return null;
  }
}
