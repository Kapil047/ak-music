import { ApiResponse } from '../utils/apiResponse.js';

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params
    });

    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message
      }));
      return ApiResponse.error(res, 'Validation error', 'ERR_VALIDATION', 400, details);
    }

    // Assign sanitized data back
    if (result.data.query) req.query = result.data.query;
    if (result.data.params) req.params = result.data.params;
    if (result.data.body) req.body = result.data.body;

    next();
  };
}
