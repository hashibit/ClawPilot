import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_ENV = process.env.CLAWPILOT_CRYPTO_KEY
const KEY = createHash('sha256').update(KEY_ENV ?? 'clawpilot-dev-secret').digest()

/**
 * 使用 AES-256-GCM 加密字符串，每次生成随机 nonce，确保密文不同。
 * 返回格式：`<nonce_hex>:<tag_hex>:<ciphertext_hex>`
 */
export function encrypt(plaintext) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${nonce.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * 解密 encrypt() 产生的密文。失败时抛出错误。
 */
export function decrypt(ciphertext) {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [nonceHex, tagHex, dataHex] = parts
  const nonce = Buffer.from(nonceHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, KEY, nonce)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}
