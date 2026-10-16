// -----------------------------------------------------------------------------
// Dashboard widgets of the OVHcloud SMS integration.
//
//   - `account`  the SMS account at a glance: credits left (colored against
//                the low credits threshold), the state of the API, the SMS
//                sent and received by Gladys this month (or the reception
//                off), the sender, the threshold and the last failure;
//   - `inbox`    the last SMS received (virtual number, or replies to the
//                short number), newest first; a tap opens the whole text.
//
// The contents come from what the integration already knows (the last
// reading of the account, /data/state.json): a widget never costs an
// OVHcloud call. Every text exists in the four languages (contents are cached
// per language). Budget of a card: 8 components, 1 main one (card-list), 6
// tiles, 2 texts of which one body, 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { t, ago } from './i18n.js';
import { maskPhone } from './phone.js';

const WIDGETS = Object.freeze({ ACCOUNT: 'account', INBOX: 'inbox' });
const MAX_INBOX_ITEMS = 8;
const TTL = { account: 300, inbox: 60, message: 30 };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The color of the credits tile.
 * @param {number|null} credits - Credits left.
 * @param {number} threshold - Low credits threshold.
 * @returns {string} The color.
 */
function creditsColor(credits, threshold) {
  if (typeof credits !== 'number') {
    return 'neutral';
  }
  if (credits < threshold || credits <= 0) {
    return 'danger';
  }
  return credits < threshold * 2 ? 'warning' : 'success';
}

/**
 * @description The `account` widget.
 * @param {object} options - Options.
 * @param {object} options.snapshot - What the integration knows (app.js `snapshot()`).
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @returns {object} The content.
 * @example
 * buildAccountWidget({ snapshot, language: 'fr', now: Date.now() });
 */
function buildAccountWidget({ snapshot, language, now }) {
  const { account, readAt, readFailure, sender, lastFailure, counters, threshold, receiveSms } =
    snapshot;
  if (!account && !readFailure) {
    return messageContent(t('notReadYet', language));
  }

  const components = [];
  if (account) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: clip(
        t('accountCaption', language, {
          service: account.description ?? account.serviceName,
          ago: ago(readAt, now, language),
        }),
        80,
      ),
    });
    components.push({
      type: 'value',
      value: account.creditsLeft ?? '?',
      label: clip(t('tileCredits', language), 24),
      icon: 'credit-card',
      color: creditsColor(account.creditsLeft, threshold),
    });
  }
  if (account && typeof account.creditsLeft === 'number' && account.creditsLeft < threshold) {
    components.push({ type: 'text', variant: 'body', text: t('creditsLowText', language) });
  }

  const rows = [
    {
      label: t('rowConnection', language),
      value: clip(
        readFailure ? t(`reason_${readFailure}`, language) : t('connectionOk', language),
        40,
      ),
      color: readFailure ? 'danger' : 'success',
    },
  ];
  rows.push({ label: t('rowSent', language), value: counters.sent, color: 'primary' });
  rows.push(
    receiveSms
      ? { label: t('rowReceived', language), value: counters.received, color: 'info' }
      : {
          label: t('rowReception', language),
          value: t('receptionOff', language),
          color: 'neutral',
        },
  );
  if (sender) {
    rows.push({
      label: t('rowSender', language),
      value: clip(sender.sender ?? t('senderShortNumber', language), 40),
      color: 'neutral',
    });
  }
  rows.push({
    label: t('rowThreshold', language),
    value: t('thresholdValue', language, { threshold }),
    color: 'neutral',
  });
  if (lastFailure) {
    rows.push({
      label: clip(t('rowLastFailure', language, { ago: ago(lastFailure.at, now, language) }), 40),
      value: clip(t(`reason_${lastFailure.reason}`, language), 40),
      color: 'warning',
    });
  }
  components.push({ type: 'status', items: rows });

  return { ttl_seconds: TTL.account, components };
}

/**
 * @description The `inbox` widget.
 * @param {object} options - Options.
 * @param {object[]} options.messages - The last SMS received, newest first.
 * @param {number} options.received - SMS received this month.
 * @param {boolean} options.receiveSms - Whether the reception is on.
 * @param {string} options.language - The user language.
 * @returns {object} The content.
 * @example
 * buildInboxWidget({ messages, received: 3, receiveSms: true, language: 'en' });
 */
function buildInboxWidget({ messages, received, receiveSms, language }) {
  if (!receiveSms) {
    return messageContent(t('inboxDisabled', language), TTL.inbox);
  }
  if (messages.length === 0) {
    return messageContent(t('inboxEmpty', language), TTL.inbox);
  }
  return {
    ttl_seconds: TTL.inbox,
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(t('inboxCaption', language, { count: received }), 80),
      },
      {
        type: 'card-list',
        display: 'list',
        // In a list, the date takes the place of the subtitle: the sender
        // goes in the badge, the text in the title and the detail panel.
        items: messages.slice(0, MAX_INBOX_ITEMS).map((sms) => ({
          title: clip(sms.message || '…', 60),
          ...(sms.receivedAt ? { date: sms.receivedAt } : {}),
          badge: { text: clip(sms.sender.length > 16 ? maskPhone(sms.sender) : sms.sender, 16) },
          description: `${sms.sender}\n\n${sms.message}`.slice(0, 2000),
        })),
      },
    ],
  };
}

export { buildAccountWidget, buildInboxWidget, WIDGETS, creditsColor, clip };
