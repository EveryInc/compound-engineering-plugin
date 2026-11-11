// Express 5 forwards rejected promises from async handlers to the error middleware.
export function errorMiddleware(err, req, res, next) {
  req.log?.error(err)
  res.status(err.status ?? 500).json({ error: err.expose ? err.message : "internal_error" })
}
