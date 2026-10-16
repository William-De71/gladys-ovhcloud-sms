// -----------------------------------------------------------------------------
// Every handler of the OVHcloud SMS integration, registered on the Gladys
// client it receives: index.js passes the real one, the tests the fake Gladys
// of the SDK (`@gladysassistant/integration-sdk/testing`).
//
// A COMMUNICATION integration of the SEND-ONLY family (`messaging: { receive:
// false }`): Gladys notifications go out by SMS through the OVHcloud SMS API.
//   - The OVHcloud keys, the SMS account and the sender are set once by the
//     administrator (`config_schema`); each user enters the phone number their
//     notifications go to (`contact_schema`, "My account" block), which Gladys
//     hands with every message to `onSendMessage`.
//   - SMS received on the account never reach the brain (a send-only channel
//     cannot carry a user's authority, and an SMS sender can be spoofed): they
//     fire the `sms_received` scene trigger, and fill the inbox widget.
//   - Scene triggers sms_not_sent / sms_received / credits_low, scene actions
//     send_sms / get_account, widgets account / inbox, Configuration screen
//     buttons test_connection / send_test_sms.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, hasCredentials, contactPhone } from './config.js';
import { createOvhClient } from './ovh-api.js';
import { createSmsAccount, SmsError, FAILURE_REASONS, toSmsError } from './sms.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { createFailureEvents, receivedPayload, SCENE_TRIGGERS } from './events.js';
import { buildAccountWidget, buildInboxWidget, WIDGETS } from './widgets.js';
import { normalizePhone, parsePhoneList, maskPhone } from './phone.js';
import { t, all, formatNumber } from './i18n.js';

const ACTIONS = Object.freeze({ TEST_CONNECTION: 'test_connection', SEND_TEST: 'send_test_sms' });
const SCENE_ACTIONS = Object.freeze({ SEND_SMS: 'send_sms', GET_ACCOUNT: 'get_account' });

// The account (credits) is read every 15 minutes, and after every send from
// the credits OVHcloud returns. The received SMS are read every 30 seconds
// when the reception is on.
const ACCOUNT_INTERVAL_MS = 15 * 60 * 1000;
const INCOMING_INTERVAL_MS = 30 * 1000;
// The received SMS are listed from a little before the last one handled: the
// clocks of OVHcloud and of Gladys may differ. Ids already handled are skipped.
const INCOMING_MARGIN_MS = 10 * 60 * 1000;

const TEST_MESSAGE = 'Gladys Assistant: OVHcloud SMS test OK';

// Status message of each failure reason (the others: status_error).
const STATUS_OF_REASON = {
  [FAILURE_REASONS.NOT_CONFIGURED]: 'status_not_configured',
  [FAILURE_REASONS.ACCESS_DENIED]: 'status_access_denied',
  [FAILURE_REASONS.NOT_GRANTED]: 'status_not_granted',
  [FAILURE_REASONS.NO_SMS_ACCOUNT]: 'status_no_sms_account',
  [FAILURE_REASONS.RATE_LIMITED]: 'status_rate_limited',
  [FAILURE_REASONS.UNREACHABLE]: 'status_unreachable',
  [FAILURE_REASONS.TIMEOUT]: 'status_unreachable',
};

