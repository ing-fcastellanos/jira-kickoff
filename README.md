# Tickets → Claude Code

[![CI](https://github.com/ing-fcastellanos/jira-kickoff/actions/workflows/ci.yml/badge.svg)](https://github.com/ing-fcastellanos/jira-kickoff/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/jira-kickoff?logo=npm&color=cb3837)](https://www.npmjs.com/package/jira-kickoff)
[![Node](https://img.shields.io/badge/node-%3E%3D20-5fa04e?logo=nodedotjs&logoColor=white)](package.json)
[![License MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A local panel that lists your open Jira tickets and, from there, leaves a Claude Code
session ready to work on them: it creates the branch, creates the worktree, and opens
the session with the initial prompt already written.

It does not replace Jira or the Claude Code app. It covers only the stretch between
"I can see my ticket" and "I have a session ready", which is normally done by hand.

```
┌──────────────────┐   REST    ┌──────────────┐
│  Web panel       │◀─────────▶│     Jira     │
│  (localhost)     │           └──────────────┘
└────────┬─────────┘
         │ POST /api/initialize
         ▼
┌──────────────────────────────┐
│  Local service (Node)        │
│   · git worktree add         │
│   · composes the prompt      │
│   · opens the session        │──▶ Claude Code
└──────────────────────────────┘
```

The service listens **on 127.0.0.1 only**: it runs git and opens sessions on your
machine, so there is no reason for it to be reachable from the network.

## Getting started

```bash
npx jira-kickoff
```

That's it. It opens the browser on its own and, the first time, takes you through a
two-step wizard: connect to Jira and add a project. The
[API token](https://id.atlassian.com/manage-profile/security/api-tokens) is checked
against Jira **before** being saved, so a badly pasted token shows up right there and
not as an empty list ten minutes later.

GitHub needs no token: remote branches are read with `git ls-remote`, which uses the
credentials git already has configured.

### Where your configuration lives

With `npx` the package runs from a temporary cache that npm may delete, so nothing is
stored next to the code:

| File | What it holds |
|---|---|
| `config.json` | Projects, prompt, branch pattern, preferences |
| `credentials.json` | The Jira token only, with `0600` permissions |
| `history.json` | Record of initializations |

In `%APPDATA%\jira-kickoff` (Windows), `~/Library/Application Support/jira-kickoff`
(macOS) or `$XDG_CONFIG_HOME/…` (Linux). The token is kept **separate** on purpose:
`config.json` gets shared, pasted into an issue or caught in a screenshot, and the token
should not travel with it.

`JIRA_EMAIL` and `JIRA_API_TOKEN` in the environment win over the file, which is what
makes it possible to run in CI or in a container without leaving the token on disk.

### Development

```bash
git clone https://github.com/ing-fcastellanos/jira-kickoff
cd jira-kickoff
npm install
npm run dev
```

The UI ends up at <http://127.0.0.1:5100> and the API at <http://127.0.0.1:8787>. To work
without touching your real configuration, set `JTW_CONFIG_DIR` to a throwaway folder.

## Options

Everything configurable is edited from the interface and saved to `config.json`, with
validation before writing and an atomic write:

| Section | What it holds |
|---|---|
| Appearance | Light, dark or follow the system. Stored in the browser, not in `config.json`. |
| Jira | Domain, which statuses to include, and an optional extra JQL filter. |
| Projects | Each Jira key pointing to a local repository, with its base branch. They can be disabled without deleting them. |
| Branch and worktree | Branch name pattern, with a live preview, where worktrees are created, and whether to align `origin/HEAD` with the base branch. |
| Editor | Which command opens a worktree from the list, and with which arguments. |
| Initial prompt | The base command and the fixed lines that go with it. |
| On initialize | Open the session or just copy the prompt, and the session's permission mode. |

The Jira token is **not** editable from the web on purpose: it lives in `.env` and there
is no reason to put it in a form when a file already solves it.

## The initial prompt

It is composed in three layers, and the last one is always you:

```
prompt.base           →  Vamos a trabajar el ticket {{ticket}}.
+ prompt.additions    →  configurable fixed lines
= editable textarea   →  you adjust it on the spot
→ sent verbatim
```

Whatever is left in the textarea is literally what the session receives. Nothing is
appended behind your back after you edit it.

Placeholders: `{{ticket}}`, `{{summary}}`, `{{url}}`, `{{branch}}`, `{{repo}}`,
`{{worktree}}`. Each project can override `base` and `additions`; a project `additions`
replaces the whole global list instead of extending it, so that a global line can be
*removed* from a project.

## Branches

Remote ones are read with `git ls-remote --heads origin`. If the remote does not answer
the screen does not fail: it falls back to local branches and says so, because knowing
that a branch for the ticket already exists is worth more than an error.

The suggested name comes from `branch.pattern` — placeholders `{{ticket}}`,
`{{ticket-lower}}` and `{{slug}}`. The slug is trimmed at a word boundary
(`…override-pric` reads worse than `…override`) and diacritics are stripped before
collapsing non-alphanumerics, so that "Añadir" does not end up as `an-adir`.

A branch belongs to the ticket if it mentions its key without a digit following it, so
that `ABC-123` does not claim `abc-1230`. Covered by `npm test`.

## What "Initialize" does

```
POST /api/initialize { ticketKey, branch, prompt }
  1. validates the branch name with `git check-ref-format`
  2. `git fetch origin`  ← essential: ls-remote does not update local refs
  3. `git worktree add` in <repo>/<worktrees.dir>/<ticket>
  4. builds the deep link and hands it to the system
```

The worktree is named after the ticket, not after the branch: it is short, predictable
and makes the operation idempotent. Re-initializing the same ticket with the same branch
reuses it.

| Situation | What it does |
|---|---|
| Worktree already exists with that branch | reuses it |
| The branch exists locally | `worktree add <path> <branch>` |
| The branch exists only on the remote | `worktree add --track -b <branch> … origin/<branch>` |
| The branch does not exist | `worktree add -b <branch> … origin/<base>` |

Conflicts answer 409 with concrete instructions: worktree taken by another branch,
orphaned folder that git does not recognize, or the same branch already used by another
worktree.

**The worktree is created before attempting the deep link, always.** If the link fails,
the screen says so, offers to copy the prompt and a link to open it by hand — no earlier
step is lost.

## How the session opens

Through the Claude Code desktop app's deep link:

```
claude://code/new?q=<prompt>&folder=<worktree path>
```

The app opens a new session in that folder with the prompt written in the composer,
waiting for an Enter.

**This is the app's internal interface, not a public API.** It was worked out by
inspecting the binary of version 1.24012.9 and may stop working in any update. That is
why the "just copy the prompt" mode exists in Options, and why the worktree is always
created before trying to open anything.

Known limits of the handler: `q` is truncated at 14,336 characters, and the `file`
parameter is accepted but never forwarded to the UI.

### Two things the deep link does not carry

**The base branch.** Claude Code works out a repo's main branch by running
`git symbolic-ref --short refs/remotes/origin/HEAD` and stripping the `origin/` prefix.
It does not look at the base branch configured here. If your remote declares `main` as
the default branch but you work on another one, the session will show the wrong one. The
*Point `origin/HEAD` at the base branch* option runs `git remote set-head origin <base>`
on initialize; it is local configuration of the clone and is never pushed. The manual
equivalent, once per repository:

```bash
git remote set-head origin <base-branch>
```

**The permission mode.** The URL only carries `q` and `folder`, so there is no way to
ask for a mode. It is resolved from the settings, and a freshly created folder inherits
nothing that is not in the user tier. The *Session permission mode* option writes
`permissions.defaultMode` into the worktree's `.claude/settings.local.json`.

It has to be that file and not the repository's versioned `settings.json`: elevated
modes (`auto`, `acceptEdits`, `bypassPermissions`) arriving from the `project` tier are
**silently discarded** by the app, so that a repository cannot grant itself permissions.
From the `local` tier or the user tier they are honoured.

### The launcher on Windows

PowerShell's `Start-Process`, which is ShellExecute. Two cheaper alternatives were tried
and neither works:

- `rundll32 url.dll,FileProtocolHandler` — the app receives the invocation but loses the
  parameters: `folder` never arrives.
- `explorer.exe <url>` — does not trigger the protocol, nothing happens at all.

The launcher process is **not** released with `detached`: doing so made it die before
invoking the protocol. Waiting for it also turns its exit code into a real signal of
whether the invocation was accepted.

On macOS and Linux it uses `open` and `xdg-open`. Only verified on Windows.

## Ticket detail

Every card has a **Detail** button that opens the full record without leaving the panel:
status, type, priority, assignee, reporter, dates, components, labels, the parent ticket
if there is one, and the description and comments from Jira.

The description arrives as **ADF** (Atlassian Document Format), a JSON tree — neither
text nor HTML. It is converted to Markdown on the server and rendered on the client.

The alternative was to ask for `expand=renderedFields`, which returns HTML already
assembled by Jira, but painting it would mean injecting third-party HTML into the page.
Converting it ourselves keeps control of the result and avoids that surface: the
renderer does not enable raw HTML, so any tag arriving in a ticket is shown as text and
not executed.

The converter covers what these tickets actually use — paragraphs, headings, nested
lists, tables, code blocks with a language, quotes, rules and the `code`/`strong`/`em`/
`link` marks — and degrades gracefully for what it does not know: an unknown node with
children still contributes its text instead of disappearing. Covered by `npm test`.

The detail is always fetched fresh from Jira, bypassing the list's cache: it is opened
precisely to read the latest on the ticket.

## Tracking what you already started

Every ticket in the list shows whether you already started it, and the button changes to
**Resume** when there is something to resume. The header summarizes how many have a
worktree.

The state comes from two different places, and the difference matters:

| Signal | Where it comes from | Why |
|---|---|---|
| **Active worktree** + its branch and whether it has uncommitted changes | from git, on every load | It cannot fall out of sync. If you delete the worktree by hand, the ticket goes back to showing as not started — which is the truth. |
| **Initialized X ago · no worktree** | from `history.json` | Covers what git has already forgotten: that you clicked it and cleaned up the worktree afterwards. |

An existing worktree wins over the history: it is the only thing you can resume now.

The pairing is direct because the worktree is named after the ticket. That same folder is
shared with the worktrees created by the Claude Code app itself, with generated
(`silly-turing-0ec969`) or derived (`abc-123-explore-2fa6d7`) names, so only those shaped
exactly like a Jira key are considered.

`/api/activity` queries local git only — no `ls-remote` — because it is requested
alongside the ticket list and cannot cost what a network call costs. `history.json` is
not versioned.

## Worktree cleanup

The **Worktrees** button lists those of every configured repo with their real state:
uncommitted changes, unpushed commits, whether the branch is merged and whether it is
still on the remote. Deleting requires confirmation and, when there is something to
lose, it says so beforehand.

Three safeguards, in order of importance:

1. **Only what is inside the project's worktree folder is touched.** The path is
   resolved and compared against that root before anything else. Without this check a
   tampered `path` would delete any folder on the disk.
2. **The repo's main worktree is never a candidate.**
3. **A worktree with live work requires forcing.** And "live work" includes those in
   *detached HEAD*: they have no branch to compare, but they can have unsaved changes,
   so they are inspected all the same.

Deleting the local branch is a separate checkbox, unchecked by default, that warns when
the branch is not merged.

Each row also has a button to open it in the editor, in a new window. The command is
configurable, with `{{path}}` replaced by the worktree path:

```json
"editor": { "label": "VS Code", "command": "code", "args": ["-n", "{{path}}"] }
```

It works just as well for `cursor {{path}}` or `idea {{path}}`. On Windows the call goes
through `cmd.exe /c`, because these launchers are scripts (`code.cmd`) and `spawn` does
not run a `.cmd` directly; the arguments go in an array and are never concatenated, so
that a path with spaces or with `&` does not break the command.

Opening uses **the same path lock as deleting**: only what is inside the project's
worktree folder is opened. Without that check, a tampered request could launch the
editor on any path on the disk.

## Jira details that are hard to find

It uses `POST /rest/api/3/search/jql`. The old `/rest/api/3/search` is deprecated and
pagination goes by `nextPageToken`, not by index.

**Statuses are enumerated by name, never by category.** In a real instance, `Rejected`
can share the `indeterminate` category with `In Progress` despite meaning the opposite,
so filtering by category mixes them up or loses them. That is why the status list is
configurable and explicit, and why `Rejected` is coloured by name in the interface.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API with hot reload + Vite, in parallel |
| `npm run build` | Compiles the UI to `dist/web` and bundles the server into `dist/server` |
| `npm start` | Starts the compiled server, serving the UI on a single port |
| `npm test` | Tests of the pure logic: branch names and ADF conversion |
| `npm run typecheck` | TypeScript over server and UI |

The last three are exactly what CI runs, on Node 20, 22 and 24.

## Contributing

Issues and PRs are welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) explains how to set up
the environment without touching your real configuration, what is tested and what is out
of scope for the project; taking part means following the
[code of conduct](CODE_OF_CONDUCT.md).

The most useful thing right now is confirming the deep link on macOS and Linux: it is
implemented with `open` and `xdg-open`, but only verified on Windows.

To open an issue, `npx jira-kickoff --version` prints the version, node's and the
platform on a single line, which is exactly what the template asks for.

Security problems do not go to a public issue: [`SECURITY.md`](SECURITY.md) explains how
to report them privately and what falls within scope.

## License

[MIT](LICENSE) © Francisco Castellanos
