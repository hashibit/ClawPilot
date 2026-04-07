import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const ALGORITHM = 'aes-256-gcm'
const KEY_FILE = join(homedir(), '.clawpilot', 'server.key')
const ENC_PREFIX = 'enc:'

function loadOrCreateKey() {
  try {
    const hex = readFileSync(KEY_FILE, 'utf8').trim()
    if (hex.length === 64) return Buffer.from(hex, 'hex')
  } catch {}

  // Generate a new random 256-bit key and persist it
  const key = randomBytes(32)
  try {
    mkdirSync(join(homedir(), '.clawpilot'), { recursive: true })
    writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 })
    chmodSync(KEY_FILE, 0o600) // belt-and-suspenders for umask edge cases
  } catch (err) {
    console.error('[crypto] Failed to persist server key:', err.message)
  }
  return key
}

const KEY = loadOrCreateKey()

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns a string prefixed with 'enc:' so encrypted and plaintext values
 * are distinguishable, enabling safe migration of existing data.
 * Returns empty string as-is (no point encrypting nothing).
 *
 * Format: enc:<nonce_hex>:<tag_hex>:<data_hex>
 * This format is compatible with the Tauri/Rust implementation.
 */
export function encrypt(plaintext) {
  if (!plaintext) return plaintext
  const nonce = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENC_PREFIX}${nonce.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts a value produced by encrypt().
 *
 * Supports two formats:
 * 1. New format (enc:<nonce_hex>:<tag_hex>:<data_hex>) - from both Node.js and new Tauri
 * 2. Legacy format (<nonce_b64>:<ciphertext_b64>) - from old Tauri implementation
 *
 * @throws {Error} With code 'LEGACY_ENCRYPTION' if the data was encrypted with the old Tauri format
 *         and cannot be decrypted with the current key. This indicates the data needs to be re-encrypted.
 */
export function decrypt(value) {
  if (!value) return value

  // Try new format first: enc:<nonce_hex>:<tag_hex>:<data_hex>
  if (value.startsWith(ENC_PREFIX)) {
    const inner = value.slice(ENC_PREFIX.length)
    const parts = inner.split(':')
    if (parts.length !== 3) {
      throw new Error(`[crypto] Invalid ciphertext format: expected 3 parts, got ${parts.length}`)
    }
    const [nonceHex, tagHex, dataHex] = parts
    const nonce = Buffer.from(nonceHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const ciphertext = Buffer.from(dataHex, 'hex')

    const decipher = createDecipheriv(ALGORITHM, KEY, nonce)
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext) + decipher.final('utf8')
  }

  // Legacy format: <nonce_b64>:<ciphertext_b64> (old Tauri implementation)
  // This data was encrypted with a different key (Tauri's default key)
  // We can't decrypt it - user needs to re-enter the API key
  const colonIdx = value.indexOf(':')
  if (colonIdx === -1) {
    throw new Error(`[crypto] Invalid ciphertext format: missing ':' separator`)
  }

  // This is legacy encrypted data that we cannot decrypt with the current key
  // Throw a special error to indicate this needs re-encryption
  const err = new Error('[crypto] Legacy encrypted data: API key needs to be re-entered')
  err.code = 'LEGACY_ENCRYPTION'
  throw err
}
