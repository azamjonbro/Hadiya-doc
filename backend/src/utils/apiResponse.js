export function sendSuccess(res, data, message = 'OK', statusCode = 200) {
  res.status(statusCode).json({ success: true, message, data })
}

export function sendError(res, statusCode, code, message) {
  res.status(statusCode).json({ success: false, message, code, data: null })
}
