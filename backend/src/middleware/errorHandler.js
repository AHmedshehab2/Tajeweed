const AppError = require('../lib/AppError');

function errorHandler(err, _req, res, _next) {
  if (res.headersSent) return;

  if (process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  // Handle operational AppErrors
  if (err instanceof AppError || err.isOperational) {
    return res.status(err.statusCode || 400).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Handle Prisma database errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
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

  // Generic fallback for unhandled errors
  const status = err.statusCode || err.status || 500;
  const message = status === 500 ? 'حدث خطأ في الخادم' : err.message;
  return res.status(status).json({ error: message });
}

module.exports = errorHandler;
