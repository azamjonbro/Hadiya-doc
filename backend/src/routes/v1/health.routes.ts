import { Router } from 'express'
import mongoose from 'mongoose'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { sendSuccess } from '../../utils/apiResponse.js'

export const healthRouter = Router()

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    })
  })
)
