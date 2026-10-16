// -----------------------------------------------------------------------------
// OVHcloud API client: signed requests with an application key, an
// application secret and a consumer key (the classic OVHcloud API
// credentials).
//
// Every authenticated call carries four headers:
//   X-Ovh-Application  the application key
//   X-Ovh-Consumer     the consumer key
//   X-Ovh-Timestamp    the OVHcloud server time, in seconds
//   X-Ovh-Signature    "$1$" + sha1(AS + "+" + CK + "+" + METHOD + "+" + URL
//                      + "+" + BODY + "+" + TIMESTAMP)
// where URL is the full URL, query string included, and BODY the exact JSON
// sent (empty for a GET). This is the scheme of the official python-ovh and
// node-ovh clients. The timestamp must be the server's: the difference with
// the local clock is read once from the unauthenticated `GET /auth/time` and
// read again when OVHcloud refuses a timestamp.
//
// This module holds only HTTP (no SDK, no Gladys concept): the transport is
// injected, so the tests never touch the network. The secret and the consumer
// key never appear in an error, a log line or a URL.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

// The OVHcloud SMS offer exists on the European and Canadian APIs only (the
// US API has no /sms).
const ENDPOINTS = Object.freeze({
  'ovh-eu': 'https://eu.api.ovh.com/1.0',
  'ovh-ca': 'https://ca.api.ovh.com/1.0',
});
const DEFAULT_ENDPOINT = 'ovh-eu';

const REQUEST_TIMEOUT_MS = 15 * 1000;
// The server time drifts slowly from the local clock: read it again every
// hour, and at once when OVHcloud refuses a timestamp.
const TIME_DELTA_TTL_MS = 60 * 60 * 1000;

// Kinds of failure, used by the rest of the integration to pick a message
// and a scene trigger reason.
const ERROR_KINDS = Object.freeze({
  AUTH: 'auth',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  BAD_REQUEST: 'bad_request',
  RATE_LIMITED: 'rate_limited',
  SERVER: 'server',
  TIMEOUT: 'timeout',
  UNREACHABLE: 'unreachable',
  UNEXPECTED: 'unexpected',
});

/**
 * @description A call OVHcloud refused or could not answer.
 */
class OvhApiError extends Error {
  /**
   * @param {string} message - Readable message, without any credential.
   * @param {object} details - Failure details.
   * @param {string} details.kind - One of ERROR_KINDS.
   * @param {number|null} [details.status] - HTTP status, when OVHcloud answered.
   * @param {string|null} [details.errorCode] - The `errorCode` of the answer (e.g. INVALID_CREDENTIAL).
   * @param {string|null} [details.ovhMessage] - The `message` of the answer.
   * @param {Error} [details.cause] - Underlying error.
   */
  constructor(message, { kind, status = null, errorCode = null, ovhMessage = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OvhApiError';
    this.kind = kind;
    this.status = status;
    this.errorCode = errorCode;
    this.ovhMessage = ovhMessage;
  }
}

/**
 * @description The kind of failure of an HTTP status.
 * @param {number} status - The HTTP status.
 * @param {string} message - The OVHcloud message (an invalid key is a 403).
 * @returns {string} One of ERROR_KINDS.
 * @example
 * kindOf(429, ''); // -> 'rate_limited'
 */
function kindOf(status, message) {
  if (status === 401) {
    return ERROR_KINDS.AUTH;
  }
  if (status === 403) {
    // OVHcloud answers 403 both for keys it does not accept (unknown
    // application, consumer key not validated, expired or revoked) and for a
    // call outside the rights of a valid consumer key ("This call has not been
    // granted"), which the user fixes differently.
    return /not been granted|NOT_GRANTED_CALL/i.test(message)
      ? ERROR_KINDS.FORBIDDEN
      : ERROR_KINDS.AUTH;
  }
  if (status === 404) {
    return ERROR_KINDS.NOT_FOUND;
  }
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMITED;
  }
  if (status >= 500) {
    return ERROR_KINDS.SERVER;
  }
  if (status >= 400) {
    return ERROR_KINDS.BAD_REQUEST;
  }
  return ERROR_KINDS.UNEXPECTED;
}

/**
 * @description The default transport: fetch with a timeout, answering
 * `{ status, text }`.
 * @param {string} url - The URL.
 * @param {object} init - fetch options.
 * @returns {Promise<{ status: number, text: string }>} The answer.
 * @example
 * await fetchTransport('https://eu.api.ovh.com/1.0/auth/time', { method: 'GET' });
 */
async function fetchTransport(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return { status: response.status, text: await response.text() };
}

/**
 * @description The signature of a call.
 * @param {object} parts - The signed parts.
 * @param {string} parts.applicationSecret - Application secret.
 * @param {string} parts.consumerKey - Consumer key.
 * @param {string} parts.method - HTTP method.
 * @param {string} parts.url - Full URL, query string included.
 * @param {string} parts.body - Exact body ('' for none).
 * @param {number} parts.timestamp - Server time, in seconds.
 * @returns {string} The X-Ovh-Signature header.
 * @example
 * sign({ applicationSecret: 'as', consumerKey: 'ck', method: 'GET', url, body: '', timestamp: 1 });
 */
function sign({ applicationSecret, consumerKey, method, url, body, timestamp }) {
  const hash = createHash('sha1')
    .update([applicationSecret, consumerKey, method.toUpperCase(), url, body, timestamp].join('+'))
    .digest('hex');
  return `$1$${hash}`;
}

/**
 * @description Build a query string the way OVHcloud reads it (only the
 * defined values).
 * @param {object} [query] - The parameters.
 * @returns {string} '' or '?a=1&b=2'.
 * @example
 * queryString({ 'creationDatetime.from': '2026-10-16T00:00:00Z' });
 */
