# Contributing

Thanks for taking the time. This is a small tool with a narrow scope — it covers
the gap between *seeing a Jira ticket* and *having a Claude Code session ready*.
Changes that keep that scope tight are the easiest to merge.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

You need Node 20 or newer and a git checkout:

```bash
git clone https://github.com/ing-fcastellanos/jira-kickoff
cd jira-kickoff
npm install
npm run dev
```

The UI runs at <http://127.0.0.1:5100> and the API at <http://127.0.0.1:8787>.

Two things worth doing before you start:

- **Point `JTW_CONFIG_DIR` at a throwaway folder.** Otherwise development reads
  and writes the same `config.json`, `credentials.json` and `history.json` that
  your real setup uses.
- **Copy `.env.example` to `.env`** and fill in `JIRA_EMAIL` and
  `JIRA_API_TOKEN` if you are touching anything that talks to Jira. Never commit
  either file — the Jira token is the only real secret in the project.

## Before you open a pull request

Run what CI runs:

```bash
npm run typecheck && npm test && npm run build
```

CI runs all three on Node 20, 22 and 24. A pull request that is red on any of
them will not be merged, so it is cheaper to catch it locally.

## Tests

`npm test` covers the pure logic — branch-name suggestion and matching, and the
ADF → Markdown converter. Those are the parts where a silent regression is
expensive and a test is cheap.

Anything that shells out to git, talks to Jira, or opens a deep link is not
covered by automated tests, and that is deliberate. If you change that kind of
code, say in the pull request how you exercised it by hand.

New tests go next to the code as `src/<thing>.test.ts`; `npm test` discovers
them on its own.

## What is especially welcome

- **Verification on macOS and Linux.** The `claude://` deep link is only
  confirmed to work on Windows. `open` and `xdg-open` are implemented but
  untested — a report either way is genuinely useful.
- **ADF nodes the converter does not handle yet**, with a test showing the
  input and the expected Markdown.
- **Anything the README gets wrong.** It documents a fair amount of reverse
  engineering; some of it will drift.

## What is likely out of scope

Anything that turns this into a Jira client — editing tickets, transitions,
comments, boards. Jira already does that. This project does one hop and stops.

If you are unsure, open an issue before writing the code. It is easier to say
"go ahead" than to turn down a finished branch.

## Style

There is no linter, so the rule is simply: match the file you are editing. In
practice that means no semicolons, single quotes, two-space indent, and comments
that explain *why* rather than *what* — the existing ones mostly document a
decision or a constraint that cost time to find.

Code, comments and documentation are in English. The web UI ships English and
Spanish through `web/src/i18n.ts` and the server through `src/messages.ts`: the
English catalogue defines the keys and the Spanish one is typed against it, so a
new string that is not translated does not compile. What the server prints to the
terminal, and commit messages, are still in Spanish.

Write commit messages in the imperative and keep the subject short enough to
read in a list.

## Security

Do not open a public issue for a security problem. [SECURITY.md](SECURITY.md)
explains how to report it privately, and lists what counts — this thing runs git
commands and opens editors on your machine, so the boundaries are worth reading
before you decide whether something is a bug or a vulnerability.

## Releasing

Only maintainers do this, and only from `main`:

1. Bump the version in `package.json` and commit it.
2. Tag it: `git tag v0.2.0 && git push origin v0.2.0`.
3. The `Release` workflow takes over — it refuses to continue if the tag and
   `package.json` disagree, runs typecheck, tests and build through
   `prepublishOnly`, publishes to npm with provenance, and opens the GitHub
   Release with generated notes.

A tag with a hyphen (`v0.2.0-beta.1`) publishes under the `next` dist-tag and is
marked as a prerelease, so a plain `npx jira-kickoff` keeps getting the stable
version.

The workflow needs an `NPM_TOKEN` secret with publish rights (an automation
token, since the publish is unattended).
