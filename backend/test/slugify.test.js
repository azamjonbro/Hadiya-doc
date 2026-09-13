// A path titled in Cyrillic used to save with an empty slug — and, the
// model requiring one, not save at all (500 on POST /paths, 2026-09-13).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slugify } from '../src/utils/slugify.js'

test('Cyrillic titles produce a readable Latin slug', () => {
  assert.equal(slugify('Йўналиш 1'), 'yonalish-1')
  assert.equal(slugify('Траектория'), 'traektoriya')
  assert.equal(slugify('Ҳуқуқ ва ғоя'), 'huquq-va-goya')
})

test('Latin titles are unchanged', () => {
  assert.equal(slugify("Yo'nalish  #2"), 'yo-nalish-2')
  assert.equal(slugify('  Sales Onboarding '), 'sales-onboarding')
})
