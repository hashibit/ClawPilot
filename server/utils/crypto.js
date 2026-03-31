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
 */
export function decrypt(value) {
  if (!value) return value
  const inner = value.startsWith(ENC_PREFIX) ? value.slice(ENC_PREFIX.length) : value
  const parts = inner.split(':')
  if (parts.length !== 3) throw new Error(`[crypto] Invalid ciphertext format: ${value.slice(0, 20)}`)
  const [nonceHex, tagHex, dataHex] = parts
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(nonceHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8')
}
