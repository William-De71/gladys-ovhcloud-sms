# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- Gladys notifications by SMS through the OVHcloud SMS API, to any operator: each user enters their mobile number in the "My account" block, the administrator the OVHcloud API keys once.
- Automatic choice of the SMS account and of the sender (the first enabled one, or the short number for replies), or the ones of the configuration; national numbers get the default country code.
- Scene triggers: SMS not sent (once per failure, never looping), SMS received (with filters on the sender and the first word), credits low.
- Scene actions: send an SMS to any number (even someone who is not a Gladys user), read the SMS account.
- Dashboard widgets: the SMS account (credits, SMS of the month, sender, last failure) and the SMS received.
- Configuration screen buttons: test the connection, send a test SMS.
- Cloud transport only, signed OVHcloud API calls; English, French, German and Spanish everywhere.
