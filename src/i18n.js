// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: the connection status of the Configuration screen, the results of
// its buttons, the widget contents. Vocabulary of the Gladys interface
// (intégration, scène / Szene / escena) and of the OVHcloud Control Panel
// (compte SMS, expéditeur / Absender / remitente, crédits).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // connection status and Configuration screen buttons
  noCredentials: {
    en: 'Enter the application key, the application secret and the consumer key of the OVHcloud API in the configuration.',
    fr: 'Saisissez la clé d’application, le secret d’application et la clé consommateur de l’API OVHcloud dans la configuration.',
    de: 'Geben Sie den Application Key, das Application Secret und den Consumer Key der OVHcloud-API in der Konfiguration ein.',
    es: 'Introduzca la clave de aplicación, el secreto de aplicación y la clave de consumidor de la API de OVHcloud en la configuración.',
  },
  statusConnected: {
    en: 'SMS account {service}: {credits} credits left, sender {sender}.',
    fr: 'Compte SMS {service} : {credits} crédits restants, expéditeur {sender}.',
    de: 'SMS-Konto {service}: {credits} Guthaben übrig, Absender {sender}.',
    es: 'Cuenta SMS {service}: quedan {credits} créditos, remitente {sender}.',
  },
  senderForResponse: {
    en: 'short number for replies',
    fr: 'numéro court pour les réponses',
    de: 'Kurznummer für Antworten',
    es: 'número corto para respuestas',
  },
  status_not_configured: {
    en: 'The OVHcloud API keys are missing in the configuration.',
    fr: 'Les clés de l’API OVHcloud manquent dans la configuration.',
    de: 'Die Schlüssel der OVHcloud-API fehlen in der Konfiguration.',
    es: 'Faltan las claves de la API de OVHcloud en la configuración.',
  },
  status_access_denied: {
    en: 'OVHcloud refuses the keys: check the application key and secret, the region, and that the consumer key was validated and has not expired.',
    fr: 'OVHcloud refuse les clés : vérifiez la clé et le secret d’application, la région, et que la clé consommateur a été validée et n’a pas expiré.',
    de: 'OVHcloud lehnt die Schlüssel ab: Prüfen Sie Application Key und Secret, die Region und ob der Consumer Key bestätigt wurde und nicht abgelaufen ist.',
    es: 'OVHcloud rechaza las claves: compruebe la clave y el secreto de aplicación, la región y que la clave de consumidor se validó y no ha caducado.',
  },
  status_not_granted: {
    en: 'The consumer key lacks rights: create it again with GET /sms, GET /sms/* and POST /sms/*/jobs (link in the configuration).',
    fr: 'La clé consommateur manque de droits : recréez-la avec GET /sms, GET /sms/* et POST /sms/*/jobs (lien dans la configuration).',
    de: 'Dem Consumer Key fehlen Rechte: Erstellen Sie ihn neu mit GET /sms, GET /sms/* und POST /sms/*/jobs (Link in der Konfiguration).',
    es: 'A la clave de consumidor le faltan permisos: vuelva a crearla con GET /sms, GET /sms/* y POST /sms/*/jobs (enlace en la configuración).',
  },
  status_no_sms_account: {
    en: 'No usable SMS account: order an SMS pack on OVHcloud, or enter the right service name (sms-xx12345-1) in the configuration.',
    fr: 'Aucun compte SMS utilisable : commandez un pack SMS chez OVHcloud, ou saisissez le bon nom de service (sms-xx12345-1) dans la configuration.',
    de: 'Kein nutzbares SMS-Konto: Bestellen Sie ein SMS-Paket bei OVHcloud oder geben Sie den richtigen Dienstnamen (sms-xx12345-1) in der Konfiguration ein.',
    es: 'Ninguna cuenta SMS utilizable: contrate un pack de SMS en OVHcloud o introduzca el nombre de servicio correcto (sms-xx12345-1) en la configuración.',
  },
  status_rate_limited: {
    en: 'OVHcloud limits the calls for now: the integration tries again later.',
    fr: 'OVHcloud limite les appels pour le moment : l’intégration réessaie plus tard.',
    de: 'OVHcloud begrenzt die Aufrufe gerade: Die Integration versucht es später erneut.',
    es: 'OVHcloud limita las llamadas por ahora: la integración lo volverá a intentar más tarde.',
  },
  status_unreachable: {
    en: 'The OVHcloud API does not answer: check the internet connection of Gladys.',
    fr: 'L’API OVHcloud ne répond pas : vérifiez la connexion Internet de Gladys.',
    de: 'Die OVHcloud-API antwortet nicht: Prüfen Sie die Internetverbindung von Gladys.',
    es: 'La API de OVHcloud no responde: compruebe la conexión a Internet de Gladys.',
  },
  status_error: {
    en: 'OVHcloud answered something unexpected: see the logs of the integration.',
    fr: 'OVHcloud a répondu quelque chose d’inattendu : voir les journaux de l’intégration.',
    de: 'OVHcloud hat unerwartet geantwortet: siehe Protokolle der Integration.',
    es: 'OVHcloud respondió algo inesperado: consulte los registros de la integración.',
  },
  testOk: {
    en: 'Connected to the SMS account {service}: {credits} credits left. Senders: {senders}. SMS are sent with: {sender}.',
    fr: 'Connecté au compte SMS {service} : {credits} crédits restants. Expéditeurs : {senders}. Les SMS partent avec : {sender}.',
    de: 'Mit dem SMS-Konto {service} verbunden: {credits} Guthaben übrig. Absender: {senders}. SMS werden gesendet mit: {sender}.',
    es: 'Conectado a la cuenta SMS {service}: quedan {credits} créditos. Remitentes: {senders}. Los SMS se envían con: {sender}.',
  },
  sendersNone: { en: 'none', fr: 'aucun', de: 'keine', es: 'ninguno' },
  testSent: {
    en: 'Test SMS sent to {phone} ({credits} credit(s) used).',
    fr: 'SMS de test envoyé au {phone} ({credits} crédit(s) utilisé(s)).',
    de: 'Test-SMS an {phone} gesendet ({credits} Guthaben verbraucht).',
    es: 'SMS de prueba enviado al {phone} ({credits} crédito(s) usado(s)).',
  },
  testNotSent: {
    en: 'The test SMS was not sent: {reason}',
    fr: 'Le SMS de test n’est pas parti : {reason}',
    de: 'Die Test-SMS wurde nicht gesendet: {reason}',
    es: 'El SMS de prueba no se envió: {reason}',
  },
  invalidPhone: {
    en: '“{phone}” is not a phone number: type it with its country code, for example +33612345678.',
    fr: '« {phone} » n’est pas un numéro de téléphone : saisissez-le avec l’indicatif du pays, par exemple +33612345678.',
    de: '„{phone}“ ist keine Telefonnummer: Geben Sie sie mit Ländervorwahl ein, zum Beispiel +4915112345678.',
    es: '«{phone}» no es un número de teléfono: escríbalo con el prefijo del país, por ejemplo +34612345678.',
  },

  // failure reasons, short (widget rows, ≤ 40 characters)
  reason_not_configured: {
    en: 'Keys missing',
    fr: 'Clés manquantes',
    de: 'Schlüssel fehlen',
    es: 'Faltan las claves',
  },
  reason_access_denied: {
    en: 'Keys refused',
    fr: 'Clés refusées',
    de: 'Schlüssel abgelehnt',
    es: 'Claves rechazadas',
  },
  reason_not_granted: {
    en: 'Rights missing on the key',
    fr: 'Droits manquants sur la clé',
    de: 'Rechte fehlen am Schlüssel',
    es: 'Faltan permisos en la clave',
  },
  reason_no_sms_account: {
    en: 'No SMS account',
    fr: 'Aucun compte SMS',
    de: 'Kein SMS-Konto',
    es: 'Ninguna cuenta SMS',
  },
  reason_not_enough_credits: {
    en: 'Not enough credits',
    fr: 'Crédits insuffisants',
    de: 'Zu wenig Guthaben',
    es: 'Créditos insuficientes',
  },
  reason_invalid_number: {
    en: 'Phone number refused',
    fr: 'Numéro refusé',
    de: 'Rufnummer abgelehnt',
    es: 'Número rechazado',
  },
  reason_invalid_sender: {
    en: 'Sender refused',
    fr: 'Expéditeur refusé',
    de: 'Absender abgelehnt',
    es: 'Remitente rechazado',
  },
  reason_rejected: {
    en: 'SMS refused by OVHcloud',
    fr: 'SMS refusé par OVHcloud',
    de: 'SMS von OVHcloud abgelehnt',
    es: 'SMS rechazado por OVHcloud',
  },
  reason_rate_limited: {
    en: 'Too many calls',
    fr: 'Trop d’appels',
    de: 'Zu viele Aufrufe',
    es: 'Demasiadas llamadas',
  },
  reason_server_error: {
    en: 'OVHcloud server error',
    fr: 'Erreur du serveur OVHcloud',
    de: 'Serverfehler bei OVHcloud',
    es: 'Error del servidor de OVHcloud',
  },
  reason_timeout: {
    en: 'No answer in time',
    fr: 'Pas de réponse à temps',
    de: 'Keine Antwort rechtzeitig',
    es: 'Sin respuesta a tiempo',
  },
  reason_unreachable: {
    en: 'OVHcloud unreachable',
    fr: 'OVHcloud injoignable',
    de: 'OVHcloud nicht erreichbar',
    es: 'OVHcloud inaccesible',
  },
  reason_unexpected: {
    en: 'Unexpected answer',
    fr: 'Réponse inattendue',
    de: 'Unerwartete Antwort',
    es: 'Respuesta inesperada',
  },

  // widgets
  accountCaption: {
    en: '{service} · {ago}',
    fr: '{service} · {ago}',
    de: '{service} · {ago}',
    es: '{service} · {ago}',
  },
  tileCredits: { en: 'Credits left', fr: 'Crédits restants', de: 'Guthaben', es: 'Créditos' },
  rowSent: {
    en: 'Sent this month',
    fr: 'Envoyés ce mois-ci',
    de: 'Gesendet diesen Monat',
    es: 'Enviados este mes',
  },
  rowReceived: {
    en: 'Received this month',
    fr: 'Reçus ce mois-ci',
    de: 'Empfangen diesen Monat',
    es: 'Recibidos este mes',
  },
  rowConnection: {
    en: 'OVHcloud API',
    fr: 'API OVHcloud',
    de: 'OVHcloud-API',
    es: 'API de OVHcloud',
  },
  connectionOk: { en: 'Connected', fr: 'Connectée', de: 'Verbunden', es: 'Conectada' },
  rowSender: { en: 'Sender', fr: 'Expéditeur', de: 'Absender', es: 'Remitente' },
  senderShortNumber: {
    en: 'Short number (replies)',
    fr: 'Numéro court (réponses)',
    de: 'Kurznummer (Antworten)',
    es: 'Número corto (respuestas)',
  },
  rowThreshold: {
    en: 'Low credits alert',
    fr: 'Alerte crédits bas',
    de: 'Warnung wenig Guthaben',
    es: 'Aviso de pocos créditos',
  },
  thresholdValue: {
    en: 'below {threshold}',
    fr: 'sous {threshold}',
    de: 'unter {threshold}',
    es: 'por debajo de {threshold}',
  },
  rowReception: {
    en: 'SMS reception',
    fr: 'Réception des SMS',
    de: 'SMS-Empfang',
    es: 'Recepción de SMS',
  },
  receptionOff: { en: 'Off', fr: 'Désactivée', de: 'Aus', es: 'Desactivada' },
  rowLastFailure: {
    en: 'Failure {ago}',
    fr: 'Échec {ago}',
    de: 'Fehler {ago}',
    es: 'Fallo {ago}',
  },
  notReadYet: {
    en: 'The SMS account has not been read yet: come back in a few seconds.',
    fr: 'Le compte SMS n’a pas encore été lu : revenez dans quelques secondes.',
    de: 'Das SMS-Konto wurde noch nicht gelesen: Schauen Sie in ein paar Sekunden wieder vorbei.',
    es: 'La cuenta SMS aún no se ha leído: vuelva en unos segundos.',
  },
  creditsLowText: {
    en: 'Few credits left: top up the SMS account in the OVHcloud Control Panel.',
    fr: 'Il reste peu de crédits : rechargez le compte SMS dans l’espace client OVHcloud.',
    de: 'Nur noch wenig Guthaben: Laden Sie das SMS-Konto im OVHcloud Control Panel auf.',
    es: 'Quedan pocos créditos: recargue la cuenta SMS en el área de cliente de OVHcloud.',
  },
  inboxCaption: {
    en: '{count} received this month',
    fr: '{count} reçu(s) ce mois-ci',
    de: '{count} in diesem Monat empfangen',
    es: '{count} recibido(s) este mes',
  },
  inboxEmpty: {
    en: 'No SMS received since the reception was turned on.',
    fr: 'Aucun SMS reçu depuis l’activation de la réception.',
    de: 'Seit dem Einschalten des Empfangs wurde keine SMS empfangen.',
    es: 'No se ha recibido ningún SMS desde que se activó la recepción.',
  },
  inboxDisabled: {
    en: 'SMS reception is off: turn it on in the configuration of the integration (it needs a virtual number, or replies to the short number).',
    fr: 'La réception des SMS est désactivée : activez-la dans la configuration de l’intégration (il faut un numéro virtuel, ou les réponses au numéro court).',
    de: 'Der SMS-Empfang ist aus: Schalten Sie ihn in der Konfiguration der Integration ein (dafür braucht es eine virtuelle Nummer oder Antworten an die Kurznummer).',
    es: 'La recepción de SMS está desactivada: actívela en la configuración de la integración (necesita un número virtual o las respuestas al número corto).',
  },
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },
};

/**
 * @description Whether a value is one of the four languages.
 * @param {any} value - The value.
 * @returns {boolean} True for en, fr, de or es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('tileCredits', 'fr'); // -> 'Crédits restants'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * Substitutions may be functions of the language.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testSent', { phone: '+336******78', credits: 1 });
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(
        key,
        language,
        Object.fromEntries(
          Object.entries(values).map(([name, value]) => [
            name,
            typeof value === 'function' ? value(language) : value,
          ]),
        ),
      ),
    ]),
  );
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("12,5" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} [digits] - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(12.5, 'fr'); // -> '12,5'
 */
function formatNumber(value, language, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, ago };
