import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV ??= 'test'
const { reportError, _useTransportForTests, _resetErrorAlerts, isErrorAlertEnabled } = await import(
  '../src/services/alerts/errorAlert.service.js'
)

describe('error alerts by mail', () => {
  let sent
  beforeEach(() => {
    sent = []
    _resetErrorAlerts()
    _useTransportForTests(() => ({ sendMail: async (mail) => { sent.push(mail); return {} } }))
  })

  test('enabled once a transport and a recipient exist', () => {
    assert.equal(isErrorAlertEnabled(), true)
  })

  test('an API error is mailed with route, user, code and the top of the stack', async () => {
    const error = new Error('boom at save')
    reportError({ source: 'api', status: 500, code: 'INTERNAL_ERROR', message: error.message, stack: error.stack, route: 'PATCH /api/v1/users/1', user: 'u1 · ADMIN', requestId: 'r-1' })
    await new Promise((r) => setImmediate(r))
    assert.equal(sent.length, 1)
    assert.match(sent[0].subject, /API 500 INTERNAL_ERROR — boom at save/)
    assert.match(sent[0].html, /PATCH \/api\/v1\/users\/1/)
    assert.match(sent[0].html, /u1 · ADMIN/)
    assert.match(sent[0].html, /errorAlert\.test\.js/)
  })

  test('the same error inside the window is counted, not re-sent; a different one is', async () => {
    for (let i = 0; i < 5; i++) reportError({ source: 'api', status: 403, code: 'FORBIDDEN', message: 'no', route: 'DELETE /x' })
    reportError({ source: 'client', code: 'VUE', message: 'Cannot read x', pageUrl: 'https://spring/bos/users' })
    await new Promise((r) => setImmediate(r))
    assert.equal(sent.length, 2)
    assert.match(sent[1].html, /spring\/bos\/users/)
  })

  test('no more than the hourly cap goes out', async () => {
    for (let i = 0; i < 60; i++) reportError({ source: 'api', status: 500, code: 'E' + i, message: 'm' + i })
    await new Promise((r) => setImmediate(r))
    assert.equal(sent.length, 40)
  })
})
