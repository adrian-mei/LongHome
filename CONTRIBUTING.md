# Contributing to LongHome

Thank you for helping families preserve the people they love. LongHome should remain
calm, portable, accessible, and straightforward to self-host.

## Before you start

- Search existing issues before opening a new one.
- Use a discussion or feature-request issue for changes that alter the product boundary,
  data model, privacy model, or self-hosting story.
- Never use real memorial data, private family media, or personal information in tests.
- Keep managed-service code and Cogito-specific dependencies out of this repository.

## Development setup

LongHome requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

The development server uses `./data` unless `LONGHOME_DATA_DIR` is set. That directory is
ignored by Git.

Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run build
```

## Branches and pull requests

1. Fork the repository and branch from `main`.
2. Keep one concern per branch and pull request.
3. Add or update tests for behavior changes.
4. Update `README.md`, `llms.txt`, or `docs/PRODUCT.md` when a public contract changes.
5. Explain the user impact, test evidence, and any data-migration consequences in the PR.

Pull requests should preserve existing user data. A change that can make an existing
memorial unreadable needs an explicit migration and rollback path.

## Commit style

LongHome uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(optional-scope): concise imperative summary
```

Common types:

- `feat`: user-visible capability
- `fix`: defect correction
- `docs`: documentation only
- `test`: test-only change
- `refactor`: internal change without new behavior
- `perf`: performance improvement
- `build`: dependencies or build tooling
- `ci`: automation and continuous integration
- `chore`: maintenance that fits no type above

Examples:

```text
feat(upload): accept optional WebM memories
fix(storage): remove partial files after a rejected upload
docs(self-hosting): explain volume backup recovery
```

Use `!` and a `BREAKING CHANGE:` footer only when maintainers have agreed that a breaking
change is necessary.

## Design and implementation principles

- A name and one photo are the smallest memorial. Everything else is optional.
- The filesystem and SQLite database are the portable source of truth.
- Prefer explicit, boring infrastructure over mandatory cloud services.
- Validate uploads at the server boundary and never trust original filenames.
- Treat accessibility, privacy, and grief-sensitive language as correctness concerns.
- Test private page and media denial, invitation acceptance, revocation, and migrations
  together whenever the access layer changes.
- Never log, fixture, or commit raw invitation and steward capabilities.
- Preserve the person; do not impersonate them. AI simulations are outside scope.
- Avoid claims that one server or company can guarantee literal permanence.

## Reporting security problems

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the MIT License.
