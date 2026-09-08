import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { connectDatabase } from './config/db.js'
import { seedRolesAndSuperAdmin } from './seed/seedRolesAndSuperAdmin.js'
import { createApp } from './app.js'
import { initSocketServer, closeSocketServer } from './realtime/socket.js'

async function main() {
  await connectDatabase()
  await seedRolesAndSuperAdmin()

  const app = createApp()
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`Backend listening on ${env.HOST}:${env.PORT}`, { env: env.NODE_ENV })
  })
  initSocketServer(server)

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down`)
    // Sockets first: server.close() waits for open connections to end, and a
    // websocket never ends on its own — every reload would sit out the 10s
    // timeout below instead of handing over promptly. This also releases the
    // adapter's two Redis connections.
    await closeSocketServer().catch(() => {})
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : error,
  })
  process.exit(1)
})
