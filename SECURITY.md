# Security policy

LongHome stores personal stories and family media. Please treat security reports with the
care that data deserves.

## Supported versions

Until LongHome publishes its first stable release, security fixes are made on the latest
commit on `main` only.

## Report a vulnerability

Use GitHub's **Report a vulnerability** button in the repository Security tab to open a
private security advisory. Do not include vulnerability details, private data, or an
exploit in a public issue.

Include:

- the affected commit or version;
- reproduction steps using synthetic data;
- the likely impact;
- any suggested mitigation; and
- whether the problem is already public.

Maintainers will acknowledge a complete report as soon as practical, coordinate a fix,
and credit the reporter unless anonymity is requested.

## Self-hosting responsibilities

LongHome does not terminate TLS or manage host security. Operators should:

- put public installations behind HTTPS;
- set a strong `LONGHOME_WRITE_TOKEN`;
- keep `LONGHOME_AI_API_KEY` only in server environment configuration and rotate it if it
  is ever exposed;
- set `LONGHOME_PUBLIC_URL` to the HTTPS origin before creating share links;
- treat invitation links as private credentials and steward links as administrative
  credentials;
- revoke an invitation immediately if its link reaches the wrong person;
- restrict filesystem access to the LongHome data directory;
- keep the container or Node.js runtime updated; and
- maintain tested backups of both the SQLite database and media directory.

When AI assistance is enabled, the selected provider receives the text shown in the
per-request consent dialog. LongHome does not log or persist prompts and discarded drafts,
but cannot control provider-side retention. Operators must review the provider's current
data policy and billing limits. The publishing token also gates AI requests when configured;
do not expose a paid provider on a public installation without that protection.

LongHome stores capability tokens as SHA-256 hashes. The raw invitation or steward link is
shown only when created and cannot be recovered from the database later. A private visitor
receives a 30-day HTTP-only, same-site cookie; every page and media request revalidates the
underlying invitation, so revocation takes effect immediately.

Revocation prevents future LongHome requests; it cannot erase a page or file that an
authorized visitor already saved, photographed, or copied elsewhere.
