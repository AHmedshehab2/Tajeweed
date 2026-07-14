function errorHandler(err, _req, res, _next) {
  console.error(err);
  const status = err.status || 500;
  const message = status === 500 ? 'حدث خطأ في الخادم' : err.message;
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
