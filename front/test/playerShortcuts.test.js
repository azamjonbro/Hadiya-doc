// 12.5 — the player's keyboard control.
//
// The keys themselves are not the interesting part; these tests are about
// the three ways a shortcut layer goes wrong:
//
//   - it steals keystrokes from whoever is typing (an `f` in a search box
//     going fullscreen is the kind of bug that makes people distrust a
//     page);
//   - it becomes a way around a block the UI is enforcing — here, the
//     attention lockout and the face gate, whose overlay covers the
//     controls but cannot cover the keyboard;
//   - it leaves the media in an impossible state (a negative position, a
//     volume above one).
//
// The DOM is a plain object, because a media element is only used through
// four properties and two methods, and a real browser adds nothing to what
// is being checked.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BIG_SEEK_STEP_SECONDS,
  SEEK_STEP_SECONDS,
  SPEEDS,
  actionFor,
  handleKey,
  isTypingTarget,
  nextPosition,
  nextSpeed,
  nextVolume,
} from '../src/composables/usePlayerShortcuts.js'

const media = (overrides = {}) => ({
  paused: true,
  currentTime: 30,
  duration: 300,
  volume: 0.5,
  muted: false,
  playbackRate: 1,
  played: [],
  play() {
    this.paused = false
    this.played.push('play')
    return Promise.resolve()
  },
  pause() {
    this.paused = true
  },
  ...overrides,
})

const press = (key, extra = {}) => ({
  key,
  target: { tagName: 'BODY' },
  preventDefault() {
    this.prevented = true
  },
  ...extra,
})

