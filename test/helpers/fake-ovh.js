// -----------------------------------------------------------------------------
// A fake OVHcloud API, as the transport of src/ovh-api.js: it answers the SMS
// endpoints the integration uses and checks every signature the way OVHcloud
// does (sha1 of AS+CK+METHOD+URL+BODY+TIMESTAMP). Nothing touches the network.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

const BASES = {
  'https://eu.api.ovh.com/1.0': 'eu',
  'https://ca.api.ovh.com/1.0': 'ca',
};

const KEYS = Object.freeze({
  application_key: 'my-application-key',
  application_secret: 'my-application-secret',
  consumer_key: 'my-consumer-key',
});

const SERVER_TIME = 1792104706;

/**
 * @description An OVHcloud JSON answer.
 * @param {number} status - HTTP status.
 * @param {any} body - JSON body.
 * @returns {{ status: number, text: string }} The answer.
 */
const answer = (status, body) => ({
  status,
  text: body === undefined ? '' : JSON.stringify(body),
});

/**
 * @description Create the fake API.
 * @param {object} [options] - What it serves.
 * @param {string[]} [options.services] - The SMS accounts.
 * @param {object} [options.account] - GET /sms/{serviceName}.
 * @param {object} [options.senders] - Name -> sender detail.
 * @param {Array} [options.jobs] - Answers of POST jobs, one per call (the last repeats):
 *   `{ status, body }`, or a function of the body.
 * @param {object[]} [options.incoming] - The SMS received: `{ id, sender, message, creationDatetime }`.
 * @param {number} [options.clockOffset] - Seconds the server clock is ahead of the local one.
 * @param {Function} [options.now] - The local clock, `() => ms`.
 * @returns {object} `{ transport, calls, state }`.
 * @example
 * const ovh = createFakeOvh();
 * createApp(gladys, { transport: ovh.transport });
 */
function createFakeOvh({
  services = ['sms-ab12345-1'],
  account = { creditsLeft: 100, status: 'enable', description: '' },
  senders = { GLADYS: { sender: 'GLADYS', status: 'enable', type: 'alpha' } },
  jobs = [{ status: 200 }],
  incoming = [],
  clockOffset = 0,
  now = () => Date.now(),
} = {}) {
  const calls = [];
  const state = { services, account, senders, jobs: [...jobs], incoming, clockOffset, down: null };
  let jobId = 1000;

  /**
   * @description The default report of a send.
   * @param {object} body - The job.
   * @returns {object} The report.
   */
  const report = (body) => {
    const valid = body.receivers.filter((receiver) => !receiver.endsWith('000'));
    const used = valid.length;
    if (typeof state.account.creditsLeft === 'number') {
      state.account = { ...state.account, creditsLeft: state.account.creditsLeft - used };
    }
    return {
      ids: valid.map(() => (jobId += 1)),
      validReceivers: valid,
      invalidReceivers: body.receivers.filter((receiver) => receiver.endsWith('000')),
      totalCreditsRemoved: used,
      creditsLeft: state.account.creditsLeft,
      tag: '',
    };
  };

  /**
   * @description The transport: `(url, init) => Promise<{ status, text }>`.
   * @param {string} url - Full URL.
   * @param {object} init - fetch options.
   * @returns {Promise<{ status: number, text: string }>} The answer.
   */
  async function transport(url, init) {
    const base = Object.keys(BASES).find((prefix) => url.startsWith(prefix));
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/1\.0/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    const call = {
      method: init.method,
      path,
      query: Object.fromEntries(parsed.searchParams),
      body,
    };
    calls.push(call);
    if (!base) {
      throw new Error(`unexpected host ${url}`);
    }
    if (state.down) {
      throw state.down;
    }
    if (path === '/auth/time') {
      return { status: 200, text: String(Math.round(now() / 1000) + state.clockOffset) };
    }

    const headers = init.headers ?? {};
    if (headers['X-Ovh-Application'] !== KEYS.application_key) {
      return answer(403, { errorCode: 'INVALID_CREDENTIAL', message: 'Invalid application key' });
    }
    if (headers['X-Ovh-Consumer'] !== KEYS.consumer_key) {
      return answer(403, {
        errorCode: 'INVALID_CREDENTIAL',
        message: 'This credential does not exist',
      });
    }
    const timestamp = Number(headers['X-Ovh-Timestamp']);
    if (Math.abs(timestamp - (Math.round(now() / 1000) + state.clockOffset)) > 60) {
      return answer(400, { message: 'Invalid timestamp' });
    }
    const expected = `$1$${createHash('sha1')
      .update(
        [
          KEYS.application_secret,
          KEYS.consumer_key,
          init.method,
          url,
          init.body ?? '',
          timestamp,
        ].join('+'),
      )
      .digest('hex')}`;
    if (headers['X-Ovh-Signature'] !== expected) {
      return answer(400, { errorCode: 'INVALID_SIGNATURE', message: 'Invalid signature' });
    }
    call.signed = true;

    if (init.method === 'GET' && path === '/sms') {
      return answer(200, state.services);
    }
    const match = path.match(/^\/sms\/([^/]+)(\/.*)?$/);
    if (!match || !state.services.includes(decodeURIComponent(match[1]))) {
      return answer(404, {
        message: `The requested object (serviceName = ${match?.[1]}) does not exist`,
      });
    }
    const rest = match[2] ?? '';
    if (init.method === 'GET' && rest === '') {
      return answer(200, { name: match[1], ...state.account });
    }
    if (init.method === 'GET' && rest === '/senders') {
      return answer(200, Object.keys(state.senders));
    }
    const sender = rest.match(/^\/senders\/(.+)$/);
    if (init.method === 'GET' && sender) {
      const detail = state.senders[decodeURIComponent(sender[1])];
      return detail ? answer(200, detail) : answer(404, { message: 'not found' });
    }
    if (init.method === 'POST' && rest === '/jobs') {
      const next = state.jobs.length > 1 ? state.jobs.shift() : state.jobs[0];
      if (typeof next === 'function') {
        return next(body);
      }
      return next.status === 200
        ? answer(200, next.body ?? report(body))
        : answer(next.status, next.body);
    }
    if (init.method === 'GET' && rest === '/incoming') {
      const from = parsed.searchParams.get('creationDatetime.from');
      return answer(
        200,
        state.incoming
          .filter((sms) => !from || Date.parse(sms.creationDatetime) >= Date.parse(from))
          .map((sms) => sms.id),
      );
    }
    const received = rest.match(/^\/incoming\/(\d+)$/);
    if (init.method === 'GET' && received) {
      const sms = state.incoming.find((entry) => entry.id === Number(received[1]));
      return sms
        ? answer(200, { credits: 0, tag: '', ...sms })
        : answer(404, { message: 'not found' });
    }
    return answer(404, { message: `no route ${init.method} ${path}` });
  }

  return {
    transport,
    calls,
    state,
    /** @returns {object[]} The POST /jobs bodies. */
    jobs: () =>
      calls
        .filter((call) => call.method === 'POST' && call.path.endsWith('/jobs'))
        .map((call) => call.body),
  };
}

export { createFakeOvh, KEYS, SERVER_TIME };
