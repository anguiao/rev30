import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const algorithm = 'scrypt'
const keyLength = 64

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url')
  const hash = (await scryptAsync(password, salt, keyLength)) as Buffer

  return `${algorithm}$${salt}$${hash.toString('base64url')}`
}

export function generateTemporaryPassword() {
  return randomBytes(10).toString('base64url')
}

export async function verifyPassword(password: string, storedHash: string) {
  const [storedAlgorithm, salt, encodedHash] = storedHash.split('$')

  if (storedAlgorithm !== algorithm || !salt || !encodedHash) {
    return false
  }

  const expected = Buffer.from(encodedHash, 'base64url')
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
