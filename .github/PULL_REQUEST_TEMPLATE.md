# What this changes

<!-- One or two sentences. If it closes an issue, say "Closes #123". -->

## Why

<!--
The decision behind it, not the diff — that is what the comments and the README
in this repo try to record, and it is the part nobody can reconstruct later.
-->

## How it was verified

<!--
`npm run typecheck && npm test && npm run build` is the baseline and CI runs it
on Node 20, 22 and 24.

Anything that shells out to git, talks to Jira, or opens a deep link has no
automated coverage — describe what you exercised by hand and on which OS.
-->

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Tested by hand where automated tests do not reach (say how, and on which OS)
- [ ] README updated, if the behaviour it documents changed
