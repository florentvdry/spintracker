# Security Policy

## Supported versions

Only the latest release receives security fixes. SpinTracker updates itself automatically; please make sure you are on the [latest version](https://github.com/florentvdry/spintracker/releases/latest).

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: [Report a vulnerability](https://github.com/florentvdry/spintracker/security/advisories/new).

Include:

- a description of the issue and its impact
- steps to reproduce (a minimal proof of concept if possible)
- the affected version and your OS

You can expect an acknowledgement within a few days. We will keep you informed while we investigate and release a fix, and credit you in the release notes if you wish.

## Scope and data privacy

SpinTracker stores everything locally (SQLite in the user data folder) and does not send hand histories anywhere. Issues of particular interest include path traversal in file import, local API (port `5050`) exposure, unsafe update handling and anything that could leak local data.

If your report involves hand history files, **anonymize them** before sharing.
