import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOvhClient, OvhApiError, ERROR_KINDS } from '../src/ovh-api.js';
import {
  createSmsAccount,
  FAILURE_REASONS,
  reasonOf,
  SmsError,
  MAX_MESSAGE_LENGTH,
} from '../src/sms.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeOvh, KEYS } from './helpers/fake-ovh.js';

/**
 * @description An SMS account on a fake OVHcloud.
 * @param {object} [fake] - Options of createFakeOvh.
 * @param {object} [raw] - Raw configuration values on top of the keys.
 * @returns {{ sms: object, ovh: object, waits: number[] }} The account.
 */
function setup(fake = {}, raw = {}) {
  const ovh = createFakeOvh(fake);
  const config = normalizeConfig({ ...KEYS, ...raw });
  const api = createOvhClient({ getCredentials: () => config, transport: ovh.transport });
  const waits = [];
  const sms = createSmsAccount({
    api,
    getConfig: () => config,
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  return { sms, ovh, waits };
}

test('uses the only SMS account and its first enabled sender', async () => {
  const { sms, ovh } = setup({
    senders: {
      MAISON: { sender: 'MAISON', status: 'waitingValidation', type: 'alpha' },
      GLADYS: { sender: 'GLADYS', status: 'enable', type: 'alpha' },
    },
  });
  const report = await sms.send(['+33612345678'], 'The front door is open');
  assert.deepEqual(ovh.jobs(), [
    {
      charset: 'UTF-8',
      message: 'The front door is open',
      receivers: ['+33612345678'],
      noStopClause: true,
      priority: 'high',
      sender: 'GLADYS',
    },
  ]);
  assert.equal(report.sender, 'GLADYS');
  assert.equal(report.creditsUsed, 1);
  assert.equal(report.creditsLeft, 99);
  assert.deepEqual(report.validReceivers, ['+33612345678']);
  // Resolved once: the second SMS goes straight to the jobs.
  const before = ovh.calls.length;
  await sms.send(['+33612345678'], 'Again');
  assert.equal(ovh.calls.length, before + 1);
});

test('without an enabled sender, sends from the short number for replies', async () => {
  const { sms, ovh } = setup({ senders: {} });
  await sms.send(['+33612345678'], 'Hello');
  const [job] = ovh.jobs();
  assert.equal(job.senderForResponse, true);
  assert.equal(job.sender, undefined);
  assert.deepEqual(sms.senderOption(), { senderForResponse: true });
});

test('the configured account and sender win, without listing anything', async () => {
  const { sms, ovh } = setup(
    { services: ['sms-ab12345-1', 'sms-cd67890-1'] },
    { service_name: 'sms-cd67890-1', sender: '+33700000001' },
  );
  await sms.send(['+33612345678'], 'Hello');
  assert.deepEqual(
    ovh.calls.map((call) => `${call.method} ${call.path}`),
    ['GET /auth/time', 'POST /sms/sms-cd67890-1/jobs'],
  );
  assert.equal(ovh.jobs()[0].sender, '+33700000001');
});

test('no SMS account, or several without a choice: no_sms_account', async () => {
  for (const services of [[], ['sms-ab12345-1', 'sms-cd67890-1']]) {
    const { sms, ovh } = setup({ services });
    const err = await sms.send(['+33612345678'], 'Hello').catch((error) => error);
    assert.ok(err instanceof SmsError);
    assert.equal(err.reason, FAILURE_REASONS.NO_SMS_ACCOUNT);
    assert.equal(ovh.jobs().length, 0);
  }
  const { sms } = setup({ services: ['sms-ab12345-1', 'sms-cd67890-1'] });
  const err = await sms.readAccount().catch((error) => error);
  assert.match(err.message, /sms-ab12345-1, sms-cd67890-1/, 'the choices are listed');
});

test('retries 429 and 503 (the job was not created), never another error', async () => {
  const { sms, ovh, waits } = setup({
    jobs: [
      { status: 429, body: { message: 'Too many requests' } },
      { status: 503 },
      { status: 200 },
    ],
  });
  await sms.send(['+33612345678'], 'Hello');
  assert.equal(ovh.jobs().length, 3);
  assert.deepEqual(waits, [2000, 5000]);

  const failing = setup({ jobs: [{ status: 500, body: { message: 'Internal server error' } }] });
  const err = await failing.sms.send(['+33612345678'], 'Hello').catch((error) => error);
  assert.equal(err.reason, FAILURE_REASONS.SERVER_ERROR);
  assert.equal(failing.ovh.jobs().length, 1, 'a 500 may have sent it: no retry');

  const busy = setup({ jobs: [{ status: 429, body: { message: 'Too many requests' } }] });
  const tooMany = await busy.sms.send(['+33612345678'], 'Hello').catch((error) => error);
  assert.equal(tooMany.reason, FAILURE_REASONS.RATE_LIMITED);
  assert.equal(busy.ovh.jobs().length, 3, 'two retries, then the failure');
});

test('refused numbers: a partial send succeeds, a send to none fails', async () => {
  const { sms } = setup();
  const report = await sms.send(['+33612345678', '+33600000000'], 'Hello');
  assert.deepEqual(report.validReceivers, ['+33612345678']);
  assert.deepEqual(report.invalidReceivers, ['+33600000000']);
  const err = await sms.send(['+33600000000'], 'Hello').catch((error) => error);
  assert.equal(err.reason, FAILURE_REASONS.INVALID_NUMBER);
});

test('the reasons of OVHcloud refusals', async () => {
  const cases = [
    [
      { status: 403, body: { message: 'Not enough credits to send this message' } },
      'not_enough_credits',
    ],
    [{ status: 400, body: { message: 'Invalid sender' } }, 'invalid_sender'],
    [{ status: 400, body: { message: 'Invalid receiver: +336' } }, 'invalid_number'],
    [{ status: 400, body: { message: 'Message too long' } }, 'rejected'],
    [
      {
        status: 403,
        body: { errorCode: 'NOT_GRANTED_CALL', message: 'This call has not been granted' },
      },
      'not_granted',
    ],
  ];
  for (const [job, reason] of cases) {
    const { sms } = setup({ jobs: [job] });
    const err = await sms.send(['+33612345678'], 'Hello').catch((error) => error);
    assert.equal(err.reason, reason, job.body.message);
  }
  assert.equal(
    reasonOf(new OvhApiError('x', { kind: ERROR_KINDS.AUTH, status: 403 })),
    'access_denied',
  );
  assert.equal(reasonOf(new OvhApiError('x', { kind: ERROR_KINDS.AUTH })), 'not_configured');
  assert.equal(reasonOf(new OvhApiError('x', { kind: ERROR_KINDS.TIMEOUT })), 'timeout');
  assert.equal(reasonOf(new OvhApiError('x', { kind: ERROR_KINDS.UNREACHABLE })), 'unreachable');
  assert.equal(reasonOf(new Error('boom')), 'unexpected');
});

test('a refused automatic sender is resolved again on the next SMS', async () => {
  const { sms, ovh } = setup({
    jobs: [{ status: 400, body: { message: 'Invalid sender' } }, { status: 200 }],
  });
  await sms.send(['+33612345678'], 'Hello').catch(() => {});
  ovh.state.senders = { NEW: { sender: 'NEW', status: 'enable' } };
  await sms.send(['+33612345678'], 'Hello');
  assert.equal(ovh.jobs().at(-1).sender, 'NEW');
});

test('an empty text or no number never reaches OVHcloud; a very long text is cut', async () => {
  const { sms, ovh } = setup();
  assert.equal((await sms.send([], 'Hello').catch((e) => e)).reason, 'invalid_number');
  assert.equal((await sms.send(['+33612345678'], '  ').catch((e) => e)).reason, 'rejected');
  assert.equal(ovh.jobs().length, 0);
  await sms.send(['+33612345678'], 'x'.repeat(5000));
  assert.equal(ovh.jobs()[0].message.length, MAX_MESSAGE_LENGTH);
});

test('reads the credits and the received SMS, with their dates in UTC', async () => {
  const { sms } = setup({
    account: { creditsLeft: 12.5, status: 'enable', description: 'Maison' },
    incoming: [
      {
        id: 7,
        sender: '+33612345678',
        message: 'Statut',
        creationDatetime: '2026-10-16T10:00:00+02:00',
      },
    ],
  });
  assert.deepEqual(await sms.readAccount(), {
    serviceName: 'sms-ab12345-1',
    creditsLeft: 12.5,
    status: 'enable',
    description: 'Maison',
  });
  assert.deepEqual(await sms.listIncoming('2026-10-16T07:00:00.000Z'), [7]);
  assert.deepEqual(await sms.listIncoming('2026-10-16T09:00:00.000Z'), []);
  assert.deepEqual(await sms.getIncoming(7), {
    id: 7,
    sender: '+33612345678',
    message: 'Statut',
    receivedAt: '2026-10-16T08:00:00.000Z',
    tag: null,
  });
});
