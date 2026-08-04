# Security Policy

## Supported versions

This project is pre-1.0 and ships from a single line. Only the latest version
published on npm receives fixes; there are no backports.

| Version | Supported |
|---|---|
| latest on npm | ✅ |
| anything older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue.**

Report it privately through the repository's
[Security → Report a vulnerability](https://github.com/ing-fcastellanos/jira-kickoff/security/advisories/new)
tab, or by email to ing.fcastellanos@gmail.com.

Useful things to include: the version, your OS, what an attacker gains, and the
smallest sequence of steps that shows it. A proof of concept helps but is not
required to report.

This is a one-maintainer project, so expect a first reply within a week rather
than within a day. You will get an acknowledgement, and credit in the advisory
unless you would rather not be named.

## What this tool actually exposes

Worth knowing before you decide whether something is a bug or a vulnerability —
it runs git commands and opens editor sessions on your machine:

- **The server listens on `127.0.0.1` only.** Anything that makes it reachable
  from the network is a vulnerability.
- **The Jira API token lives in `credentials.json` with `0600` permissions**,
  deliberately apart from `config.json`, which is meant to be shareable. A token
  leaking into `config.json`, into a log, or into an HTTP response is a
  vulnerability.
- **Deleting and opening worktrees is locked to the project's worktrees
  folder.** The path is resolved and compared against that root first. A crafted
  `path` that escapes it — and so reaches any folder on disk — is a
  vulnerability.
- **Ticket content is never rendered as raw HTML.** Jira descriptions and
  comments arrive as ADF, are converted to Markdown on the server, and the
  renderer does not enable raw HTML. Any path that gets a ticket to execute
  script in the panel is a vulnerability.
- **The initial prompt is built and handed to the Claude Code deep link.**
  Command injection through a branch name, ticket key, or worktree path is a
  vulnerability.

## What is out of scope

- Anything that requires an attacker to already run code as you on your machine.
  If they can read `credentials.json`, they can read your `.env` and your SSH
  keys too.
- The `claude://` deep link being undocumented app-internal interface. That is a
  known and documented fragility, not a security issue.
- Vulnerabilities in dependencies with no reachable path through this code —
  report those upstream. If you can show it *is* reachable from here, do report
  it.
