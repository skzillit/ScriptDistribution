/**
 * Wrap every `res.json(...)` payload in the project-wide envelope:
 *   { status, message, messageElements, data }
 *
 * - status: 1 on 2xx/3xx, 0 on 4xx/5xx
 * - message: human-readable summary. For errors, taken from body.error/message;
 *            for success, taken from body.message if present, else 'success'.
 * - messageElements: reserved (always []).
 * - data: the original payload on success, null on error.
 *
 * Already-enveloped bodies are passed through unchanged so handlers can
 * opt out (or so we don't double-wrap on internal re-invocations).
 *
 * Binary downloads / file streams use res.send / res.sendFile / res.pipe and
 * are unaffected by this middleware — only res.json is intercepted.
 */
function responseEnvelope(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    // Already enveloped? Pass through.
    if (
      body && typeof body === 'object' && !Array.isArray(body)
      && 'status' in body && 'data' in body && 'message' in body && 'messageElements' in body
    ) {
      return originalJson(body);
    }

    const isError = res.statusCode >= 400;
    let message;
    if (isError) {
      message = (body && (body.error || body.message)) || 'error';
    } else {
      message = (body && body.message) || 'success';
    }

    return originalJson({
      status: isError ? 0 : 1,
      message,
      messageElements: [],
      data: isError ? null : (body == null ? null : body),
    });
  };

  next();
}

module.exports = responseEnvelope;
