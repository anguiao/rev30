import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../../src/modules/auth/password'

describe('auth password helpers', () => {
  it('hashes passwords without storing plaintext and verifies matching passwords', async () => {
    const hash = await hashPassword('secret-password')

    expect(hash).not.toBe('secret-password')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('secret-password', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('rejects malformed stored password hashes', async () => {
    expect(await verifyPassword('secret-password', 'scrypt$disabled$disabled')).toBe(false)
  })
})
