export function sendSuccess(res, data, message = 'OK', statusCode = 200) {
  res.status(statusCode).json({ success: true, message, data })
}

// `details` is omitted rather than sent as null when there is nothing to
// interpolate, so the common error body stays exactly the shape it was.
export function sendError(res, statusCode, code, message, details = null) {
  res.status(statusCode).json({
    success: false,
    message,
    code,
    ...(details ? { details } : {}),
    data: null,
  })
}
