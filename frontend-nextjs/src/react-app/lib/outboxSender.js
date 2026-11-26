// Sends the captions in an Outbox (lib/outbox.js): over the live socket when it is joined, over HTTP when only the
// network is up, and not at all when offline or when there is no valid sign-in. The socket, HTTP, clock and sign-in are
// all injected, so the rules below are unit-tested without a browser.
//
// What happens to one attempt:
//   delivered  – the server stored it, or says it already had it (duplicate)  → removed from the outbox
//   temporary  – network error, timeout, 5xx, 429, "not joined yet", retryable → retried later with the SAME clientId
//   auth       – the sign-in expired (401)                                      → refresh once; if that fails, wait for
//                                                                                a valid sign-in; never counted as a failure
//   permanent  – the server refused it (400/403/404/409, class ended, invalid)  → kept as "failed" for the person to
//                                                                                retry or discard; not retried on its own
//   offline    – nothing was sent                                                → try again when back online

const TEMPORARY_STATUS = new Set([408, 425, 429]);
const AUTH_CODES = new Set(['UNAUTHENTICATED', 'UNAUTHORIZED', 'TOKEN_EXPIRED', 'AUTH_REQUIRED']);
const TEMPORARY_CODES = new Set(['NOT_JOINED', 'RATE_LIMITED', 'SERVER_ERROR', 'TIMEOUT']);

// Socket acknowledgement → outcome.
export function classifyAck(res) {
  if (!res) return { kind: 'temporary', reason: 'No reply from the server' };
  if (res.ok) return { kind: 'delivered', caption: res.caption, duplicate: Boolean(res.duplicate) };
  if (AUTH_CODES.has(res.code)) return { kind: 'auth' };
  if (res.retryable || TEMPORARY_CODES.has(res.code)) return { kind: 'temporary', reason: res.error || res.code };
  return { kind: 'permanent', reason: res.error || 'The caption was not accepted' };
}

// HTTP error (from api/client.js: has .status for HTTP errors, none for network failures) → outcome.
export function classifyHttpError(err) {
  const status = err && err.status;
  if (!status) return { kind: 'temporary', reason: (err && err.message) || 'Network error' };
  if (status === 401) return { kind: 'auth' };
  if (TEMPORARY_STATUS.has(status) || status >= 500) return { kind: 'temporary', reason: err.message };
  return { kind: 'permanent', reason: err.message || `The caption was not accepted (${status})` };
}

export const WARN_AFTER_TRIES = 6;

// deps: {
//   box,                              the Outbox
//   socketReady() -> bool             the socket is connected AND has joined the class
//   viaSocket(item) -> Promise<ack>   resolves with the acknowledgement, or null on timeout / error
//   viaHttp(item) -> Promise<{data:{caption,duplicate}}>   rejects with an error that may carry .status
//   isOnline() -> bool                hasAuth() -> bool          refreshAuth() -> Promise<bool>
//   notify(message, kind)             onDelivered(caption)       (both optional)
// }
export function createOutboxSender(deps) {
  const { box } = deps;
  const notify = deps.notify || (() => {});
  const onDelivered = deps.onDelivered || (() => {});
  let authWarned = false;
  let refreshing = null;

  const attempt = async (item) => {
    if (deps.socketReady()) {
      try { return classifyAck(await deps.viaSocket(item)); } catch (err) { return { kind: 'temporary', reason: err && err.message }; }
    }
    if (deps.isOnline()) {
      try {
        const r = await deps.viaHttp(item);
        const caption = r && r.data ? r.data.caption : undefined;
        return { kind: 'delivered', caption, duplicate: Boolean(r && r.data && r.data.duplicate) };
      } catch (err) { return classifyHttpError(err); }
    }
    return { kind: 'offline' };
  };

  // One refresh at a time, even when several captions hit the same expired sign-in.
  const refreshOnce = () => {
    if (!refreshing) refreshing = Promise.resolve(deps.refreshAuth()).catch(() => false).finally(() => { refreshing = null; });
    return refreshing;
  };

  const deliver = async ([clientId, item]) => {
    const outcome = await attempt(item);
    if (box.disposed && outcome.kind !== 'delivered') { box.release(clientId); return; }
    switch (outcome.kind) {
      case 'delivered':
        box.settle(clientId);
        if (outcome.caption) onDelivered(outcome.caption);
        authWarned = false;
        break;
      case 'temporary':
        if (box.fail(clientId) === WARN_AFTER_TRIES) notify('A caption is taking a while to send. It will keep retrying.', 'info');
        break;
      case 'auth':
        box.release(clientId);                       // not the caption's fault, so no failed attempt is counted
        if (!(await refreshOnce()) && !authWarned) { authWarned = true; notify('Your sign-in has expired. Captions are kept and will send once you sign in again.', 'error'); }
        break;
      case 'permanent':
        box.reject(clientId, outcome.reason);
        notify(outcome.reason || 'A caption was not accepted', 'error');
        break;
      default:                                       // offline
        box.release(clientId);
    }
  };

  return {
    // Send everything that is due. Waits for the stored captions to load first, so a reload never sends a caption twice
    // or skips the ones saved by the previous visit. Returns when this round of attempts has finished.
    async flush() {
      await box.ready;
      if (box.disposed) return;
      if (!deps.hasAuth()) return;                   // no valid sign-in yet: wait, send nothing, count nothing
      await Promise.all(box.due().map(deliver));
    },
  };
}
