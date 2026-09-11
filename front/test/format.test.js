import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatHms } from '../src/utils/format.js'

test('formatHms is fixed-width hh:mm:ss', () => {
  assert.equal(formatHms(0), '00:00:00')
  assert.equal(formatHms(null), '00:00:00')
  assert.equal(formatHms(59.6), '00:01:00')
  assert.equal(formatHms(630), '00:10:30')
  assert.equal(formatHms(3600 * 27 + 61), '27:01:01')
  assert.equal(formatHms(-5), '00:00:00')
})
