import { validationResult } from 'express-validator';

// Runs after an express-validator chain. If any validator failed, respond 400
// with a clear list of field errors (keeping the app's { data, error, status }
// envelope and adding an `errors` array). Otherwise continue.
export function handleValidationErrors(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map((e) => ({
    field: e.path ?? e.param,
    message: e.msg,
  }));
  return res.status(400).json({
    data: null,
    error: errors[0]?.message || 'Validation failed',
    status: 400,
    errors,
  });
}
