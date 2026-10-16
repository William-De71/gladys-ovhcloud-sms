// -----------------------------------------------------------------------------
// Configuration of the OVHcloud SMS integration.
//
// Two levels, as the manifest declares them:
//   - `config_schema` (the administrator, once for the house): the OVHcloud API
//     region and keys, the SMS account (service name), the sender, the
//     default country code, the low credits threshold and the reception of
//     SMS;
//   - `contact_schema` (each user, in the "My account" block): the phone
//     number their notifications go to. Gladys hands it with every message.
// -----------------------------------------------------------------------------

import { ENDPOINTS, DEFAULT_ENDPOINT } from './ovh-api.js';
import { normalizePhone } from './phone.js';

const DEFAULT_COUNTRY_CODE = '33';
const DEFAULT_LOW_CREDITS = 20;

/**
 * @description A trimmed string, '' for anything else.
 * @param {any} value - The raw value.
 * @returns {string} The string.
 */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @description Normalize the integration configuration.
 * @param {object} [raw] - The raw values (gladys.config).
 * @returns {object} The configuration used by the integration.
 * @example
 * normalizeConfig({ application_key: 'ak', application_secret: 'as', consumer_key: 'ck' });
 */
function normalizeConfig(raw = {}) {
  const endpoint = Object.hasOwn(ENDPOINTS, raw.endpoint) ? raw.endpoint : DEFAULT_ENDPOINT;
  const countryCode = text(raw.country_code).replace(/\D/g, '') || DEFAULT_COUNTRY_CODE;
  const threshold = Number(raw.low_credits_threshold);
  return {
    endpoint,
    applicationKey: text(raw.application_key),
    applicationSecret: text(raw.application_secret),
    consumerKey: text(raw.consumer_key),
    serviceName: text(raw.service_name),
    sender: text(raw.sender),
    countryCode,
    lowCreditsThreshold:
      raw.low_credits_threshold === undefined ||
      raw.low_credits_threshold === null ||
      raw.low_credits_threshold === '' ||
      !Number.isFinite(threshold)
        ? DEFAULT_LOW_CREDITS
        : Math.max(0, threshold),
    receiveSms: raw.receive_sms === true || raw.receive_sms === 'true',
  };
}

/**
 * @description Whether the three API keys are set.
 * @param {object} config - normalizeConfig.
 * @returns {boolean} True when the integration can call OVHcloud.
 * @example
 * hasCredentials(normalizeConfig({})); // -> false
 */
function hasCredentials(config) {
  return Boolean(config.applicationKey && config.applicationSecret && config.consumerKey);
}

/**
 * @description The phone number of a user, from the values of their "My
 * account" block.
 * @param {object} [contact] - The contact_schema values.
 * @param {string} countryCode - Default country code.
 * @returns {string|null} The international number, or null.
 * @example
 * contactPhone({ phone_number: '06 12 34 56 78' }, '33'); // -> '+33612345678'
 */
function contactPhone(contact = {}, countryCode = DEFAULT_COUNTRY_CODE) {
  return normalizePhone(text(contact.phone_number), countryCode);
}

export { normalizeConfig, hasCredentials, contactPhone, DEFAULT_COUNTRY_CODE, DEFAULT_LOW_CREDITS };