/**
 * @description Register the handlers of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options (tests).
 * @param {Function} [options.transport] - HTTP transport of the OVHcloud client.
 * @param {string} [options.statePath] - The state file.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.wait] - `(ms) => Promise`, pauses before retries.
 * @param {number[]} [options.retryDelaysMs] - Pauses before the send retries.
 * @param {boolean} [options.timers] - Start the periodic readings (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    transport,
    statePath = DEFAULT_PATH,
    now = () => Date.now(),
    wait,
    retryDelaysMs,
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // What the account widget shows.
  let account = null;
  let readAt = null;
  let readFailure = null;
  let lastFailure = null;
  let lastStatus = null;
  let accountTimer = null;
  let incomingTimer = null;
  let polling = false;

  const api = createOvhClient({
    getCredentials: () => config,
    now,
    ...(transport ? { transport } : {}),
  });
  const sms = createSmsAccount({
    api,
    getConfig: () => config,
    ...(wait ? { wait } : {}),
    ...(retryDelaysMs ? { retryDelaysMs } : {}),
  });
  const store = createStore({ path: statePath, now, logger });
  const failures = createFailureEvents(gladys, logger);

  /**
   * @description Ask the dashboards to fetch the widgets again (fire and forget).
   * @param {string[]} [keys] - The widgets.
   */
  function refreshWidgets(keys = Object.values(WIDGETS)) {
    keys.forEach((key) => {
      Promise.resolve()
        .then(() => gladys.requestWidgetRefresh(key))
        .catch((err) => logger.debug?.(`Widget refresh of ${key} failed: ${err.message}`));
    });
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description The sender as the Configuration screen shows it.
   * @param {object|null} option - `{ sender }` or `{ senderForResponse: true }`.
   * @returns {Function} `(language) => string`.
   */
  const senderText = (option) => (language) => option?.sender ?? t('senderForResponse', language);

  /**
   * @description Compare the credits with the threshold; fire `credits_low`
   * when they go below it.
   * @param {number|null} creditsLeft - Credits left.
   * @param {object} [options] - Options.
   * @param {boolean} [options.fire] - Whether a scene trigger may fire (never for a scene action).
   * @returns {Promise<void>}
   */
  async function checkCredits(creditsLeft, { fire = true } = {}) {
    if (typeof creditsLeft !== 'number') {
      return;
    }
    const low = creditsLeft < config.lowCreditsThreshold;
    if (!fire || low === store.lowCredits()) {
      return;
    }
    await store.setLowCredits(low);
    if (!low) {
      return;
    }
    logger.warn(
      `${creditsLeft} SMS credits left, below the threshold of ${config.lowCreditsThreshold}`,
    );
    try {
      await gladys.publishSceneEvent(SCENE_TRIGGERS.CREDITS_LOW, {
        credits_left: creditsLeft,
        threshold: config.lowCreditsThreshold,
        service_name: sms.serviceName() ?? '',
      });
    } catch (err) {
      logger.warn(`Could not fire ${SCENE_TRIGGERS.CREDITS_LOW}: ${err.message}`);
    }
  }

  /**
   * @description Read the account (credits, sender) and report the status.
   * @param {object} [options] - Options.
   * @param {boolean} [options.fire] - Whether credits_low may fire.
   * @returns {Promise<object|null>} The account, null on failure.
   */
  async function refreshAccount({ fire = true } = {}) {
    if (!hasCredentials(config)) {
      readFailure = FAILURE_REASONS.NOT_CONFIGURED;
      account = null;
      await reportStatus(false, all('noCredentials'));
      refreshWidgets([WIDGETS.ACCOUNT]);
      return null;
    }
    try {
      const read = await sms.readAccount();
      const sender = await sms.resolveSender();
      account = read;
      readAt = now();
      readFailure = null;
      await reportStatus(
        true,
        all('statusConnected', {
          service: read.serviceName,
          credits: (language) => formatNumber(read.creditsLeft, language),
          sender: senderText(sender),
        }),
      );
      await checkCredits(read.creditsLeft, { fire });
      return read;
    } catch (err) {
      const failure = toSmsError(err);
      readFailure = failure.reason;
      logger.warn(`Unable to read the SMS account (${failure.reason}): ${failure.message}`);
      await reportStatus(false, all(STATUS_OF_REASON[failure.reason] ?? 'status_error'));
      return null;
    } finally {
      refreshWidgets([WIDGETS.ACCOUNT]);
    }
  }

  /**
   * @description Take the credits OVHcloud returned after a send.
   * @param {object} report - The send report.
   * @param {object} options - Options.
   * @param {boolean} options.fire - Whether credits_low may fire.
   * @returns {Promise<void>}
   */
  async function afterSend(report, { fire }) {
    await store.recordSent(report.validReceivers.length, report.creditsUsed);
    if (account && typeof report.creditsLeft === 'number') {
      account = { ...account, creditsLeft: report.creditsLeft };
      readAt = now();
      await checkCredits(report.creditsLeft, { fire });
    }
    refreshWidgets([WIDGETS.ACCOUNT]);
  }

  /**
   * @description Read the SMS received since the last reading; fire
   * `sms_received` for each new one.
   * @returns {Promise<number>} The number of new SMS.
   */
  async function pollIncoming() {
    if (!config.receiveSms || !hasCredentials(config) || polling) {
      return 0;
    }
    // Refused keys: the account reading (every 15 minutes, or a new
    // configuration) tells when they work again; no call every 30 s meanwhile.
    if (
      readFailure === FAILURE_REASONS.ACCESS_DENIED ||
      readFailure === FAILURE_REASONS.NOT_GRANTED
    ) {
      return 0;
    }
    polling = true;
    try {
      const cursor = store.incomingCursor();
      if (!cursor) {
        // First reading: what is already there is history, nothing fires.
        const since = new Date(now() - INCOMING_MARGIN_MS).toISOString();
        await store.startIncoming(new Date(now()).toISOString(), await sms.listIncoming(since));
        return 0;
      }
      const since = new Date(Date.parse(cursor) - INCOMING_MARGIN_MS).toISOString();
      const ids = (await sms.listIncoming(since))
        .filter((id) => !store.seen(id))
        .sort((a, b) => a - b);
      for (const id of ids) {
        const received = await sms.getIncoming(id);
        await store.recordIncoming(received);
        logger.info(`SMS received from ${maskPhone(received.sender)}`);
        try {
          await gladys.publishSceneEvent(SCENE_TRIGGERS.SMS_RECEIVED, receivedPayload(received));
        } catch (err) {
          logger.warn(`Could not fire ${SCENE_TRIGGERS.SMS_RECEIVED}: ${err.message}`);
        }
      }
      if (ids.length > 0) {
        refreshWidgets();
      }
      return ids.length;
    } catch (err) {
      logger.warn(`Unable to read the SMS received: ${err.message}`);
      return 0;
    } finally {
      polling = false;
    }
  }

  /**
   * @description (Re)start the periodic readings.
   */
  function schedule() {
    clearInterval(accountTimer);
    clearInterval(incomingTimer);
    accountTimer = null;
    incomingTimer = null;
    if (!timers) {
      return;
    }
    accountTimer = setInterval(() => {
      refreshAccount().catch((err) => logger.error('Account reading failed', err));
    }, ACCOUNT_INTERVAL_MS);
    if (config.receiveSms) {
      incomingTimer = setInterval(() => {
        pollIncoming().catch((err) => logger.error('Reading of the SMS received failed', err));
      }, INCOMING_INTERVAL_MS);
    }
  }

  // --- Outgoing message: Gladys asks us to deliver a notification --------------------
  // A scene "send a message", an alert or a notification routed to a user ends
  // up here, for the users who entered their phone number. `message` is
  // `{ text, file }`: an SMS carries text only, the attachment is dropped.
  gladys.onSendMessage(async (contact, message) => {
    const phone = contactPhone(contact, config.countryCode);
    const receivers = [phone ?? String(contact?.phone_number ?? '')];
    try {
      if (!phone) {
        throw new SmsError('The phone number of the user is not a valid phone number', {
          reason: FAILURE_REASONS.INVALID_NUMBER,
        });
      }
      if (!hasCredentials(config)) {
        throw new SmsError('The OVHcloud API keys are missing in the configuration', {
          reason: FAILURE_REASONS.NOT_CONFIGURED,
        });
      }
      logger.info(`onSendMessage -> SMS to ${maskPhone(phone)}`);
      const report = await sms.send([phone], message?.text);
      failures.sent(receivers);
      await afterSend(report, { fire: true });
    } catch (err) {
      const failure = toSmsError(err);
      logger.warn(
        `SMS to ${maskPhone(receivers[0])} not sent (${failure.reason}): ${failure.message}`,
      );
      lastFailure = { reason: failure.reason, at: now() };
      await failures.failed(receivers, failure);
      refreshWidgets([WIDGETS.ACCOUNT]);
      throw failure;
    }
  });

  // --- Scene actions -------------------------------------------------------------------
  // Their result goes to the scene; they never fire a scene trigger.
  gladys.onSceneAction(SCENE_ACTIONS.SEND_SMS, async (fields = {}) => {
    const { valid, invalid } = parsePhoneList(fields.phone_numbers, config.countryCode);
    if (valid.length === 0) {
      throw new Error('No valid phone number in the action (use +33612345678, one per comma)');
    }
    const report = await sms.send(valid, String(fields.message ?? ''));
    await afterSend(report, { fire: false });
    return {
      sent_count: report.validReceivers.length,
      invalid_numbers: [...invalid, ...report.invalidReceivers].join(', ').slice(0, 1000),
      credits_used: report.creditsUsed ?? 0,
      credits_left: report.creditsLeft ?? account?.creditsLeft ?? 0,
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_ACCOUNT, async () => {
    const read = await refreshAccount({ fire: false });
    if (!read) {
      throw new Error(`Unable to read the SMS account (${readFailure})`);
    }
    const counters = store.counters();
    return {
      credits_left: read.creditsLeft ?? 0,
      sent_this_month: counters.sent,
      received_this_month: counters.received,
      service_name: read.serviceName,
    };
  });

  // --- Configuration screen buttons ----------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    sms.reset();
    try {
      const read = await sms.readAccount();
      const senders = await sms.listSenders();
      const sender = await sms.resolveSender();
      await refreshAccount({ fire: false });
      return all('testOk', {
        service: read.serviceName,
        credits: (language) => formatNumber(read.creditsLeft, language),
        senders: (language) =>
          senders.length > 0
            ? senders.map((entry) => `${entry.sender} (${entry.status})`).join(', ')
            : t('sendersNone', language),
        sender: senderText(sender),
      });
    } catch (err) {
      const failure = toSmsError(err);
      return all(STATUS_OF_REASON[failure.reason] ?? 'status_error');
    }
  });

  gladys.onAction(ACTIONS.SEND_TEST, async (fields = {}) => {
    const typed = String(fields.phone_number ?? '').trim();
    const phone = normalizePhone(typed, config.countryCode);
    if (!phone) {
      return all('invalidPhone', { phone: typed.slice(0, 40) });
    }
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    try {
      const report = await sms.send([phone], TEST_MESSAGE);
      await afterSend(report, { fire: false });
      return all('testSent', {
        phone: maskPhone(phone),
        credits: (language) => formatNumber(report.creditsUsed, language),
      });
    } catch (err) {
      const failure = toSmsError(err);
      return all('testNotSent', {
        reason: (language) => t(`reason_${failure.reason}`, language),
      });
    }
  });

  // --- Dashboard widgets -----------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.ACCOUNT, async ({ language } = {}) =>
    buildAccountWidget({
      snapshot: {
        account,
        readAt,
        readFailure,
        sender: sms.senderOption(),
        lastFailure,
        counters: store.counters(),
        threshold: config.lowCreditsThreshold,
        receiveSms: config.receiveSms,
      },
      language,
      now: now(),
    }),
  );

  gladys.onWidgetGet(WIDGETS.INBOX, async ({ language } = {}) =>
    buildInboxWidget({
      messages: store.recentIncoming(),
      received: store.counters().received,
      receiveSms: config.receiveSms,
      language,
    }),
  );

  // --- Configuration ---------------------------------------------------------------------

  /**
   * @description Read the configuration again.
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      config = normalizeConfig(await gladys.getConfig());
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousThreshold = config.lowCreditsThreshold;
    await loadConfig(rawConfig);
    // New keys, region, account or sender: resolve everything again.
    api.reset();
    sms.reset();
    lastStatus = null;
    if (!config.receiveSms) {
      await store.stopIncoming();
    }
    if (config.lowCreditsThreshold !== previousThreshold) {
      // A new threshold: the next reading compares again from scratch.
      await store.setLowCredits(null);
    }
    logger.info(`Configuration updated (reception of SMS ${config.receiveSms ? 'on' : 'off'})`);
    await refreshAccount();
    await pollIncoming();
    schedule();
    refreshWidgets();
  });

  // --- Connection lifecycle --------------------------------------------------------------
  gladys.on('connected', async () => {
    await loadConfig();
    await store.load();
    lastStatus = null;
    await refreshAccount();
    await pollIncoming();
    schedule();
  });

  // --- Graceful shutdown -----------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    clearInterval(accountTimer);
    clearInterval(incomingTimer);
    await store.flush();
  });

  return {
    getConfig: () => config,
    store,
    sms,
    refreshAccount,
    pollIncoming,
    schedule,
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, TEST_MESSAGE, INCOMING_MARGIN_MS };
