// -----------------------------------------------------------------------------
// The OVHcloud SMS account, through the API:
//
//   GET  /sms                                the SMS accounts ("service names")
//   GET  /sms/{serviceName}                  credits left, status
//   GET  /sms/{serviceName}/senders          the senders of the account
//   GET  /sms/{serviceName}/senders/{sender} one sender (status enable, ...)
//   POST /sms/{serviceName}/jobs             send an SMS
//   GET  /sms/{serviceName}/incoming         ids of the SMS received
//   GET  /sms/{serviceName}/incoming/{id}    one SMS received
//
// The account and the sender are resolved once, then kept until the
// configuration changes: an empty "service name" means the only SMS account
// of the OVHcloud account, an empty "sender" the first enabled sender, or
// failing that the short number OVHcloud uses for SMS that accept replies
// (`senderForResponse`).
// -----------------------------------------------------------------------------

import { ERROR_KINDS, OvhApiError } from './ovh-api.js';

// Why an SMS was not sent, as the `reason` of an SmsError and of the
// `sms_not_sent` scene trigger. Scenes store these values: never rename one.
const FAILURE_REASONS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  ACCESS_DENIED: 'access_denied',
  NOT_GRANTED: 'not_granted',
  NO_SMS_ACCOUNT: 'no_sms_account',
  NOT_ENOUGH_CREDITS: 'not_enough_credits',
  INVALID_NUMBER: 'invalid_number',
  INVALID_SENDER: 'invalid_sender',
  REJECTED: 'rejected',
  RATE_LIMITED: 'rate_limited',
  SERVER_ERROR: 'server_error',
  TIMEOUT: 'timeout',
  UNREACHABLE: 'unreachable',
  UNEXPECTED: 'unexpected',
});

// Pauses before retrying a send OVHcloud answered 429 (too many calls) or 503
// (service unavailable): the job was not created, so a retry cannot deliver it
// twice. Never a timeout or another 5xx: the SMS may have left.
const RETRY_DELAYS_MS = [2 * 1000, 5 * 1000];
const RETRYABLE_STATUSES = new Set([429, 503]);

// Longest text of one job. OVHcloud joins the parts of a long SMS (each part
// costs credits); past this, the text is cut instead of being refused.
const MAX_MESSAGE_LENGTH = 1600;

/**
 * @description An SMS that was not sent, with the reason.
 */
