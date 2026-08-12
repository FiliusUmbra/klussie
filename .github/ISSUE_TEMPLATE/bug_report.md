---
name: Bug report
about: Something behaves differently from how it should
title: ''
labels: bug
assignees: ''
---

## What happens

<!-- Observed behaviour. What you saw, not what you think caused it. -->

## What should happen

<!-- Expected behaviour, and why you expect it — a document, an
     acceptance criterion, or prior behaviour. -->

## Steps to reproduce

1.
2.
3.

**Reproducible?** always · sometimes · once

## Context

| | |
|---|---|
| **Environment** | local · staging · production |
| **Workspace type** | Personal · Professional · Business · n/a |
| **Role** | owner · member · guest · n/a |
| **Language** | |
| **Browser / device** | |
| **Account** | <!-- test account, never a real user's credentials --> |

## Severity

- [ ] **Critical** — data loss, tenancy leak, cannot transact, or a
      security issue
- [ ] **High** — a core flow is broken with no workaround
- [ ] **Medium** — broken with a workaround
- [ ] **Low** — cosmetic or an edge case

> **Anything ticked Critical is raised immediately, not filed.** Tenancy
> leaks and data loss are not queued.

## Introduced by

<!-- If known: which work package or epic. If it appeared after a
     specific deploy, say which. -->

## Evidence

<!-- Screenshots, console errors, network failures, relevant log lines.
     No credentials, tokens or personal data. -->

## Is this a regression?

- [ ] This used to work
- [ ] This never worked
- [ ] Unknown

<!-- If it used to work, it should have been caught by a test. Note which
     test was missing — closing that gap is part of the fix
     (implementation/templates/ROLLBACK_CHECKLIST.md §5). -->
