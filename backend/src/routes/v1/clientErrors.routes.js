import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { validateBody } from '../../middlewares/validate.middleware.js'
import { rateLimitHandler } from '../../middlewares/rateLimit.middleware.js'
import { reportError } from '../../services/alerts/errorAlert.service.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { sendSuccess } from '../../utils/apiResponse.js'

/**
 * What the browser could not handle — a render error, a rejected promise
 * nobody caught, a window.onerror — posted here so it reaches the same
 * mailbox the API's own failures do, with the page, the component and the
 * browser it happened in. Signed-in users only (the payload names them),
 * and throttled: a page stuck in an error loop must not become a mail loop.
 */
const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(20000).optional().default(''),
  kind: z.enum(['vue', 'promise', 'window', 'request']).optional().default('window'),
  component: z.string().max(300).optional().default(''),
  info: z.string().max(300).optional().default(''),
  pageUrl: z.string().max(2000).optional().default(''),
  route: z.string().max(500).optional().default(''),
  status: z.coerce.number().int().optional(),
  code: z.string().max(80).optional().default(''),
  release: z.string().max(80).optional().default(''),
})

export const clientErrorsRouter = Router()
clientErrorsRouter.use(authenticate)
clientErrorsRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, handler: rateLimitHandler('Too many error reports') }),
  validateBody(clientErrorSchema),
  asyncHandler(async (req, res) => {
    const body = req.body
    reportError({
      source: 'client',
      code: body.code || body.kind.toUpperCase(),
      status: body.status,
      message: body.message,
      stack: body.stack,
      route: body.route || `${body.kind}`,
      pageUrl: body.pageUrl,
      component: [body.component, body.info].filter(Boolean).join(' · '),
      user: `${req.user.id} · ${req.user.roleName ?? ''}`,
      userAgent: req.headers['user-agent'] ?? '',
      ip: req.ip,
      details: body.release ? `release ${body.release}` : '',
    })
    sendSuccess(res, { received: true })
  })
)
