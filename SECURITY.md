# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use this repository's **Security → Report a vulnerability** flow to send the maintainers a private report. If that entry is unavailable, contact the primary maintainer through the GitHub profile listed in [MAINTAINERS.md](MAINTAINERS.md) and ask for a private reporting channel without including exploit details publicly.

Include the affected version, impact, reproduction steps, and any proposed mitigation. The maintainer will acknowledge the report and coordinate a disclosure timeline through the private thread.

We take the following seriously:

- Save/schema exploits (data loss, forged saves)
- XSS or injection through imported save JSON or platform callbacks
- Credential leakage in commits or artifacts
- Supply-chain issues in dependencies

## Security posture

- This repository is a **sanitized OSS mirror**. Platform store materials (`store-materials/`), private review URLs, local absolute paths, and credentials are excluded — see `docs/oss/SECURITY_AND_SECRET_AUDIT.md`.
- No API keys, tokens, or platform secrets are committed. Platform adapters call the TapTap runtime `tap` object only.
- Saves live in localStorage; validate all input on load (`src/save/validate.ts`).
- Run `npm audit` before release; dependencies are pinned via `package-lock.json`.
- Dependabot monitors npm and GitHub Actions dependencies through `.github/dependabot.yml`.

## Safe development practices

- Never commit `.env`-style files, tokens, or screen recordings with account data.
- Keep player data exactly-once: offline receipts and order claims must not double-pay.
