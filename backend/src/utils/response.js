// Helpers that enforce the consistent API envelope: { data, error, status }.

export function sendSuccess(res, status, data) {
  return res.status(status).json({ data, error: null, status });
}

export function sendError(res, status, error) {
  return res.status(status).json({ data: null, error, status });
}
