/**
 * One API process, for test/socketCluster.test.js.
 *
 * Booted as a child process rather than a second Server in the test's own
 * process because the module under test holds a single `io` per process —
 * which is exactly the thing the Redis adapter has to bridge. Two instances
 * in one process would prove nothing about production, where the bridge is
 * between PM2 cluster workers.
 */
import http from 'node:http'
import { initSocketServer, emitNotification, isUserOnline } from '../../src/realtime/socket.js'

const port = Number(process.argv[2])
const server = http.createServer((_req, res) => res.end('ok'))
initSocketServer(server)

process.on('message', (msg) => {
  if (msg.cmd === 'emit') {
    emitNotification(msg.userId, msg.payload)
    process.send({ ok: true })
  }
  if (msg.cmd === 'isOnline') {
    process.send({ online: isUserOnline(msg.userId) })
  }
})

server.listen(port, '127.0.0.1', () => process.send({ ready: true, port }))
