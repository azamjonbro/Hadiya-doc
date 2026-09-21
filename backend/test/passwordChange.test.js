// Passwords and names, 2026-09-21.
//
//   - PUT /auth/password: the current password is checked, the new one
//     works, every *other* session is ended and the one making the change
//     stays — or, without a refresh cookie, all of them go and the API
//     says so.
//   - A password set by an admin, or by a reset link, clears the lockout
//     that the lost password's guesses built up: the next login with the
//     new one must work, not wait out fifteen minutes.
//   - Names arrive in whatever case the form got and are stored the way a
//     document writes them.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'

import { connectDatabase } from '../src/config/db.js'
import { User } from '../src/models/user.model.js'
import { Role } from '../src/models/role.model.js'
import { Session } from '../src/models/session.model.js'
import { AuditLog } from '../src/models/auditLog.model.js'
import { hashPassword, verifyPassword } from '../src/utils/hash.js'
import { authService } from '../src/services/auth/auth.service.js'
import { userService } from '../src/services/users/user.service.js'
import { createUserSchema, updateUserSchema } from '../src/validators/user.validator.js'
import { redisConnection } from '../src/config/redis.js'

const stamp = String(Date.now()).slice(-9)
const PASSWORD = 'Before123!'
const meta = { ip: '127.0.0.1', userAgent: 'password-change-test' }

let user
let actor
let superAdmin
const userIds = []

describe('own password, admin-set password, and name case', () => {
  before(async () => {
    await connectDatabase()
    const role = await Role.findOne({ name: 'EMPLOYEE' })
    assert.ok(role, 'EMPLOYEE role is missing — boot the server once')
    user = await User.create({
      firstName: 'Parol',
      lastName: 'Sinov',
      fullName: 'Sinov Parol',
      jshshir: `78${stamp}001`,
      passwordHash: await hashPassword(PASSWORD),
      roleId: role._id,
      department: 'IT',
      branch: `pw-${stamp}`,
    })
    userIds.push(user._id)
    actor = { id: user._id.toString() }
    superAdmin = await User.findOne({ jshshir: process.env.SUPERADMIN_JSHSHIR ?? '00000000000001' })
    assert.ok(superAdmin, 'SUPERADMIN is missing — boot the server once')
  })

  after(async () => {
    await Session.deleteMany({ userId: { $in: userIds } })
    await AuditLog.deleteMany({ entityId: { $in: userIds.map(String) } })
    await User.deleteMany({ _id: { $in: userIds } })
    await mongoose.connection.close()
    redisConnection.disconnect()
  })

  describe('PUT /auth/password', () => {
    test('refuses a wrong current password and changes nothing', async () => {
      await assert.rejects(
        authService.changePassword(actor, { currentPassword: 'nope', newPassword: 'After456!' }, null),
        (error) => error.code === 'CURRENT_PASSWORD_WRONG'
      )
      const fresh = await User.findById(user._id)
      assert.ok(await verifyPassword(fresh.passwordHash, PASSWORD))
    })

    test('keeps the session it was made from and ends the others', async () => {
      const laptop = await authService.login({ identifier: user.jshshir, password: PASSWORD }, meta)
      const phone = await authService.login({ identifier: user.jshshir, password: PASSWORD }, { ...meta, userAgent: 'phone' })

      const result = await authService.changePassword(
        actor,
        { currentPassword: PASSWORD, newPassword: 'After456!' },
        laptop.refreshToken
      )
      assert.equal(result.signedOut, false)
      assert.equal(result.sessionsRevoked, 1)

      // The laptop still refreshes; the phone is out.
      await authService.refresh(laptop.refreshToken, meta)
      await assert.rejects(authService.refresh(phone.refreshToken, meta))

      const again = await authService.login({ identifier: user.jshshir, password: 'After456!' }, meta)
      assert.ok(again.accessToken)
      await assert.rejects(authService.login({ identifier: user.jshshir, password: PASSWORD }, meta))
    })

    test('with no refresh cookie ends every session and says so', async () => {
      await authService.login({ identifier: user.jshshir, password: 'After456!' }, meta)
      const result = await authService.changePassword(actor, { currentPassword: 'After456!', newPassword: PASSWORD }, null)
      assert.equal(result.signedOut, true)
      assert.ok(result.sessionsRevoked >= 1)
      assert.equal(await Session.countDocuments({ userId: user._id, revoked: false }), 0)
    })
  })

  describe('a new password lifts the lockout', () => {
    test('set by an admin', async () => {
      await User.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: 3, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } }
      )
      await assert.rejects(
        authService.login({ identifier: user.jshshir, password: PASSWORD }, meta),
        (error) => error.code === 'ACCOUNT_LOCKED'
      )

      await userService.update({ id: superAdmin._id.toString(), roleName: 'SUPERADMIN' }, user._id.toString(), {
        password: 'Admin789!',
      })
      const result = await authService.login({ identifier: user.jshshir, password: 'Admin789!' }, meta)
      assert.ok(result.accessToken)
      const fresh = await User.findById(user._id)
      assert.equal(fresh.failedLoginAttempts, 0)
      assert.equal(fresh.lockedUntil, null)
    })
  })

  describe('names are stored capitalised', () => {
    test('on create', () => {
      const parsed = createUserSchema.parse({
        firstName: 'doston',
        lastName: 'XALILOV',
        patronymic: "o'tkir-xon o'g'li",
        jshshir: `78${stamp}002`,
        password: 'Secret12',
        roleName: 'EMPLOYEE',
      })
      assert.equal(parsed.firstName, 'Doston')
      assert.equal(parsed.lastName, 'Xalilov')
      assert.equal(parsed.patronymic, "O'tkir-Xon O'g'li")
    })

    test('on update, and Cyrillic too', () => {
      const parsed = updateUserSchema.parse({ firstName: '  иван ', lastName: 'ПЕТРОВ', patronymic: '' })
      assert.equal(parsed.firstName, 'Иван')
      assert.equal(parsed.lastName, 'Петров')
      assert.equal(parsed.patronymic, '')
    })

    test('a blank required name is still refused', () => {
      assert.throws(() => updateUserSchema.parse({ firstName: '   ' }))
    })
  })
})
