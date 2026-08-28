# LongHome product boundary

LongHome gives one person one lasting page, preserved and controlled by their family.

## First release

A visitor can create a memorial with:

- a name;
- at least one photograph;
- optional birth and end dates;
- an optional written story; and
- optional uploaded videos.

The memorial receives a stable URL on that LongHome installation and one of three access
policies:

- **Public:** listed by the installation and open to everyone.
- **Unlisted:** absent from the directory and search indexes, but open to anyone holding
  the memorial URL.
- **Private:** absent from the directory and indexes; both the page and its media require
  a live invitation or steward capability.

Every new memorial receives a private steward capability. Stewards can move the memorial
between visibility modes, create separately revocable invitations, and revoke access.
LongHome creates links but does not send email.

## Operating model

LongHome is an independent, founder-owned open-source project. It is not part of the
Cogito product stack and does not depend on cogitod. Anyone can self-host it, retain the
SQLite database and media directory, and move or back up the complete installation.

A managed service may be considered later. It is not part of the current product,
repository, or promise.

## Guardrails

- Families retain control of their data and server.
- Private access must protect media bytes as well as rendered pages.
- Private memorial URLs must not expose the person's name.
- Invitation and steward secrets are stored only as hashes and shown only when created.
- Exportability and recoverable storage matter more than lock-in.
- The software preserves a person; it does not impersonate them.
- AI simulations of deceased people are outside the project boundary.
- “Permanent” must never mean “trust this one company forever.” Self-hosting and portable
  data are the first continuity mechanism.
