// 9.2 — the block editor's own rules.
//
// The editor autosaves, which changes what a bug costs. A form with a save
// button fails once, in front of the person who pressed it; a form that
// writes every second fails silently and repeatedly, and the author finds
// out when they reopen the lesson. So the three rules that decide what gets
// sent are tested here rather than read off a template:
//
//   - which fields a type has (the server's schema is a discriminated
//     union: an extra field is a 400, not a shrug)
//   - when a block is finished enough to send at all
//   - how a saved block's id finds its way back, since reading progress
//     points at those ids
//
// The first front-end test file in the repo. `node --test` needs no bundler
// for a module with no Vue imports, which is exactly why this logic does not
// live in the component.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOCK_TYPES,
  adoptIds,
  emptyBlock,
  isComplete,
  serializeBlock,
} from '../src/utils/lessonBlocks.js'

describe('lesson blocks (editor)', () => {
  test('there are twelve types and each one has a blank shape', () => {
    assert.equal(BLOCK_TYPES.length, 12)
    for (const { type } of BLOCK_TYPES) {
      const block = emptyBlock(type, { key: 'k1' })
      assert.equal(block.type, type, `${type} keeps its type`)
      assert.equal(block._key, 'k1', `${type} carries the local key`)
    }
  })

  test('a new VIDEO or FILE block arrives with the only option chosen', () => {
    // A picker with one entry that starts empty is a block the author has to
    // touch for no reason — and one that fails isComplete until they do.
    assert.equal(emptyBlock('VIDEO', { key: 'k', videoId: 'v1' }).videoId, 'v1')
    assert.equal(emptyBlock('FILE', { key: 'k', materialId: 'm1' }).materialId, 'm1')
    assert.equal(emptyBlock('VIDEO', { key: 'k' }).videoId, '')
  })

  describe('what gets sent', () => {
    test('only the fields the type has', () => {
      // The local object keeps spares — switching a callout's variant should
      // not have to create the field — and the server refuses an IMAGE that
      // arrives with an author on it.
      const local = {
        _key: 'k1',
        type: 'IMAGE',
        url: 'https://example.com/a.png',
        alt: 'a',
        caption: 'c',
        author: 'left over from a QUOTE',
        variant: 'INFO',
        text: '<p>left over</p>',
      }
      assert.deepEqual(serializeBlock(local), {
        type: 'IMAGE',
        url: 'https://example.com/a.png',
        alt: 'a',
        caption: 'c',
      })
    })

    test('an id is sent only once the block has one', () => {
      assert.equal('id' in serializeBlock({ type: 'DIVIDER' }), false)
      assert.equal(serializeBlock({ type: 'DIVIDER', id: 'abc' }).id, 'abc')
    })

    test('a gallery drops the images nobody uploaded into', () => {
      const block = {
        type: 'GALLERY',
        items: [{ url: 'https://example.com/1.png', alt: 'x' }, { url: '', alt: '' }],
      }
      const sent = serializeBlock(block)
      assert.equal(sent.items.length, 1)
      assert.deepEqual(sent.items[0], { url: 'https://example.com/1.png', alt: 'x', caption: '' })
    })

    test('a table is copied, not shared', () => {
      const block = { type: 'TABLE', rows: [['a', 'b']], hasHeader: false }
      const sent = serializeBlock(block)
      sent.rows[0][0] = 'changed'
      // The payload must not be a window onto the reactive state the editor
      // is still writing to.
      assert.equal(block.rows[0][0], 'a')
      assert.equal(sent.hasHeader, false)
    })

    test('a heading level is a number, whatever the select gave us', () => {
      // <select> hands back a string; the validator wants an int.
      assert.equal(serializeBlock({ type: 'HEADING', text: 'H', level: '3' }).level, 3)
      assert.equal(serializeBlock({ type: 'HEADING', text: 'H', level: undefined }).level, 2)
    })
  })

  describe('what is not sent yet', () => {
    test('an untouched block of every type is incomplete', () => {
      for (const { type } of BLOCK_TYPES) {
        if (type === 'DIVIDER') continue
        assert.equal(isComplete(emptyBlock(type, { key: 'k' })), false, `${type} starts unfinished`)
      }
      // A divider has nothing to fill in, so it is finished on arrival.
      assert.equal(isComplete(emptyBlock('DIVIDER', { key: 'k' })), true)
    })

    test('a rich-text field holding only markup is still empty', () => {
      // What contenteditable leaves behind when somebody types and deletes.
      assert.equal(isComplete({ type: 'TEXT', text: '<p><br></p>' }), false)
      assert.equal(isComplete({ type: 'TEXT', text: '<p>&nbsp;</p>' }), false)
      assert.equal(isComplete({ type: 'TEXT', text: '<p>Qoida</p>' }), true)
    })

    test('whitespace can be the whole point of a code block', () => {
      assert.equal(isComplete({ type: 'CODE', text: '    ' }), true)
      assert.equal(isComplete({ type: 'CODE', text: '' }), false)
    })

    test('a table needs a cell with something in it', () => {
      assert.equal(isComplete({ type: 'TABLE', rows: [['', ''], ['', '']] }), false)
      assert.equal(isComplete({ type: 'TABLE', rows: [['', ''], ['', 'x']] }), true)
    })
  })

  describe('ids coming back', () => {
    test('the response is matched against what was sent, not against the editor', () => {
      // The middle block was half-written and left out of the save, so the
      // response has two blocks for three local ones. Matching by local
      // position would give the third block the second one's id — and that
      // id is where somebody's reading progress points.
      const first = { _key: 'a', type: 'TEXT', text: '<p>1</p>' }
      const third = { _key: 'c', type: 'TEXT', text: '<p>3</p>' }
      const sent = [first, third]
      adoptIds(sent, [{ id: 'id-1' }, { id: 'id-3' }])
      assert.equal(first.id, 'id-1')
      assert.equal(third.id, 'id-3')
    })

    test('an id already held is left alone', () => {
      const block = { _key: 'a', type: 'TEXT', text: '<p>1</p>', id: 'id-1' }
      adoptIds([block], [{ id: 'id-1' }])
      assert.equal(block.id, 'id-1')
    })

    test('a response that is short does not blank the ids it does not cover', () => {
      const blocks = [
        { _key: 'a', type: 'DIVIDER', id: 'id-1' },
        { _key: 'b', type: 'DIVIDER', id: 'id-2' },
      ]
      adoptIds(blocks, [{ id: 'id-1' }])
      assert.equal(blocks[1].id, 'id-2')
    })
  })
})
