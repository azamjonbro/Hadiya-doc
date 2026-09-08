// Proves the realtime layer works across processes.
//
// ecosystem.config.cjs runs the API in PM2 cluster mode, and until the Redis
// adapter went in, a chat message emitted by the worker that handled the POST
// only reached sockets connected to that same worker. Whether a message
// arrived live therefore depended on which worker accepted the sender's
// request and which accepted the recipient's — invisible on a laptop, where
// there is only ever one process, and invisible in any test that boots one
// server.
//
// So this boots two real API processes on two ports, connects a client to
// one, emits from the other, and requires the message to arrive.

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { io as ioClient } from 'socket.io-client'
import jwt from 'jsonwebtoken'
import Redis from 'ioredis'
import { env } from '../src/config/env.js'

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'socketNode.js')
const PORT_A = 4171
const PORT_B = 4172
const USER_ID = '000000000000000000009901'

const token = jwt.sign(
  { sub: USER_ID, roleId: '000000000000000000009902', roleName: 'EMPLOYEE', permissions: [] },
  env.JWT_ACCESS_SECRET,
  { expiresIn: '5m' }
)

async function redisReachable() {
  const probe = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, retryStrategy: () => null, lazyConnect: true })
  try {
    await probe.connect()
    await probe.ping()
    return true
  } catch {
    return false
  } finally {
    probe.disconnect()
  }
}

function startNode(port) {
  return new Promise((resolve, reject) => {
    const child = fork(FIXTURE, [String(port)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const onMessage = (msg) => {
      if (msg?.ready) {
        child.off('message', onMessage)
        resolve(child)
      }
    }
    child.on('message', onMessage)
    child.on('exit', (code) => reject(new Error(`node on :${port} exited (${code})\n${stderr}`)))
    setTimeout(() => reject(new Error(`node on :${port} did not start\n${stderr}`)), 10_000).unref()
  })
}

function ask(child, message) {
  return new Promise((resolve) => {
    const onMessage = (reply) => {
      child.off('message', onMessage)
      resolve(reply)
    }
    child.on('message', onMessage)
    child.send(message)
  })
}

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })
}

function nextEvent(socket, name, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no "${name}" within ${timeoutMs}ms — the adapter did not bridge the two nodes`)),
      timeoutMs
    )
    socket.once(name, (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

const skip = (await redisReachable())
  ? false
  : `Redis is not reachable at ${env.REDIS_URL} — start it to run the cluster test`

describe('realtime across two API processes', { skip }, () => {
  let nodeA
  let nodeB
  let client

  before(async () => {
    ;[nodeA, nodeB] = await Promise.all([startNode(PORT_A), startNode(PORT_B)])
    client = await connectClient(PORT_A)
  })

  after(async () => {
    client?.close()
    for (const child of [nodeA, nodeB]) {
      child?.removeAllListeners('exit')
      child?.kill()
    }
  })

  test('the client is connected to node A only', async () => {
    const onA = await ask(nodeA, { cmd: 'isOnline', userId: USER_ID })
    assert.equal(onA.online, true)
    assert.equal(client.connected, true)
  })

  test('a notification emitted on node B reaches a socket held by node A', async () => {
    const arrived = nextEvent(client, 'notification:new')
    await ask(nodeB, { cmd: 'emit', userId: USER_ID, payload: { id: 'n-1', title: 'Yangi kurs' } })
    assert.deepEqual(await arrived, { id: 'n-1', title: 'Yangi kurs' })
  })

  test('node B, which holds no socket for this user, still reports them online', async () => {
    // The presence sweep is what makes this true; it runs on a 15s interval,
    // so the assertion allows for one sweep rather than assuming instant.
    const deadline = Date.now() + 20_000
    let online = false
    while (Date.now() < deadline && !online) {
      ;({ online } = await ask(nodeB, { cmd: 'isOnline', userId: USER_ID }))
      if (!online) await new Promise((r) => setTimeout(r, 1000))
    }
    assert.equal(online, true, 'presence never propagated to the other node')
  })

  test('the HTTP side of both nodes is up, so the ports really are separate processes', async () => {
    for (const port of [PORT_A, PORT_B]) {
      const status = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/`, (res) => {
          res.resume()
          resolve(res.statusCode)
        }).on('error', reject)
      })
      assert.equal(status, 200)
    }
  })
})
