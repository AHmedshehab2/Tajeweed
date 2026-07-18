function errorHandler(err, _req, res, _next) {
  console.error(err);
  if (res.headersSent) return;

  if (err.code && err.code.startsWith('P')) {
    const prismaStatus = {
      P2002: 409,
      P2025: 404,
      P2003: 400,
    };
    const status = prismaStatus[err.code] || 400;
    const prismaMessages = {
      P2002: 'البيانات موجودة مسبقاً',
      P2025: 'السجل غير موجود',
      P2003: 'بيانات غير صالحة',
    };
    return res.status(status).json({ error: prismaMessages[err.code] || 'بيانات غير صالحة' });
  }

  const status = err.status || 500;
  const message = status === 500 ? 'حدث خطأ في الخادم' : err.message;
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
