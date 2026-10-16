// -----------------------------------------------------------------------------
// Entry point of the OVHcloud SMS external integration.
//
// Sends the notifications of Gladys by SMS through the OVHcloud SMS API
// (cloud, signed API calls):
//   - communication channel (send-only): each user enters their phone number
//     in the "My account" block, Gladys hands it with every message;
//   - scene triggers: SMS not sent, SMS received, credits low;
//   - scene actions: send an SMS to any number, read the account;
//   - dashboard widgets: SMS account, SMS received.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the OVHcloud SMS integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
