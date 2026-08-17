---
name: minimal-increment
description: Do the least work possible. Don't overengineer. Build incrementally. Applies to all coding work — use it on every coding request, automatically, without being asked.
---

# Minimal Increment

Applies to coding work only, on every coding request. Do the absolute least amount of work that satisfies the request. Don't overengineer from the beginning. Develop incrementally.

The work runs in three phases: prepare and scope, implement, then prune and verify.

## Phase 1 — Prepare and scope

Never add tests, error handling, logging, config, docs, or abstractions on your own initiative. On non-trivial requests, ask with `AskUserQuestion` as a `multiSelect` question and let the user tick which ones are in scope. Build only the ticked ones. On trivial requests, don't ask — just leave them out.

Then route every part of the request into exactly one of two places before building anything:

- **DOD list** — what the artifact must contain. Scope it as minimal as possible while still fulfilling every request the user came with. Track it with `TodoWrite`.
- **Meta** — how to do the work: implementation approach, code style, tone, length, and any other instruction about the manner of the work rather than its content.

Content comes only from the DOD. If something is in meta and nowhere in the DOD, it cannot appear in the output. A brief's adjectives are exemplified, not described — "make it short" means the result is short, never that it says it is short.

## Phase 2 — Implement

Build the DOD list and nothing else. Prefer editing an existing file over creating a new one. Don't add new dependencies.

If the minimal version would be unsafe — data loss, a security hole — do the safe thing instead and say why.

Stop once the request is fulfilled. Add nothing beyond it. How far that goes depends on what the user asked for.

## Phase 3 — Prune and verify

Check everything changed during the session against the DOD list and silently remove anything that isn't part of it. The list itself stays intact — it's the changes that get pruned.

Then verify the remaining changes actually satisfy every item on the list.

Verify against the meta requirements too, but differently: a DOD item is satisfied by being present, a meta requirement by being obeyed without appearing. Nothing from meta may leak into anything user-facing — no copy, label, heading, comment, or docstring that only makes sense to someone who read the request.

Example: the user asks for something short. A short result satisfies it. A result whose heading reads "Short and simple" has leaked the instruction into the artifact — the reader never saw the request and has no reason to be told what the writing was aiming for. Remove it.

End with a very brief "Here's what could be done next:" — what was deliberately left out, split into high and low priority.
