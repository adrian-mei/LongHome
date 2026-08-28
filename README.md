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
- Browse every memorial hosted on an installation.
- Keep all metadata and media in one portable data directory.
- Optionally protect publishing with a shared write token.

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
LongHome behind HTTPS, and back up `./data` regularly.

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
| `LONGHOME_HOST` | `0.0.0.0` | Listening address |
| `LONGHOME_PORT` | `3000` | HTTP port |
| `LONGHOME_WRITE_TOKEN` | unset | Optional token required to publish |
| `LONGHOME_MAX_PHOTO_MB` | `15` | Per-photo upload limit |
| `LONGHOME_MAX_VIDEO_MB` | `250` | Per-video upload limit |

## Project boundary

LongHome is self-hosted software first. A managed service may come later, but there is no
managed hosting product today. Read the [product boundary](docs/PRODUCT.md) for the MVP
contract and ethical guardrails.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development
workflow, Conventional Commit style, and pull-request gate. Automated contributors can
start with [llms.txt](llms.txt).

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), and
follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.

## License

[MIT](LICENSE)
