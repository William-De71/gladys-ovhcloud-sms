// -----------------------------------------------------------------------------
// Phone numbers: what users type, what OVHcloud expects, what the logs show.
//
// OVHcloud takes the receivers in international format ("+33612345678";
// "0033612345678" also works). Users type numbers the way they write them:
// "06 12 34 56 78", "+33 (0)6 12-34-56-78", "0033.6.12.34.56.78". A national
// number (one leading 0) gets the default country code of the configuration.
// -----------------------------------------------------------------------------

const MIN_DIGITS = 6;
const MAX_DIGITS = 15; // E.164

/**
 * @description Turn a typed phone number into the international format
 * OVHcloud expects.
 * @param {string} raw - The number as typed.
 * @param {string} [countryCode] - Default country code for a national number, digits only (e.g. '33').
 * @returns {string|null} '+33612345678', or null when it is not a phone number.
 * @example
 * normalizePhone('06 12 34 56 78', '33'); // -> '+33612345678'
 */
function normalizePhone(raw, countryCode = '33') {
  if (typeof raw !== 'string') {
    return null;
  }
  // "+33 (0)6…": the trunk 0 between parentheses is not dialed from abroad.
  let text = raw.trim().replace(/\(0\)/g, '');
  if (!/^\+?[\d\s.\-()/]+$/.test(text)) {
    return null;
  }
  const international = text.startsWith('+') || text.startsWith('00');
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('00')) {
    digits = digits.slice(2);
  } else if (!international) {
    if (!digits.startsWith('0')) {
      return null;
    }
    const code = String(countryCode ?? '').replace(/\D/g, '');
    if (!code) {
      return null;
    }
    digits = `${code}${digits.slice(1)}`;
  }
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS || digits.startsWith('0')) {
    return null;
  }
  return `+${digits}`;
}

/**
 * @description Split a list of numbers typed in one field (comma, semicolon or
 * line break between them) and normalize each one.
 * @param {string} raw - The list as typed.
 * @param {string} [countryCode] - Default country code.
 * @returns {{ valid: string[], invalid: string[] }} The numbers, without duplicates.
 * @example
 * parsePhoneList('06 12 34 56 78, +32470123456', '33');
 * // -> { valid: ['+33612345678', '+32470123456'], invalid: [] }
 */
function parsePhoneList(raw, countryCode) {
  const valid = [];
  const invalid = [];
  String(raw ?? '')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const phone = normalizePhone(part, countryCode);
      if (phone === null) {
        invalid.push(part);
      } else if (!valid.includes(phone)) {
        valid.push(phone);
      }
    });
  return { valid, invalid };
}

/**
 * @description Mask a phone number for the logs and the scene events: enough to
 * tell two numbers apart, not enough to call it.
 * @param {string} phone - The number.
 * @returns {string} The masked number.
 * @example
 * maskPhone('+33612345678'); // -> '+336******78'
 */
function maskPhone(phone) {
  const text = String(phone ?? '');
  if (text.length <= 6) {
    return '****';
  }
  return `${text.slice(0, 4)}${'*'.repeat(text.length - 6)}${text.slice(-2)}`;
}

export { normalizePhone, parsePhoneList, maskPhone };
