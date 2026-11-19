# Agent Teams — Master Reference

> Source: <https://code.claude.com/docs/en/agent-teams> (captured 2026-11-18).
> Agent teams are **experimental**. Re-check the source page when behaviour seems off — version-specific details below may drift.

This guide is for designing, launching, and running effective Claude Code agent teams. Part 1 is the decision/design playbook; Part 2 is the mechanics reference; Part 3 covers troubleshooting and limits.

---

## Project status (Coffee Roasters CRM)

- `.claude/settings.json` already enables teams: `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"`.
- `.claude/agents/` defines five roles with disjoint file ownership:
  - `product-owner` (opus) — domain research in `docs/domain/`, goal/scope/acceptance criteria in `docs/briefs/`. Has web access.
  - `architect` (opus) — `prisma/schema.prisma`, migrations, `docs/design/`, module `index.ts` files.
  - `backend-developer` (sonnet) — services, controllers, DTOs in `src/modules/`.
  - `qa-engineer` (sonnet) — `*.spec.ts` and `test/`.
  - `code-reviewer` (opus) — read-only; reports findings to the owning teammate.
    Each role says who to message for what, so spawn them with these exact names.
- Side effect to remember: with teams enabled, _any_ subagent Claude names launches as a teammate (see [How teams start](#how-teams-start)).

---

# Part 1 — Playbook

## 1. Should this be a team at all?

Pick the lightest tool that works:

| Option                  | Use when                                                                           | Cost                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Single session          | Sequential work, same-file edits, many dependencies, routine tasks                 | Lowest                                                                                |
| Subagents               | Focused workers where only the _result_ matters; main agent coordinates everything | Low — results are summarised back                                                     |
| Cross-session messaging | You're already running several sessions and just need to pass findings             | Low                                                                                   |
| Git worktrees (manual)  | You want parallel sessions without automated coordination                          | Per-session                                                                           |
| **Agent team**          | Workers must **share findings, challenge each other, and self-coordinate**         | High — every teammate is a full Claude instance; tokens scale linearly with team size |

**Strong team use cases**

- **Research & review** — parallel investigation of different aspects, then cross-challenge.
- **New modules/features** — each teammate owns a separate piece.
- **Debugging with competing hypotheses** — parallel theories, adversarial convergence.
- **Cross-layer changes** — frontend / backend / tests each owned by a different teammate.

**Bad fits:** sequential pipelines, multiple people needing the same file, tightly coupled work, small tasks.

If new to teams, start with **non-coding** work (PR review, library research, bug investigation) — it shows the value of parallelism without parallel-implementation conflicts.

## 2. Design checklist

Before spawning, decide:

1. **Roles** — distinct lenses or ownership areas that can proceed _without waiting on each other_. Overlap = wasted tokens.
2. **Size** — start with **3–5 teammates**. Three focused teammates often beat five scattered ones. For ~15 independent tasks, 3 teammates is a good start.
3. **File ownership** — each teammate owns a disjoint set of files. Two teammates editing one file → overwrites.
4. **Task granularity** — self-contained units with a clear deliverable (a function, a test file, a review). Aim for **5–6 tasks per teammate** so the lead can rebalance if someone stalls.
   - Too small → coordination overhead exceeds benefit.
   - Too large → long stretches without check-ins, risk of wasted effort.
5. **Names** — tell the lead what to call each teammate so you can address them predictably later.
6. **Models** — name a model per teammate in the prompt if it matters (e.g. Sonnet for implementers, Opus for architect/reviewer).
7. **Plan-first?** — for risky/complex work, put the lead in plan mode before spawning (see [Plan before implementing](#plan-before-implementing)).
8. **Permissions** — pre-approve common commands _before_ spawning; teammate prompts all bubble up to the lead.
9. **Quality gates** — consider `TeammateIdle` / `TaskCreated` / `TaskCompleted` hooks.
10. **Definition of done** — what does the lead synthesise, and where does it go (findings doc, PR, summary)?

## 3. Writing the spawn prompt

Teammates load CLAUDE.md, MCP servers and skills automatically, but **do not inherit the lead's conversation history**. The spawn prompt is all the task context they get. Include:

- Exact scope (paths, modules, PR number).
- Relevant facts the lead already knows (stack, conventions, constraints).
- What to focus on and what to ignore.
- The deliverable format (e.g. "report issues with severity ratings").
- Who to talk to and when (e.g. "message `backend` when the DTO shape is final").

Example:

```text
Spawn a security reviewer teammate with the prompt: "Review the authentication module
at src/auth/ for security vulnerabilities. Focus on token handling, session
management, and input validation. The app uses JWT tokens stored in
httpOnly cookies. Report any issues with severity ratings."
```

## 4. Proven team patterns

### Multi-lens review

```text
Spawn three teammates to review PR #142:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

Same input, different filters. A single reviewer tends to fixate on one issue type at a time.

### Competing hypotheses (scientific debate)

```text
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific
debate. Update the findings doc with whatever consensus emerges.
```

Defeats anchoring: a lone investigator finds one plausible story and stops. Making teammates explicitly adversarial means the surviving theory is far more likely to be the real cause.

### Exploratory design

```text
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Spawn three teammates to explore this from different angles:
one on UX, one on technical architecture, one playing devil's advocate.
```

Include a devil's advocate to stress-test the consensus.

### Parallel feature build (cross-layer)

One teammate per layer/module (e.g. Prisma schema + migrations, NestJS service/controller, tests), each owning distinct files, with dependencies expressed in the task list so blocked work waits automatically.

### Parallel refactor

```text
Spawn 4 teammates to refactor these modules in parallel. Use Sonnet for
each teammate.
```

## 5. Running the team

- **Monitor and steer.** Check in, redirect failing approaches, synthesise as results arrive. Unattended teams waste effort.
- **Keep the lead coordinating, not coding.** If it starts doing the work itself: `Wait for your teammates to complete their tasks before proceeding`.
- **Watch for premature finish.** The lead may declare done before all tasks are complete — tell it to keep going.
- **Stalled teammate?** Open its transcript, give it more instructions, or spawn a replacement.
- **Stuck task?** Status can lag — verify the work is actually done, then update status or have the lead nudge the teammate.
- **Shut down by name:** `Ask the researcher teammate to shut down`.

---

# Part 2 — Mechanics reference

## Enable / disable

```json
// settings.json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } } // "0" to disable
```

- Settings-file `env` changes apply to the running session on save; the variable is re-read on every spawn.
- User-settings `0` overrides a shell export, but project, local, `--settings`, and managed settings all take precedence over user settings.
- Teams require an **interactive** session. In `-p` / headless / Agent SDK sessions, named subagents run as ordinary subagents.

## How teams start

A teammate is launched whenever Claude calls the **Agent tool with a `name`** while teams are enabled — **unless** the call is a fork or passes `isolation`. No confirmation is asked. Because Claude sometimes names ordinary subagents (to message them later), teams can form unintentionally. If Claude used plain subagents when you wanted a team, ask again and explicitly say "agent team" (the agent panel shows both, so it isn't proof a team formed).

## Architecture

| Component | Role                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Team lead | The main session; spawns and coordinates. Fixed for the session's lifetime.                                |
| Teammates | Separate Claude Code instances with their own context windows.                                             |
| Task list | Shared work items: `pending` → `in progress` → `completed`; tasks may depend on others (shown as blocked). |
| Mailbox   | Per-agent JSON inbox for messages.                                                                         |

Files (team name = `session-` + first 8 chars of session ID):

| Path                                          | Lifetime                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.claude/teams/{team}/config.json`          | Removed at session end. Runtime state (session IDs, tmux pane IDs, `members` array). **Never hand-edit or pre-author.** Lead's agent type is `team-lead`. Teammates may read it to discover members. |
| `~/.claude/teams/{team}/inboxes/{agent}.json` | Mailboxes. Invalid entries are reported and removed; a send counts only if the write succeeded.                                                                                                      |
| `~/.claude/tasks/{team}/`                     | Persists after session; retention via `cleanupPeriodDays`.                                                                                                                                           |

There is **no project-level team config** — `.claude/teams/teams.json` in the repo is just a file. Use subagent definitions for reusable roles.

## Tasks

- Lead creates tasks; it can assign them, or teammates **self-claim** the next unassigned, unblocked task after finishing one.
- Teammates won't self-claim blocked tasks, but you/the lead can assign them.
- Claiming uses file locks (no races). Completing a task auto-unblocks dependents.
- Agents without the Task tools coordinate via messages only.

## Communication

- Messages are delivered automatically — no polling.
- On going idle, a teammate notifies the lead with its final answer (or error text on API failure).
- Messaging is by name, one recipient per message (no broadcast — send one per teammate).
- Messages between agents are flagged as coming from another Claude session, not the user. A teammate **cannot** approve permissions or give consent on your behalf, nor relay a denied action to another teammate. In auto mode the classifier treats relayed approval claims as untrusted and may block messages.

## Display modes & controls

| Mode                 | Notes                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| In-process (default) | Any terminal. Teammates listed in the agent panel under the prompt.                                                       |
| Split panes          | One pane per teammate. Needs tmux or iTerm2 + `it2` CLI (enable iTerm2 > Settings > General > Magic > Enable Python API). |

`teammateMode` in `~/.claude/settings.json`: `"auto"` (panes inside tmux/iTerm2, otherwise in-process), `"tmux"` (separate tmux session; use the `View teammates` command shown at the prompt), `"iterm2"`. Per session: `claude --teammate-mode auto` (hidden flag). `tmux -CC` in iTerm2 is the suggested tmux entrypoint.

**In-process keys**

| Key       | Action                                                                     |
| --------- | -------------------------------------------------------------------------- |
| ↑ / ↓     | Select teammate in agent panel                                             |
| Enter     | Open transcript and message it directly (also expands `N idle agents` row) |
| Esc       | Clear selection; while viewing a teammate, interrupts its turn             |
| `x`       | Stop selected teammate                                                     |
| Ctrl+T    | Toggle task list                                                           |
| Shift+Tab | Cycle the viewed teammate's permission mode                                |

While viewing a teammate: plain text and skills go to the teammate; built-in commands go to the lead. `/compact`, `/clear`, `/rewind` ask for confirmation; `/model` and `/fast` are blocked (a teammate's model/fast mode is fixed at spawn).

Idle rows hide 30 s after the whole panel goes idle (teammate still running and addressable); >3 idle teammates collapse into one row.

## Model selection (first match wins)

1. Model named in the spawn prompt for that teammate.
2. Subagent definition's `model` (`inherit` = lead's model).
3. `CLAUDE_CODE_SUBAGENT_MODEL` (if not `inherit`).
4. Lead's current model.

- A mod's `agent.spawn` hook model replaces source 1.
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` skips 1 and 2 (v2.1.257+).
- `teammateDefaultModel` was removed (v2.1.234) — name the model in the prompt.
- Org `availableModels` allowlist: blocked family alias → newest permitted version (Anthropic API / Claude Platform on AWS); anything else blocked → lead's model.
- Teammates on the lead's model inherit the lead's effort level.

## Plan before implementing

Put the **lead** in plan mode, then spawn (e.g. `Spawn an architect teammate to refactor the authentication module.`). The teammate plans, then sends a plan-approval request; if its permission mode hasn't been changed since spawn, Claude Code **auto-approves** it and the teammate proceeds in the lead's current mode (or Manual if the lead is still in plan). If you put a running in-process teammate into plan mode via Shift+Tab, the **lead** reviews that plan (approves or sends back).

## Permissions

- No per-teammate permission modes at spawn: teammates start in the lead's mode — including `bypassPermissions`. Lead in `dontAsk` → teammate starts in Manual.
- In-process teammates not in plan mode **follow the lead's mode** while the lead is in `acceptEdits`, `auto`, or `bypassPermissions`, even if their status bar says Manual. To make them ask, switch the lead (`main` row) to Manual.
- In-process teammates use the lead's live allow/deny rules, including `--allowedTools`, `--disallowedTools`, `--tools`.
- Split-pane teammates get `--disallowedTools`/`--tools` (v2.1.309+) but **not** `--allowedTools` — use `claude --settings '{"permissions":{"allow":["Bash(npm *)"]}}'` instead.
- All teammate permission prompts appear in the lead session.

## Reusable roles via subagent definitions

Define a role once in `.claude/agents/<name>.md` (project, user, managed or plugin scope) and use it as either a subagent or a teammate:

```text
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```

What carries over to a teammate:

| Field               | In-process                                    | Split-pane                         |
| ------------------- | --------------------------------------------- | ---------------------------------- |
| `tools`             | Applied; `SendMessage` + Task tools added     | Applied                            |
| `model`             | Applied unless prompt names one               | Applied unless prompt names one    |
| `disallowedTools`   | Applied (can't remove SendMessage/Task tools) | —                                  |
| `effort`            | Applied                                       | —                                  |
| `autoCompactWindow` | Applied (v2.1.296+)                           | Ignored                            |
| Body                | **Appended** to default system prompt         | **Replaces** default system prompt |
| `skills`            | Not applied (loads project/user skills)       | Not applied                        |
| `mcpServers`        | Ignored (loads project/user MCP)              | Applied                            |

Template for this repo's roles:

```markdown
---
name: backend-developer
description: Implements NestJS modules, Prisma models and services for the Coffee Roasters CRM.
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
---

You own backend code under src/ (excluding tests). Follow existing NestJS module
layout and Prisma conventions. AUD currency, GST, Australia/Sydney timezone.
Do not edit files owned by other teammates; message them instead.
When done, report: files changed, migrations added, open questions.
```

Messaging an in-process teammate that stopped brings it back with its saved conversation. Re-applying a project `.claude/agents/` definition on revival requires that folder to be **trusted** (a trusted parent doesn't count).

## Context loaded by each teammate

CLAUDE.md, MCP servers, skills (same as a normal session, honouring the lead's `--setting-sources`), plus the spawn prompt. **Not** the lead's history.

## Hooks (quality gates)

| Hook            | Fires when                 | Exit 2 does                                                    |
| --------------- | -------------------------- | -------------------------------------------------------------- |
| `TeammateIdle`  | Teammate about to go idle  | Sends feedback, keeps it working                               |
| `TaskCreated`   | Task being created         | Blocks creation, sends feedback                                |
| `TaskCompleted` | Task being marked complete | Blocks completion, sends feedback (e.g. require tests to pass) |

## Cost

- Each teammate = separate context window; usage scales with active teammates. Worth it for research, review, new features; not for routine work.
- In-process teammates' prompt cache defaults to a **5-minute TTL**. Set `subagentPromptCacheTtl: "1h"` to extend (1-hour cache writes bill higher).

---

# Part 3 — Troubleshooting & limits

| Symptom                                    | Fix                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Teammates not appearing                    | Check agent panel (↑/↓, Enter). Hidden idle rows aren't stopped — message by name. Task may be too simple to warrant a team. For panes: `which tmux`; for iTerm2 check `it2` + Python API. |
| Claude spawned subagents, not a team       | Ask again, explicitly requesting an "agent team".                                                                                                                                          |
| Teammates appear when you wanted subagents | Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `"0"` (check higher-precedence/managed settings).                                                                                            |
| Too many permission prompts                | Pre-approve common operations in permission settings before spawning.                                                                                                                      |
| Teammate stopped on error                  | Open it, give instructions, or spawn a replacement. A message wakes a teammate waiting on API retry.                                                                                       |
| Lead stopped early                         | Tell it to keep going.                                                                                                                                                                     |
| Lead doing the work itself                 | "Wait for your teammates to complete their tasks before proceeding."                                                                                                                       |
| Task stuck / dependents blocked            | Verify work is done; update status manually or have lead nudge.                                                                                                                            |
| Orphaned tmux session                      | `tmux ls` then `tmux kill-session -t <name>`.                                                                                                                                              |
| Lead messages ghosts after `/resume`       | In-process teammates aren't restored — tell lead to spawn new ones.                                                                                                                        |

**Limitations**

- No session resumption for in-process teammates (`/resume`, `/rewind`).
- Task status can lag.
- Shutdown waits for the current request/tool call.
- One team per session; can't share across sessions or create additional named teams.
- No nested teams — only the lead spawns teammates.
- In-process teammates can't run background subagents (`background: true` errors; `run_in_background` errors or runs in foreground).
- Lead can't be changed or transferred.
- No per-teammate permission modes at spawn.
- Split panes need tmux or iTerm2.

---

## Quick-start template

```text
Create an agent team for <goal>.
Teammates (use these names):
- <name1> (<model>): owns <files/area>. Deliverable: <x>.
- <name2> (<model>): owns <files/area>. Deliverable: <y>.
- <name3> (<model>): reviewer/devil's advocate. Challenge the others' conclusions.
Context: <stack, constraints, relevant facts — teammates don't see this conversation>.
Rules: no one edits files outside their area; message the owner instead.
Break the work into ~5 tasks per teammate with dependencies in the task list.
Wait for teammates to finish, then synthesise results into <destination>.
```
