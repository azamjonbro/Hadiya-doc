import mongoose from 'mongoose'
import { env } from './env.js'
import { logger } from './logger.js'

export async function connectDatabase() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(env.MONGO_URI)
  logger.info('MongoDB connected', {
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  })
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
