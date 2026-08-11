import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { connectDatabase } from './config/db.js'
import { createApp } from './app.js'

async function main(): Promise<void> {
  await connectDatabase()

  const app = createApp()
  const server = app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`, { env: env.NODE_ENV })
  })

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : error,
  })
  process.exit(1)
})
