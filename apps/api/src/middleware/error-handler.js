/**
 * Global Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  console.error("[error]", err);
  const status = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