function queryString(query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * @description Create an OVHcloud API client.
 * @param {object} options - Options.
 * @param {Function} options.getCredentials - `() => ({ endpoint, applicationKey, applicationSecret, consumerKey })`.
 * @param {Function} [options.transport] - `(url, init) => Promise<{ status, text }>` (tests).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @returns {object} The client: `get`, `post`, `reset`.
 * @example
 * const api = createOvhClient({ getCredentials: () => credentials });
 * const services = await api.get('/sms');
 */
function createOvhClient({ getCredentials, transport = fetchTransport, now = () => Date.now() }) {
  // Seconds to add to the local clock to get the OVHcloud one.
  let timeDelta = null;
  let timeDeltaAt = 0;

  /**
   * @description Send one HTTP request and turn network failures into OvhApiError.
   * @param {string} url - The URL.
   * @param {object} init - fetch options.
   * @returns {Promise<{ status: number, text: string }>} The answer.
   */
  async function send(url, init) {
    try {
      return await transport(url, init);
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new OvhApiError('OVHcloud API timed out', { kind: ERROR_KINDS.TIMEOUT, cause: err });
      }
      // Never the request in the message: its headers carry the signature.
      throw new OvhApiError(`OVHcloud API unreachable: ${err.cause?.code ?? err.message}`, {
        kind: ERROR_KINDS.UNREACHABLE,
        cause: err,
      });
    }
  }

  /**
   * @description The base URL of the configured region.
   * @returns {string} The base URL.
   */
  function baseUrl() {
    return ENDPOINTS[getCredentials().endpoint] ?? ENDPOINTS[DEFAULT_ENDPOINT];
  }

  /**
   * @description The difference between the OVHcloud clock and ours, read
   * from `GET /auth/time` (unauthenticated) and kept an hour.
   * @param {boolean} [force] - Read it again now.
   * @returns {Promise<number>} The difference, in seconds.
   */
  async function serverTimeDelta(force = false) {
    if (!force && timeDelta !== null && now() - timeDeltaAt < TIME_DELTA_TTL_MS) {
      return timeDelta;
    }
    const answer = await send(`${baseUrl()}/auth/time`, { method: 'GET' });
    const serverTime = Number(answer.text);
    if (answer.status !== 200 || !Number.isFinite(serverTime)) {
      throw new OvhApiError(`OVHcloud API answered HTTP ${answer.status} to /auth/time`, {
        kind: answer.status >= 500 ? ERROR_KINDS.SERVER : ERROR_KINDS.UNEXPECTED,
        status: answer.status,
      });
    }
    timeDelta = Math.round(serverTime - now() / 1000);
    timeDeltaAt = now();
    return timeDelta;
  }

  /**
   * @description Make one signed call.
   * @param {string} method - HTTP method.
   * @param {string} path - Path under the region base, e.g. '/sms'.
   * @param {object} [options] - Options.
   * @param {object} [options.query] - Query parameters.
   * @param {object} [options.body] - JSON body.
   * @param {boolean} [options.retriedTime] - The timestamp was already refreshed once.
   * @returns {Promise<any>} The parsed JSON answer (null when empty).
   */
  async function call(method, path, { query, body, retriedTime = false } = {}) {
    const { applicationKey, applicationSecret, consumerKey } = getCredentials();
    if (!applicationKey || !applicationSecret || !consumerKey) {
      throw new OvhApiError('OVHcloud API credentials are missing', { kind: ERROR_KINDS.AUTH });
    }
    const url = `${baseUrl()}${path}${queryString(query)}`;
    const payload = body === undefined ? '' : JSON.stringify(body);
    const timestamp = Math.round(now() / 1000) + (await serverTimeDelta());
    const headers = {
      Accept: 'application/json',
      'X-Ovh-Application': applicationKey,
      'X-Ovh-Consumer': consumerKey,
      'X-Ovh-Timestamp': String(timestamp),
      'X-Ovh-Signature': sign({
        applicationSecret,
        consumerKey,
        method,
        url,
        body: payload,
        timestamp,
      }),
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
    }
    const answer = await send(url, { method, headers, ...(payload ? { body: payload } : {}) });

    let data = null;
    if (answer.text) {
      try {
        data = JSON.parse(answer.text);
      } catch {
        data = null;
      }
    }
    if (answer.status >= 200 && answer.status < 300) {
      return data;
    }
    const ovhMessage = typeof data?.message === 'string' ? data.message.slice(0, 300) : '';
    const errorCode = typeof data?.errorCode === 'string' ? data.errorCode : null;
    // A clock that drifted: read the server time again and sign once more.
    if (!retriedTime && /timestamp|query time|time difference/i.test(ovhMessage)) {
      await serverTimeDelta(true);
      return call(method, path, { query, body, retriedTime: true });
    }
    const kind = kindOf(answer.status, `${errorCode ?? ''} ${ovhMessage}`);
    throw new OvhApiError(
      `OVHcloud API answered HTTP ${answer.status} to ${method} ${path.replace(/\/sms\/[^/]+/, '/sms/{serviceName}')}${ovhMessage ? `: ${ovhMessage}` : ''}`,
      { kind, status: answer.status, errorCode, ovhMessage: ovhMessage || null },
    );
  }

  return {
    get: (path, query) => call('GET', path, { query }),
    post: (path, body) => call('POST', path, { body }),
    /** @description Forget the server time (new region or new keys). */
    reset() {
      timeDelta = null;
      timeDeltaAt = 0;
    },
  };
}

export {
  createOvhClient,
  OvhApiError,
  ERROR_KINDS,
  ENDPOINTS,
  DEFAULT_ENDPOINT,
  sign,
  queryString,
  kindOf,
};
