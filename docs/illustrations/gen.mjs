// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a made-up SMS account (fixed date): credits close to
// the low credits threshold, the SMS of the month, the reception on, and the
// last SMS received. Every number and text is made up; the contents around
// them come from src/widgets.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildAccountWidget, buildInboxWidget } = await load('src/widgets.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Thursday 15 October 2026, 20:00 in Paris.
const NOW = Date.parse('2026-10-15T18:00:00Z');
const MINUTE = 60000;

const snapshot = {
  account: { serviceName: 'sms-ab12345-1', creditsLeft: 31.5, status: 'enable', description: null },
  readAt: NOW - 4 * MINUTE,
  readFailure: null,
  sender: { sender: 'GLADYS' },
  lastFailure: { reason: 'invalid_number', at: NOW - 26 * 60 * MINUTE },
  counters: { month: '2026-10', sent: 47, creditsUsed: 52.5, received: 6 },
  threshold: 20,
  receiveSms: true,
};

// The SMS received, per language (people answer in their own language).
const TEXTS = {
  en: ['STATUS', 'Is the alarm on? I left in a hurry', 'Thanks, all good here!'],
  fr: ['STATUT', "L'alarme est bien activée ? Je suis parti vite", 'Merci, tout va bien ici !'],
  de: ['STATUS', 'Ist die Alarmanlage an? Ich bin schnell los', 'Danke, hier ist alles gut!'],
  es: ['ESTADO', '¿Está activada la alarma? Salí con prisa', '¡Gracias, todo bien por aquí!'],
};
const messages = (language) =>
  TEXTS[language].map((message, index) => ({
    id: 300 - index,
    sender: ['+33612345678', '+33698765432', '+32470123456'][index],
    message,
    receivedAt: new Date(NOW - [12, 95, 1500][index] * MINUTE).toISOString(),
  }));

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    account: buildAccountWidget({ snapshot, language, now: NOW }),
    inbox: buildInboxWidget({
      messages: messages(language),
      received: snapshot.counters.received,
      receiveSms: true,
      language,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
