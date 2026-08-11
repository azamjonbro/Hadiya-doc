import type { Response } from 'express'
import type { ApiResponse } from '@lms/shared'

export function sendSuccess<T>(res: Response, data: T, message = 'OK', statusCode = 200): void {
  const body: ApiResponse<T> = { success: true, message, data }
  res.status(statusCode).json(body)
}

export function sendError(res: Response, statusCode: number, code: string, message: string): void {
  const body: ApiResponse<null> = { success: false, message, code, data: null }
  res.status(statusCode).json(body)
}
