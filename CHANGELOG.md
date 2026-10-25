# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.2.0] - 2026-10-25

### Added

- require Gladys 5.3 and declare catalog keywords ([d066b4a](https://github.com/William-De71/gladys-ovhcloud-sms/commit/d066b4a89336cb02262a0bf8ad1e05788dcdb7e5))

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([81d7ab6](https://github.com/William-De71/gladys-ovhcloud-sms/commit/81d7ab69b140a84425698d9573155016ea9c0415))

## [0.1.0] - 2026-10-16

### Added

- Gladys notifications by SMS through the OVHcloud SMS API, to any operator: each user enters their mobile number in the "My account" block, the administrator the OVHcloud API keys once.
- Automatic choice of the SMS account and of the sender (the first enabled one, or the short number for replies), or the ones of the configuration; national numbers get the default country code.
- Scene triggers: SMS not sent (once per failure, never looping), SMS received (with filters on the sender and the first word), credits low.
- Scene actions: send an SMS to any number (even someone who is not a Gladys user), read the SMS account.
- Dashboard widgets: the SMS account (credits, SMS of the month, sender, last failure) and the SMS received.
- Configuration screen buttons: test the connection, send a test SMS.
- Cloud transport only, signed OVHcloud API calls; English, French, German and Spanish everywhere.

[0.2.0]: https://github.com/William-De71/gladys-ovhcloud-sms/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/William-De71/gladys-ovhcloud-sms/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-ovhcloud-sms/releases/tag/v0.1.0
