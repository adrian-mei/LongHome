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
- restrict filesystem access to the LongHome data directory;
- keep the container or Node.js runtime updated; and
- maintain tested backups of both the SQLite database and media directory.
