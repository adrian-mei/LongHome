# LongHome

[![CI](https://github.com/adrian-mei/LongHome/actions/workflows/ci.yml/badge.svg)](https://github.com/adrian-mei/LongHome/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-344a3d.svg)](LICENSE)

**One person. One permanent page. Their story, preserved and controlled by their family.**

LongHome is open-source software for hosting quiet, durable memorial pages. A memorial
starts with a name and at least one photograph. Birth and end dates, a written story, and
videos are all optional.

LongHome is a standalone personal project. It is not part of the Cogito product stack.

## What works today

- Create a memorial from one simple upload form.
- Require at least one photo; accept up to 12.
- Add optional birth and end dates, a story, and up to 4 videos.
- Publish a stable memorial URL.
- Choose public, unlisted, or private access for each memorial.
- Create separate invitation links for private family and friend groups.
- Protect private photographs and videos as well as the memorial page.
- Use a private steward link to change visibility or revoke invitations.
- Browse every public memorial hosted on an installation.
- Keep all metadata and media in one portable data directory.
- Optionally protect publishing with a shared write token.

## Access model

| Visibility | Directory | Search engines | Visitor access |
| --- | --- | --- | --- |
| Public | Listed | Allowed | Everyone |
| Unlisted | Hidden | `noindex` | Anyone with the memorial URL |
| Private | Hidden | `noindex` | Active invitation or steward capability required |

Private memorials use opaque URLs that do not contain the person's name. Their media is
served through the same authorization check as the page. LongHome creates revocable
invitation links but does not send email; the family steward shares each link directly.

## Self-host with Docker

```bash
git clone https://github.com/adrian-mei/LongHome.git
cd LongHome
cp .env.example .env
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). LongHome stores its SQLite database
and uploaded media in `./data`. Back up that directory to preserve the entire instance.

For an internet-facing installation, set a strong `LONGHOME_WRITE_TOKEN` in `.env`, place
LongHome behind HTTPS, set `LONGHOME_PUBLIC_URL` to the external origin, and back up
`./data` regularly.

## Run locally

LongHome requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run build
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `LONGHOME_DATA_DIR` | `./data` | SQLite database and uploaded media |
| `LONGHOME_HTTP_PORT` | `3000` | Host port used by Docker Compose |
| `LONGHOME_HOST` | `0.0.0.0` | Listening address |
| `LONGHOME_PORT` | `3000` | HTTP port |
| `LONGHOME_PUBLIC_URL` | derived from request | External origin used in invite links |
| `LONGHOME_WRITE_TOKEN` | unset | Optional token required to publish |
| `LONGHOME_MAX_PHOTO_MB` | `15` | Per-photo upload limit |
| `LONGHOME_MAX_VIDEO_MB` | `250` | Per-video upload limit |

## Project boundary

LongHome is self-hosted software first. A managed service may come later, but there is no
managed hosting product today. Read the [product boundary](docs/PRODUCT.md) for the MVP
contract and ethical guardrails.

## Capability-link safety

Invitation and steward links are bearer capabilities: possession grants access. Share
them through a trusted channel. The steward link can create or revoke invitations and
change visibility, so keep it separate from visitor invitations. LongHome stores only
token hashes and cannot reveal an existing link again.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development
workflow, Conventional Commit style, and pull-request gate. Automated contributors can
start with [llms.txt](llms.txt).

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), and
follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.

## License

[MIT](LICENSE)
