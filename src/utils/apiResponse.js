export class ApiResponse {
  static success(res, data, meta = {}, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      meta: {
        timestamp: Date.now(),
        ...meta
      }
    });
  }

  static error(res, message, errorCode = 'ERR_INTERNAL', statusCode = 500, details = null) {
    return res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
        details
      },
      meta: {
        timestamp: Date.now()
      }
    });
  }
}
