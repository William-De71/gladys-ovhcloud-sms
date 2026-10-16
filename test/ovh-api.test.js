import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createOvhClient,
  sign,
  queryString,
  kindOf,
  OvhApiError,
  ERROR_KINDS,
} from '../src/ovh-api.js';
import { createFakeOvh, KEYS, SERVER_TIME } from './helpers/fake-ovh.js';

const CREDENTIALS = {
  endpoint: 'ovh-eu',
  applicationKey: KEYS.application_key,
  applicationSecret: KEYS.application_secret,
  consumerKey: KEYS.consumer_key,
};

test('signs like the official clients (reference values computed with Python hashlib)', () => {
  assert.equal(
    sign({
      applicationSecret: 'my-application-secret',
      consumerKey: 'my-consumer-key',
      method: 'POST',
      url: 'https://eu.api.ovh.com/1.0/sms/sms-ab12345-1/jobs',
      body: '{"message":"Hi","receivers":["+33612345678"]}',
      timestamp: SERVER_TIME,
    }),
    '$1$6fcf749cc087e89c6bd3880b6eac46561c558994',
  );
  // The query string is part of the signed URL, the body of a GET is empty.
  assert.equal(
    sign({
      applicationSecret: 'my-application-secret',
      consumerKey: 'my-consumer-key',
      method: 'get',
      url: `https://eu.api.ovh.com/1.0/sms/sms-ab12345-1/incoming${queryString({ 'creationDatetime.from': '2026-10-16T08:00:00.000Z' })}`,
      body: '',
      timestamp: SERVER_TIME,
    }),
    '$1$272d615fcc099bff54edd617d6c2c4983f3ae3fb',
  );
});

test('query strings keep only the defined values', () => {
  assert.equal(queryString({}), '');
  assert.equal(queryString({ a: undefined, b: null, c: '' }), '');
  assert.equal(queryString({ tag: 'x y', n: 2 }), '?tag=x+y&n=2');
});

test('reads the server time once, signs with it, and the fake API accepts the signature', async () => {
  const local = Date.UTC(2026, 9, 16, 8, 0, 0);
  const ovh = createFakeOvh({ clockOffset: 125, now: () => local });
  const api = createOvhClient({
    getCredentials: () => CREDENTIALS,
    transport: ovh.transport,
    now: () => local,
  });
  assert.deepEqual(await api.get('/sms'), ['sms-ab12345-1']);
  await api.get('/sms/sms-ab12345-1');
  assert.equal(ovh.calls.filter((call) => call.path === '/auth/time').length, 1);
  assert.ok(ovh.calls.filter((call) => call.path !== '/auth/time').every((call) => call.signed));
});

test('posts the exact JSON it signed, with a JSON content type', async () => {
  const seen = [];
  const ovh = createFakeOvh();
  const api = createOvhClient({
    getCredentials: () => CREDENTIALS,
    transport: async (url, init) => {
      seen.push(init);
      return ovh.transport(url, init);
    },
  });
  await api.post('/sms/sms-ab12345-1/jobs', { message: 'Hi', receivers: ['+33612345678'] });
  const post = seen.find((init) => init.method === 'POST');
  assert.equal(post.headers['Content-Type'], 'application/json');
  assert.equal(post.body, '{"message":"Hi","receivers":["+33612345678"]}');
  assert.ok(ovh.calls.at(-1).signed);
});

test('reads the server time again and signs once more when OVHcloud refuses the timestamp', async () => {
  let local = Date.UTC(2026, 9, 16, 8, 0, 0);
  const ovh = createFakeOvh({ now: () => local });
  const api = createOvhClient({
    getCredentials: () => CREDENTIALS,
    transport: ovh.transport,
    now: () => local,
  });
  await api.get('/sms');
  // The server clock jumps ahead by 10 minutes (or ours drifts back).
  ovh.state.clockOffset = 600;
  local += 1000;
  assert.deepEqual(await api.get('/sms'), ['sms-ab12345-1']);
  assert.equal(ovh.calls.filter((call) => call.path === '/auth/time').length, 2);
});

test('goes to the region of the configuration', async () => {
  const ovh = createFakeOvh();
  const api = createOvhClient({
    getCredentials: () => ({ ...CREDENTIALS, endpoint: 'ovh-ca' }),
    transport: async (url, init) => {
      assert.match(url, /^https:\/\/ca\.api\.ovh\.com\/1\.0\//);
      return ovh.transport(url, init);
    },
  });
  await api.get('/sms');
});

test('turns refusals into error kinds, without any key in the message', async () => {
  const ovh = createFakeOvh();
  const bad = createOvhClient({
    getCredentials: () => ({ ...CREDENTIALS, consumerKey: 'revoked-consumer-key' }),
    transport: ovh.transport,
  });
  const err = await bad.get('/sms').catch((error) => error);
  assert.ok(err instanceof OvhApiError);
  assert.equal(err.kind, ERROR_KINDS.AUTH);
  assert.equal(err.status, 403);
  assert.equal(err.errorCode, 'INVALID_CREDENTIAL');
  assert.doesNotMatch(err.message, /revoked-consumer-key|my-application-secret/);

  const api = createOvhClient({ getCredentials: () => CREDENTIALS, transport: ovh.transport });
  const missing = await api.get('/sms/sms-zz99999-9').catch((error) => error);
  assert.equal(missing.kind, ERROR_KINDS.NOT_FOUND);
  // The service name is not repeated in the message.
  assert.match(missing.message, /GET \/sms\/\{serviceName\}/);
});

test('without keys, never calls OVHcloud', async () => {
  const ovh = createFakeOvh();
  const api = createOvhClient({
    getCredentials: () => ({ endpoint: 'ovh-eu', applicationKey: 'ak' }),
    transport: ovh.transport,
  });
  const err = await api.get('/sms').catch((error) => error);
  assert.equal(err.kind, ERROR_KINDS.AUTH);
  assert.equal(err.status, null);
  assert.equal(ovh.calls.length, 0);
});

test('network failures and timeouts become their own kinds', async () => {
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });
  const down = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  for (const [error, kind] of [
    [timeout, ERROR_KINDS.TIMEOUT],
    [down, ERROR_KINDS.UNREACHABLE],
  ]) {
    const api = createOvhClient({
      getCredentials: () => CREDENTIALS,
      transport: async () => {
        throw error;
      },
    });
    const err = await api.get('/sms').catch((e) => e);
    assert.equal(err.kind, kind);
  }
});

test('error kinds of the HTTP statuses', () => {
  assert.equal(kindOf(401, ''), ERROR_KINDS.AUTH);
  assert.equal(kindOf(403, 'INVALID_CREDENTIAL This credential does not exist'), ERROR_KINDS.AUTH);
  assert.equal(
    kindOf(403, 'NOT_GRANTED_CALL This call has not been granted'),
    ERROR_KINDS.FORBIDDEN,
  );
  assert.equal(kindOf(404, ''), ERROR_KINDS.NOT_FOUND);
  assert.equal(kindOf(400, ''), ERROR_KINDS.BAD_REQUEST);
  assert.equal(kindOf(429, ''), ERROR_KINDS.RATE_LIMITED);
  assert.equal(kindOf(503, ''), ERROR_KINDS.SERVER);
  assert.equal(kindOf(302, ''), ERROR_KINDS.UNEXPECTED);
});
