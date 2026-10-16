# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** that sends the notifications of
Gladys by SMS through the OVHcloud SMS API: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. A send-only communication integration
(`type: "communication"`, `messaging: { receive: false }`): the OVHcloud API
keys, the SMS account and the sender in the `config_schema` (administrator),
the phone number of each user in the `contact_schema`. On top: scene triggers,
scene actions and dashboard widgets. Transport: cloud only (signed calls to
`eu.api.ovh.com` or `ca.api.ovh.com`).

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); timers
src/ovh-api.js          signed OVHcloud API client (server time, error kinds)
src/sms.js              the SMS account: resolve account and sender, send, credits,
                        received SMS, failure reasons (SmsError)
src/phone.js            typed phone numbers -> international format, masking
src/store.js            /data/state.json: month counters, low credits state,
                        cursor and ids of the received SMS, last SMS for the inbox
src/events.js           scene triggers sms_not_sent (transitions), sms_received
src/widgets.js          account and inbox dashboard widgets
src/config.js           configuration and per-user contact values
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **Keys are forever**: every key users store — `config_schema` and
  `contact_schema` keys and types (`phone_number`!), the endpoint values,
  the Configuration screen buttons, widget keys, scene triggers (fields,
  options, variables), scene actions (fields, outputs) and the failure reasons
  (`FAILURE_REASONS` in `src/sms.js`, stored by scenes filtering on them).
  `test/structure.test.js` compares them to
  `test/fixtures/manifest.baseline.json` (0.1.0): never update the baseline to
  make a test pass without a documented migration.
- **Signature**: `"$1$" + sha1(AS+CK+METHOD+URL+BODY+TIMESTAMP)`, the URL with
  its query string, the body exactly as sent, the timestamp of the OVHcloud
  server (`GET /auth/time`, read again when OVHcloud refuses a timestamp).
  `test/ovh-api.test.js` holds reference signatures computed with Python.
- **Secrets**: the application secret and the consumer key never appear in a
  log line, an error message, a scene event or a URL. Phone numbers are masked
  in the logs and in `sms_not_sent` (`maskPhone`).
- **Retries**: a send is retried only on 429 and 503 (the job was not created).
  Never on a timeout or another 5xx: a duplicate alert is worse than a
  reported failure.
- **Rights of the consumer key**: `GET /sms`, `GET /sms/*`, `POST /sms/*/jobs`
  (the pre-filled links of the manifest). A new endpoint means new rights:
  update the links, the docs, and tell users to create a new key.
- **Scene events**: `sms_not_sent` fires once per scope (the account, or a
  refused number) until an SMS goes through; `credits_low` once below the
  threshold, armed again above it, state kept in /data; `sms_received` once
  per SMS, the history present when the reception is turned on never fires. A
  scene ACTION never fires a trigger. Flat scalar data, declared keys only.
- **Received SMS never reach the brain** (`publishMessage` is refused to a
  send-only channel, and an SMS sender can be forged): scene trigger and
  inbox widget only. Docs warn never to open a door or disarm an alarm with
  them.
- **Widgets never call OVHcloud**: they read what the integration knows.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): a widget button
  with a form would need 5.2.0. Transport: `["cloud"]`.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake OVHcloud of
  `test/helpers/fake-ovh.js`).