describe('12.5 · player shortcuts', () => {
  describe('keys somebody else is using', () => {
    test('typing is never a shortcut', () => {
      for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
        assert.equal(isTypingTarget({ tagName }), true, tagName)
      }
      assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true)
      assert.equal(isTypingTarget({ tagName: 'BODY', closest: () => null }), false)
    })

    test('a keystroke in a field does nothing to the video', () => {
      const element = media()
      const event = press(' ', { target: { tagName: 'INPUT' } })
      assert.equal(handleKey(event, { media: element }), null)
      // And the default is left alone: a space in a text box types a space.
      assert.equal(event.prevented, undefined)
      assert.equal(element.paused, true)
    })

    test('a dialog owns the keyboard while it is open', () => {
      const target = { tagName: 'BUTTON', closest: (selector) => (selector.includes('dialog') ? {} : null) }
      assert.equal(handleKey(press('k', { target }), { media: media() }), null)
    })

    test('modifier combinations belong to the browser', () => {
      // Ctrl+F is find, Cmd+L is the address bar. Taking those would be
      // worse than having no shortcuts at all.
      assert.equal(actionFor({ key: 'f', ctrlKey: true }), null)
      assert.equal(actionFor({ key: 'l', metaKey: true }), null)
      assert.equal(actionFor({ key: 'k', altKey: true }), null)
    })

    test('a key with no meaning keeps its default behaviour', () => {
      const event = press('q')
      assert.equal(handleKey(event, { media: media() }), null)
      assert.equal(event.prevented, undefined)
    })
  })

  describe('what the keys do', () => {
    test('space and K play and pause', () => {
      const element = media()
      assert.equal(handleKey(press(' '), { media: element }), 'TOGGLE_PLAY')
      assert.equal(element.paused, false)
      assert.equal(handleKey(press('k'), { media: element }), 'TOGGLE_PLAY')
      assert.equal(element.paused, true)
      // Upper case too: caps lock is not a reason for a button to stop
      // working.
      assert.equal(handleKey(press('K'), { media: element }), 'TOGGLE_PLAY')
    })

    test('J/L move ten seconds, the arrows five', () => {
      const element = media({ currentTime: 100 })
      handleKey(press('l'), { media: element })
      assert.equal(element.currentTime, 100 + BIG_SEEK_STEP_SECONDS)
      handleKey(press('j'), { media: element })
      assert.equal(element.currentTime, 100)
      handleKey(press('ArrowRight'), { media: element })
      assert.equal(element.currentTime, 100 + SEEK_STEP_SECONDS)
      handleKey(press('ArrowLeft'), { media: element })
      assert.equal(element.currentTime, 100)
    })

    test('a digit jumps to that tenth, Home and End to the edges', () => {
      const element = media({ duration: 300 })
      handleKey(press('3'), { media: element })
      assert.equal(element.currentTime, 90)
      handleKey(press('0'), { media: element })
      assert.equal(element.currentTime, 0)
      handleKey(press('End'), { media: element })
      assert.equal(element.currentTime, 300)
      handleKey(press('Home'), { media: element })
      assert.equal(element.currentTime, 0)
    })

    test('a video with no known duration is not seeked to NaN', () => {
      // Before `loadedmetadata`, and for a live stream, `duration` is NaN
      // or Infinity — and `currentTime = NaN` throws in some browsers and
      // silently resets playback in others.
      const element = media({ duration: NaN })
      assert.equal(handleKey(press('5'), { media: element }), null)
      assert.ok(Number.isFinite(element.currentTime))
    })

    test('volume and mute', () => {
      const element = media({ volume: 0.5 })
      handleKey(press('ArrowUp'), { media: element })
      assert.equal(element.volume, 0.6)
      handleKey(press('ArrowDown'), { media: element })
      assert.equal(element.volume, 0.5)
      handleKey(press('m'), { media: element })
      assert.equal(element.muted, true)
      // Nudging the volume up unmutes, or the change is invisible and the
      // person presses it again and again.
      handleKey(press('ArrowUp'), { media: element })
      assert.equal(element.muted, false)
    })

    test('speed steps through the list and stops at both ends', () => {
      const element = media({ playbackRate: SPEEDS[SPEEDS.length - 1] })
      handleKey(press('>'), { media: element })
      assert.equal(element.playbackRate, SPEEDS[SPEEDS.length - 1])
      element.playbackRate = SPEEDS[0]
      handleKey(press('<'), { media: element })
      assert.equal(element.playbackRate, SPEEDS[0])
      element.playbackRate = 1
      handleKey(press('>'), { media: element })
      assert.equal(element.playbackRate, 1.25)
    })

    test('captions, fullscreen and the help panel are handed to the player', () => {
      const calls = []
      const context = {
        media: media(),
        onCaptions: () => calls.push('captions'),
        onFullscreen: () => calls.push('fullscreen'),
        onHelp: () => calls.push('help'),
      }
      handleKey(press('c'), context)
      handleKey(press('f'), context)
      handleKey(press('?'), context)
      assert.deepEqual(calls, ['captions', 'fullscreen', 'help'])
    })
  })

  describe('a shortcut is not a way around a block', () => {
    test('play is refused while the attention lockout or face gate is up', () => {
      const element = media({ paused: true })
      // The overlay covers the controls; it cannot cover the keyboard.
      assert.equal(handleKey(press(' '), { media: element, blocked: true }), null)
      assert.equal(element.paused, true)
      assert.deepEqual(element.played, [])
    })

    test('but seeking and volume still work — they do not resume playback', () => {
      const element = media({ currentTime: 50, volume: 0.4 })
      assert.equal(handleKey(press('ArrowRight'), { media: element, blocked: true }), 'SEEK')
      assert.equal(element.currentTime, 55)
      assert.equal(handleKey(press('ArrowUp'), { media: element, blocked: true }), 'VOLUME')
      assert.equal(element.volume, 0.5)
    })
  })

  describe('the media is never left in an impossible state', () => {
    test('positions are clamped to the video', () => {
      assert.equal(nextPosition(2, 100, -10), 0)
      assert.equal(nextPosition(95, 100, 10), 100)
      // No duration yet: forward from zero is still meaningful, backwards
      // is not allowed below zero.
      assert.equal(nextPosition(5, NaN, -10), 0)
    })

    test('volume stays between 0 and 1, and stays a round number', () => {
      assert.equal(nextVolume(0.95, 0.1), 1)
      assert.equal(nextVolume(0.05, -0.1), 0)
      // 0.7000000000000001 is what floating point gives, and it shows up in
      // a volume slider as a value that never quite matches.
      assert.equal(nextVolume(0.6, 0.1), 0.7)
    })

    test('an unrecognised playback rate resolves to 1× rather than refusing', () => {
      assert.equal(nextSpeed(1.1, 1), 1.25)
      assert.equal(nextSpeed(undefined, -1), 0.75)
    })
  })
})
