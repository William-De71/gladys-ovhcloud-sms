// -----------------------------------------------------------------------------
// The handlers of src/app.js, driven by the fake Gladys of the SDK (the real
// GladysIntegration with an in-memory Gladys, so payloads are checked the way
// the core checks them) against a fake OVHcloud API. Nothing touches the
// network; the state file lives in a temporary directory.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, TEST_MESSAGE } from '../src/app.js';
import { createFakeOvh, KEYS } from './helpers/fake-ovh.js';

const manifest = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const CONTACT = { phone_number: '06 12 34 56 78' };
const MESSAGE = { text: 'The front door is open', file: null };

/**
 * @description A connected fake Gladys running the integration against a fake OVHcloud.
 * @param {object} [options] - Options.
 * @param {object} [options.config] - Configuration values on top of the keys.
 * @param {object} [options.ovh] - Options of createFakeOvh.
 * @param {string} [options.statePath] - The state file (a new temporary one by default).
 * @param {Function} [options.now] - The clock.
 * @returns {Promise<object>} `{ gladys, ovh, app, statePath }`.
 */
async function start({ config = {}, ovh: fake = {}, statePath, now = () => Date.now() } = {}) {
  const path = statePath ?? join(await mkdtemp(join(tmpdir(), 'ovh-sms-')), 'state.json');
  const ovh = createFakeOvh({ now, ...fake });
  const gladys = createFakeGladys({ config: { ...KEYS, ...config } });
  const app = createApp(gladys, {
    transport: ovh.transport,
    statePath: path,
    now,
    wait: async () => {},
    retryDelaysMs: [0, 0],
    timers: false,
  });
  await gladys.connect();
  return { gladys, ovh, app, statePath: path };
}

/**
 * @description Check a scene event against its manifest declaration.
 * @param {object} event - `{ key, data }`.
 */
function assertDeclared(event) {
  const trigger = byKey(manifest.scene_triggers).get(event.key);
  assert.ok(trigger, event.key);
  const variables = trigger.variables.map((variable) => variable.key).sort();
  assert.deepEqual(Object.keys(event.data).sort(), variables, event.key);
  for (const value of Object.values(event.data)) {
    assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
  }
}

