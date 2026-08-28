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
- Optionally shape family-written notes into a reviewed story draft with OpenAI, Claude,
  or Gemini.
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

## Optional AI story co-writer

LongHome can help a family shape its own rough notes into a story draft. The feature is
off by default and supports one operator-selected hosted provider (`openai`, `anthropic`,
or `gemini`) or a signed-in local coding-agent CLI (`claude-cli` or `codex-cli`).

Add the following to `.env`:

```dotenv
LONGHOME_AI_PROVIDER=openai
LONGHOME_AI_API_KEY=your-provider-api-key
LONGHOME_AI_MODEL=your-provider-model-id
LONGHOME_AI_TIMEOUT_MS=60000
```

Use a model identifier currently available to your provider account. Restart LongHome,
then open the creation form. The assistant appears beneath the story field.

Provider setup: [OpenAI API](https://developers.openai.com/api/docs/quickstart),
[Claude API](https://platform.claude.com/docs/en/api/overview), or
[Gemini API](https://ai.google.dev/gemini-api/docs/api-key). LongHome calls each provider's
native text API directly and does not install a provider SDK.

The family must explicitly consent before every request. LongHome sends only the name,
optional dates, current story notes, and requested tone and length. It never sends photos
or videos. A generated draft is previewed and cannot be saved until the family accepts it
and submits the ordinary memorial form.

LongHome does not store prompts or discarded drafts. It requests non-storage when the
provider API supports that setting, but the operator remains responsible for reviewing
the selected provider's current data-handling policy. Configure `LONGHOME_WRITE_TOKEN` on
internet-facing installations; the same token protects paid AI requests from anonymous
use.

### Use a signed-in Claude Code or Codex CLI

If LongHome runs directly with Node.js on the same computer as an authenticated CLI, no
separate API key is needed:

```dotenv
LONGHOME_AI_PROVIDER=codex-cli
LONGHOME_AI_TIMEOUT_MS=120000
```

Use `claude-cli` instead to invoke Claude Code. `LONGHOME_AI_MODEL` is optional for either
CLI; when omitted, the CLI uses its configured default. LongHome passes memorial text over
standard input so it does not appear in the process list. Codex runs ephemerally in a
read-only empty workspace. Claude Code runs without tools, MCP servers, Chrome integration,
or session persistence.

CLI mode requires a native Node.js LongHome process because a Docker container cannot
execute macOS or Windows host binaries or safely inherit their login session. Install and
sign in to the desired CLI, then run:

```bash
npm run build
LONGHOME_AI_PROVIDER=codex-cli npm start
```

Docker self-hosters should use one of the hosted API providers unless they deliberately
operate a separate, secured inference bridge.

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
| `LONGHOME_AI_PROVIDER` | unset | Hosted provider or `claude-cli` / `codex-cli` |
| `LONGHOME_AI_API_KEY` | unset | Required only for a hosted provider |
| `LONGHOME_AI_MODEL` | unset | Required for hosted APIs; optional CLI override |
| `LONGHOME_AI_TIMEOUT_MS` | `60000` | Maximum duration of one provider request |
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

AI assistance is writing help, not a source of biographical truth. Families should verify
every generated name, date, quotation, and event. LongHome does not generate a chatbot,
voice, avatar, or simulation of the deceased.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development
workflow, Conventional Commit style, and pull-request gate. Automated contributors can
start with [llms.txt](llms.txt).

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), and
follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.

## License

[MIT](LICENSE)