class SmsError extends Error {
  /**
   * @param {string} message - Readable message, in English, without any credential.
   * @param {object} details - Details.
   * @param {string} details.reason - One of FAILURE_REASONS.
   * @param {number|null} [details.status] - HTTP status, when OVHcloud answered.
   * @param {Error} [details.cause] - Underlying error.
   */
  constructor(message, { reason, status = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SmsError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * @description The failure reason of an OVHcloud API error.
 * @param {Error} err - An OvhApiError (or anything else).
 * @returns {string} One of FAILURE_REASONS.
 * @example
 * reasonOf(new OvhApiError('x', { kind: 'rate_limited', status: 429 })); // -> 'rate_limited'
 */
function reasonOf(err) {
  if (err instanceof SmsError) {
    return err.reason;
  }
  if (!(err instanceof OvhApiError)) {
    return FAILURE_REASONS.UNEXPECTED;
  }
  const message = err.ovhMessage ?? '';
  if (/credit/i.test(message)) {
    return FAILURE_REASONS.NOT_ENOUGH_CREDITS;
  }
  switch (err.kind) {
    case ERROR_KINDS.AUTH:
      return err.status === null ? FAILURE_REASONS.NOT_CONFIGURED : FAILURE_REASONS.ACCESS_DENIED;
    case ERROR_KINDS.FORBIDDEN:
      return FAILURE_REASONS.NOT_GRANTED;
    case ERROR_KINDS.NOT_FOUND:
      return FAILURE_REASONS.NO_SMS_ACCOUNT;
    case ERROR_KINDS.BAD_REQUEST:
      if (/sender/i.test(message)) {
        return FAILURE_REASONS.INVALID_SENDER;
      }
      if (/receiver|number/i.test(message)) {
        return FAILURE_REASONS.INVALID_NUMBER;
      }
      return FAILURE_REASONS.REJECTED;
    case ERROR_KINDS.RATE_LIMITED:
      return FAILURE_REASONS.RATE_LIMITED;
    case ERROR_KINDS.SERVER:
      return FAILURE_REASONS.SERVER_ERROR;
    case ERROR_KINDS.TIMEOUT:
      return FAILURE_REASONS.TIMEOUT;
    case ERROR_KINDS.UNREACHABLE:
      return FAILURE_REASONS.UNREACHABLE;
    default:
      return FAILURE_REASONS.UNEXPECTED;
  }
}

/**
 * @description Wrap any failure into an SmsError.
 * @param {Error} err - The failure.
 * @returns {SmsError} The SmsError.
 */
function toSmsError(err) {
  if (err instanceof SmsError) {
    return err;
  }
  return new SmsError(err.message, {
    reason: reasonOf(err),
    status: typeof err.status === 'number' ? err.status : null,
    cause: err,
  });
}

/**
 * @description A number of credits, or null when unknown.
 * @param {any} value - The raw value.
 * @returns {number|null} The credits.
 */
function credits(value) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
}

/**
 * @description Wait for a given time.
 * @param {number} ms - Milliseconds.
 * @returns {Promise<void>} Resolves after `ms`.
 */
const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * @description Create the SMS account handle.
 * @param {object} options - Options.
 * @param {object} options.api - createOvhClient.
 * @param {Function} options.getConfig - `() => normalizeConfig(...)`.
 * @param {Function} [options.wait] - `(ms) => Promise` (tests).
 * @param {number[]} [options.retryDelaysMs] - Pauses before the retries (tests).
 * @returns {object} The account.
 * @example
 * const account = createSmsAccount({ api, getConfig: () => config });
 * await account.send(['+33612345678'], 'Hello');
 */
function createSmsAccount({ api, getConfig, wait = sleep, retryDelaysMs = RETRY_DELAYS_MS }) {
  let serviceName = null;
  // { sender } or { senderForResponse: true }, resolved once.
  let senderOption = null;

  /**
   * @description The SMS account to use: the configured one, or the only one.
   * @returns {Promise<string>} The service name.
   */
  async function resolveService() {
    if (serviceName) {
      return serviceName;
    }
    const configured = getConfig().serviceName;
    if (configured) {
      serviceName = configured;
      return serviceName;
    }
    const services = await api.get('/sms');
    if (!Array.isArray(services) || services.length === 0) {
      throw new SmsError('This OVHcloud account has no SMS account (order an SMS pack first)', {
        reason: FAILURE_REASONS.NO_SMS_ACCOUNT,
      });
    }
    if (services.length > 1) {
      throw new SmsError(
        `This OVHcloud account has ${services.length} SMS accounts: enter the one to use in the configuration (${services.join(', ')})`,
        { reason: FAILURE_REASONS.NO_SMS_ACCOUNT },
      );
    }
    [serviceName] = services;
    return serviceName;
  }

  const servicePath = async () => `/sms/${encodeURIComponent(await resolveService())}`;

  /**
   * @description The senders of the account, with their status.
   * @returns {Promise<Array<{ sender: string, status: string, type: string|null }>>} The senders.
   */
  async function listSenders() {
    const base = await servicePath();
    const names = await api.get(`${base}/senders`);
    const list = [];
    for (const name of Array.isArray(names) ? names : []) {
      const detail = await api.get(`${base}/senders/${encodeURIComponent(name)}`);
      list.push({
        sender: String(detail?.sender ?? name),
        status: String(detail?.status ?? ''),
        type: typeof detail?.type === 'string' ? detail.type : null,
      });
    }
    return list;
  }

  /**
   * @description The sender of the SMS: the configured one, the first enabled
   * one, or the short number for replies.
   * @returns {Promise<object>} `{ sender }` or `{ senderForResponse: true }`.
   */
  async function resolveSender() {
    if (senderOption) {
      return senderOption;
    }
    const configured = getConfig().sender;
    if (configured) {
      senderOption = { sender: configured };
      return senderOption;
    }
    const enabled = (await listSenders()).find((entry) => entry.status === 'enable');
    senderOption = enabled ? { sender: enabled.sender } : { senderForResponse: true };
    return senderOption;
  }

  /**
   * @description Read the account: credits and status.
   * @returns {Promise<{ serviceName: string, creditsLeft: number|null, status: string|null, description: string|null }>} The account.
   */
  async function readAccount() {
    try {
      const data = await api.get(await servicePath());
      return {
        serviceName,
        creditsLeft: credits(data?.creditsLeft),
        status: typeof data?.status === 'string' ? data.status : null,
        description:
          typeof data?.description === 'string' && data.description ? data.description : null,
      };
    } catch (err) {
      throw toSmsError(err);
    }
  }

  /**
   * @description Send one SMS to one or several numbers.
   * @param {string[]} receivers - Numbers in international format.
   * @param {string} message - The text.
   * @returns {Promise<{ ids: number[], validReceivers: string[], invalidReceivers: string[], creditsUsed: number|null, creditsLeft: number|null, sender: string|null }>} The report.
   */
  async function send(receivers, message) {
    if (!Array.isArray(receivers) || receivers.length === 0) {
      throw new SmsError('No phone number to send the SMS to', {
        reason: FAILURE_REASONS.INVALID_NUMBER,
      });
    }
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new SmsError('The SMS text is empty', { reason: FAILURE_REASONS.REJECTED });
    }
    let base;
    let senderPart;
    try {
      base = await servicePath();
      senderPart = await resolveSender();
    } catch (err) {
      throw toSmsError(err);
    }
    const text =
      message.length > MAX_MESSAGE_LENGTH
        ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
        : message;
    const body = {
      charset: 'UTF-8',
      message: text,
      receivers,
      // Notifications of a home are not advertising: no "STOP" mention
      // appended to every SMS.
      noStopClause: true,
      priority: 'high',
      ...senderPart,
    };

    for (let attempt = 0; ; attempt += 1) {
      try {
        const report = await api.post(`${base}/jobs`, body);
        const invalidReceivers = Array.isArray(report?.invalidReceivers)
          ? report.invalidReceivers.map(String)
          : [];
        const validReceivers = Array.isArray(report?.validReceivers)
          ? report.validReceivers.map(String)
          : receivers.filter((receiver) => !invalidReceivers.includes(receiver));
        if (validReceivers.length === 0) {
          throw new SmsError('OVHcloud refused every phone number of the SMS', {
            reason: FAILURE_REASONS.INVALID_NUMBER,
          });
        }
        return {
          ids: Array.isArray(report?.ids) ? report.ids : [],
          validReceivers,
          invalidReceivers,
          creditsUsed: credits(report?.totalCreditsRemoved),
          creditsLeft: credits(report?.creditsLeft),
          sender: senderPart.sender ?? null,
        };
      } catch (err) {
        if (
          err instanceof OvhApiError &&
          RETRYABLE_STATUSES.has(err.status) &&
          attempt < retryDelaysMs.length
        ) {
          await wait(retryDelaysMs[attempt]);
          continue;
        }
        // A refused sender may have been removed since it was resolved.
        if (reasonOf(err) === FAILURE_REASONS.INVALID_SENDER && !getConfig().sender) {
          senderOption = null;
        }
        throw toSmsError(err);
      }
    }
  }

  /**
   * @description The ids of the SMS received since an instant.
   * @param {string} fromIso - ISO date.
   * @returns {Promise<number[]>} The ids.
   */
  async function listIncoming(fromIso) {
    const ids = await api.get(`${await servicePath()}/incoming`, {
      'creationDatetime.from': fromIso,
    });
    return Array.isArray(ids) ? ids.filter((id) => Number.isFinite(Number(id))).map(Number) : [];
  }

  /**
   * @description One SMS received.
   * @param {number} id - Its id.
   * @returns {Promise<{ id: number, sender: string, message: string, receivedAt: string|null, tag: string|null }>} The SMS.
   */
  async function getIncoming(id) {
    const data = await api.get(`${await servicePath()}/incoming/${id}`);
    // OVHcloud dates carry the offset of Paris ("…+02:00"): kept in UTC so
    // that they compare as strings.
    const date = new Date(data?.creationDatetime ?? NaN);
    return {
      id: Number(data?.id ?? id),
      sender: String(data?.sender ?? ''),
      message: String(data?.message ?? ''),
      receivedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      tag: typeof data?.tag === 'string' && data.tag ? data.tag : null,
    };
  }

  return {
    resolveService,
    resolveSender,
    listSenders,
    readAccount,
    send,
    listIncoming,
    getIncoming,
    /** @returns {string|null} The service name once resolved. */
    serviceName: () => serviceName,
    /** @returns {object|null} The sender once resolved. */
    senderOption: () => senderOption,
    /** @description Forget the account and the sender (configuration changed). */
    reset() {
      serviceName = null;
      senderOption = null;
    },
  };
}

export {
  createSmsAccount,
  SmsError,
  FAILURE_REASONS,
  reasonOf,
  toSmsError,
  MAX_MESSAGE_LENGTH,
  RETRY_DELAYS_MS,
};