test('connects: reads the account and reports credits and sender', async () => {
  const { gladys } = await start();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.fr,
    'Compte SMS sms-ab12345-1 : 100 crédits restants, expéditeur GLADYS.',
  );
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('without keys: disconnected with a message in four languages, no OVHcloud call', async () => {
  const ovh = createFakeOvh();
  const gladys = createFakeGladys({ config: {} });
  createApp(gladys, {
    transport: ovh.transport,
    statePath: '/nonexistent/state.json',
    timers: false,
  });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.deepEqual(Object.keys(gladys.fake.connectionStatus.message).sort(), [
    'de',
    'en',
    'es',
    'fr',
  ]);
  assert.equal(ovh.calls.length, 0);
});

test('refused keys: disconnected, with the reason', async () => {
  const { gladys } = await start({ config: { consumer_key: 'revoked' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refuses the keys/);
});

test('a message goes to the number of the target user, in international format', async () => {
  const { gladys, ovh, app } = await start();
  const ack = await gladys.fake.sendMessage(CONTACT, MESSAGE);
  assert.equal(ack.success, true);
  const [job] = ovh.jobs();
  assert.deepEqual(job.receivers, ['+33612345678']);
  assert.equal(job.message, 'The front door is open');
  assert.equal(app.store.counters().sent, 1);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.ok(gladys.fake.widgetRefreshes.includes('account'));
});

test('a refused SMS fails the message and fires sms_not_sent once, until an SMS goes through', async () => {
  const { gladys, ovh } = await start({
    ovh: { jobs: [{ status: 403, body: { message: 'Not enough credits' } }] },
  });
  for (let i = 0; i < 3; i += 1) {
    const ack = await gladys.fake.sendMessage(CONTACT, MESSAGE);
    assert.equal(ack.success, false);
  }
  assert.equal(gladys.fake.sceneEvents.length, 1);
  const [event] = gladys.fake.sceneEvents;
  assertDeclared(event);
  assert.equal(event.data.reason, 'not_enough_credits');
  assert.equal(event.data.status, 403);
  assert.equal(event.data.phone_number, '+336******78');
  // Credits are back: the next failure fires again.
  ovh.state.jobs = [{ status: 200 }];
  assert.equal((await gladys.fake.sendMessage(CONTACT, MESSAGE)).success, true);
  ovh.state.jobs = [{ status: 403, body: { message: 'Not enough credits' } }];
  await gladys.fake.sendMessage(CONTACT, MESSAGE);
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('a wrong number of a user fires for that number only, without blocking the account', async () => {
  const { gladys } = await start();
  await gladys.fake.sendMessage({ phone_number: 'not a number' }, MESSAGE);
  await gladys.fake.sendMessage({ phone_number: 'not a number' }, MESSAGE);
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.equal(gladys.fake.sceneEvents[0].data.reason, 'invalid_number');
  // Another failure of the account still fires.
  await gladys.fake.sendMessage({ phone_number: '+33600000000' }, MESSAGE);
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('the credits going below the threshold fire credits_low once, armed again after a top-up', async () => {
  const { gladys, ovh } = await start({
    config: { low_credits_threshold: 99 },
    ovh: { account: { creditsLeft: 100, status: 'enable' } },
  });
  await gladys.fake.sendMessage(CONTACT, MESSAGE); // 99: not below
  assert.equal(gladys.fake.sceneEvents.length, 0);
  await gladys.fake.sendMessage(CONTACT, MESSAGE); // 98
  await gladys.fake.sendMessage(CONTACT, MESSAGE); // 97
  const low = gladys.fake.sceneEvents.filter((event) => event.key === 'credits_low');
  assert.equal(low.length, 1);
  assertDeclared(low[0]);
  assert.deepEqual(low[0].data, { credits_left: 98, threshold: 99, service_name: 'sms-ab12345-1' });
  // Top-up, read on the next account reading, then below again.
  ovh.state.account = { creditsLeft: 500, status: 'enable' };
  await gladys.fake.action('test_connection');
  ovh.state.account = { creditsLeft: 50, status: 'enable' };
  await gladys.fake.sceneAction('get_account');
  assert.equal(gladys.fake.sceneEvents.length, 1, 'a scene action never fires a trigger');
});

test('credits_low does not fire again after a restart', async () => {
  const first = await start({
    config: { low_credits_threshold: 50 },
    ovh: { account: { creditsLeft: 10, status: 'enable' } },
  });
  assert.equal(first.gladys.fake.sceneEvents.length, 1);
  await first.app.store.flush();
  const second = await start({
    config: { low_credits_threshold: 50 },
    ovh: { account: { creditsLeft: 10, status: 'enable' } },
    statePath: first.statePath,
  });
  assert.equal(second.gladys.fake.sceneEvents.length, 0);
});

test('the send_sms scene action: several numbers, refused ones reported, declared outputs only', async () => {
  const { gladys, ovh } = await start();
  const ack = await gladys.fake.sceneAction('send_sms', {
    phone_numbers: '06 12 34 56 78, +33600000000, nope',
    message: 'Dinner is ready',
  });
  assert.equal(ack.success, true);
  const outputs = ack.data?.outputs ?? ack.data;
  const declared = byKey(manifest.scene_actions)
    .get('send_sms')
    .outputs.map((o) => o.key);
  assert.deepEqual(Object.keys(outputs).sort(), [...declared].sort());
  assert.equal(outputs.sent_count, 1);
  assert.equal(outputs.invalid_numbers, 'nope, +33600000000');
  assert.equal(outputs.credits_used, 1);
  assert.equal(outputs.credits_left, 99);
  assert.deepEqual(ovh.jobs()[0].receivers, ['+33612345678', '+33600000000']);
  assert.deepEqual(gladys.fake.sceneEvents, []);

  const none = await gladys.fake.sceneAction('send_sms', { phone_numbers: 'nope', message: 'x' });
  assert.equal(none.success, false);
});

test('the get_account scene action returns the credits and the counters', async () => {
  const { gladys } = await start();
  await gladys.fake.sendMessage(CONTACT, MESSAGE);
  const ack = await gladys.fake.sceneAction('get_account');
  const outputs = ack.data?.outputs ?? ack.data;
  assert.deepEqual(outputs, {
    credits_left: 99,
    sent_this_month: 1,
    received_this_month: 0,
    service_name: 'sms-ab12345-1',
  });
});

test('Configuration screen: test the connection, send a test SMS', async () => {
  const { gladys, ovh } = await start({ ovh: { senders: {} } });
  const tested = await gladys.fake.action('test_connection');
  assert.equal(tested.success, true);
  const message = tested.data?.message ?? tested.data;
  assert.match(
    message.fr,
    /sms-ab12345-1 : 100 crédits restants\. Expéditeurs : aucun\. Les SMS partent avec : numéro court/,
  );

  const wrong = await gladys.fake.action('send_test_sms', { phone_number: 'hello' });
  assert.match((wrong.data?.message ?? wrong.data).en, /is not a phone number/);
  assert.equal(ovh.jobs().length, 0);

  const sent = await gladys.fake.action('send_test_sms', { phone_number: '+33 6 12 34 56 78' });
  assert.match(
    (sent.data?.message ?? sent.data).fr,
    /SMS de test envoyé au \+336\*{6}78 \(1 crédit/,
  );
  assert.equal(ovh.jobs()[0].message, TEST_MESSAGE);
});

test('received SMS: history is skipped, each new one fires once, never again after a restart', async () => {
  let clock = Date.parse('2026-10-16T08:00:00Z');
  const incoming = [
    {
      id: 1,
      sender: '+33611111111',
      message: 'old',
      creationDatetime: '2026-10-16T09:55:00+02:00',
    },
  ];
  const first = await start({ config: { receive_sms: true }, ovh: { incoming }, now: () => clock });
  assert.deepEqual(first.gladys.fake.sceneEvents, [], 'the SMS already there is history');

  clock += 60 * 1000;
  incoming.push({
    id: 2,
    sender: '+33612345678',
    message: 'Météo demain ?',
    creationDatetime: '2026-10-16T10:00:30+02:00',
  });
  assert.equal(await first.app.pollIncoming(), 1);
  assert.equal(await first.app.pollIncoming(), 0);
  const [event] = first.gladys.fake.sceneEvents;
  assertDeclared(event);
  assert.deepEqual(event, {
    key: 'sms_received',
    data: {
      sender: '+33612345678',
      message: 'Météo demain ?',
      keyword: 'METEO',
      received_at: '2026-10-16T08:00:30.000Z',
    },
  });
  await first.app.store.flush();

  const second = await start({
    config: { receive_sms: true },
    ovh: { incoming },
    statePath: first.statePath,
    now: () => clock,
  });
  assert.equal(await second.app.pollIncoming(), 0);
  assert.deepEqual(second.gladys.fake.sceneEvents, []);
  const saved = JSON.parse(await readFile(first.statePath, 'utf8'));
  assert.equal(saved.received, 1);
  assert.equal(saved.recentIncoming[0].message, 'Météo demain ?');
});

test('reception off: no SMS read, the inbox says how to turn it on', async () => {
  const { gladys, ovh, app } = await start();
  assert.equal(await app.pollIncoming(), 0);
  assert.ok(!ovh.calls.some((call) => call.path.endsWith('/incoming')));
  const ack = await gladys.fake.widgetGet('inbox', { language: 'fr' });
  assert.match(ack.data.content.components[0].text, /réception des SMS est désactivée/);
});

test('both widgets are valid in every language, from what the integration knows', async () => {
  let clock = Date.parse('2026-10-16T08:00:00Z');
  const incoming = [];
  const { gladys, app, ovh } = await start({
    config: { receive_sms: true, low_credits_threshold: 150 },
    ovh: { incoming },
    now: () => clock,
  });
  incoming.push({
    id: 9,
    sender: '+33612345678',
    message: 'STATUS',
    creationDatetime: '2026-10-16T08:00:10Z',
  });
  clock += 30 * 1000;
  await app.pollIncoming();
  ovh.state.jobs = [{ status: 403, body: { message: 'Not enough credits' } }];
  await gladys.fake.sendMessage(CONTACT, MESSAGE);
  const before = ovh.calls.length;
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of ['account', 'inbox']) {
      const ack = await gladys.fake.widgetGet(key, { language });
      assert.equal(ack.success, true, `${key} ${language}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  assert.equal(ovh.calls.length, before, 'a widget never costs an OVHcloud call');
  const account = (await gladys.fake.widgetGet('account', { language: 'en' })).data.content;
  const credits = account.components.find((component) => component.type === 'value');
  assert.equal(credits.color, 'danger');
  const rows = account.components.find((component) => component.type === 'status').items;
  assert.ok(
    rows.some((row) => row.value === 'Not enough credits' && row.label.startsWith('Failure')),
  );
});

test('turning the reception off forgets the cursor; turning it on again skips the history', async () => {
  const clock = Date.parse('2026-10-16T08:00:00Z');
  const incoming = [
    { id: 3, sender: '+33612345678', message: 'x', creationDatetime: '2026-10-16T07:59:00Z' },
  ];
  const { gladys, app } = await start({
    config: { receive_sms: true },
    ovh: { incoming },
    now: () => clock,
  });
  assert.ok(app.store.incomingCursor());
  await gladys.fake.configUpdated({ ...KEYS, receive_sms: false });
  assert.equal(app.store.incomingCursor(), null);
  await gladys.fake.configUpdated({ ...KEYS, receive_sms: true });
  assert.equal(await app.pollIncoming(), 0);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('refused keys: the received SMS are not read every 30 seconds', async () => {
  const { app, ovh } = await start({ config: { receive_sms: true, consumer_key: 'revoked' } });
  const before = ovh.calls.length;
  assert.equal(await app.pollIncoming(), 0);
  assert.equal(ovh.calls.length, before);
});
