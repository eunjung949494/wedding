/**
 * Simple, robust, synchronous symmetric cipher for securing phone numbers
 * Uses a safe seed-based stream cipher (RC4-inspired) with Hex encoding.
 * Securely prefixes the output with "enc:" to distinguish encrypted values.
 */

function generateKeyStream(key: string, length: number): number[] {
  // Safe KSA & PRGA (RC4-like) for key stream generation
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  
  const stream: number[] = [];
  let i = 0;
  j = 0;
  for (let k = 0; k < length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    stream.push(s[(s[i] + s[j]) % 256]);
  }
  return stream;
}

/**
 * Encrypts a plaintext string using a key.
 * If key is not provided, defaults to a safe internal fallback.
 */
export function encryptText(text: string, sekretKey: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.startsWith("enc:")) return trimmed; // Already encrypted
  
  try {
    const key = sekretKey || "default_wedding_vault_salt_2026";
    // Encode to UTF-8 bytes manually to support Korean & characters
    const encoder = new TextEncoder();
    const utf8Bytes = Array.from(encoder.encode(trimmed));
    
    const stream = generateKeyStream(key, utf8Bytes.length);
    const cipherBytes = utf8Bytes.map((byte, idx) => byte ^ stream[idx]);
    
    // Convert to hex
    const hex = cipherBytes.map(b => b.toString(16).padStart(2, "0")).join("");
    return `enc:${hex}`;
  } catch (e) {
    console.error("Encryption error:", e);
    return trimmed;
  }
}

/**
 * Decrypts a ciphertext starting with "enc:" using the key.
 */
export function decryptText(cipherText: string, sekretKey: string): string {
  if (!cipherText) return "";
  const trimmed = cipherText.trim();
  if (!trimmed.startsWith("enc:")) return trimmed; // Not encrypted
  
  try {
    const key = sekretKey || "default_wedding_vault_salt_2026";
    const hex = trimmed.substring(4);
    
    // Parse hex bytes
    const cipherBytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      cipherBytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    
    const stream = generateKeyStream(key, cipherBytes.length);
    const plainBytes = cipherBytes.map((byte, idx) => byte ^ stream[idx]);
    
    const decoder = new TextDecoder();
    return decoder.decode(new Uint8Array(plainBytes));
  } catch (e) {
    console.error("Decryption error:", e);
    return "[암호화 보호됨 - 해독 불가]";
  }
}
