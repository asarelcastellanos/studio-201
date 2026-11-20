# Roadmap

Studio 201 uses semantic versioning (`major.minor.patch`). A feature bumps the minor number and a fix bumps the patch. Each version is a GitHub milestone. Versions stay 0.x until the final design pass, and 1.0 is the public release.

Only the v0.1 spec is approved. Later versions are plans and can change.

## 0.1: Tools (spec approved 2026-11-19)

The smallest Studio 201 that runs a trial. Spec: [docs/spec/v0.1.md](docs/spec/v0.1.md).

- F1 Foundation: one-step install on any Mac, `/studio update`, `AGENTS.md` shared with Codex, assumptions log.
- F2 Session meter: side pane with session time, tokens, cost, context, policy, and 5h and 7d usage with a forecast in Pacific time.
- F3 Product board: project setup that creates one GitHub Project per product, and a Board link.
- F4 Agents pane: running agents (top 5, then "Show N more"), finished agents hidden, click an agent to see its transcript.
- F5 Team and policy: agent files with pinned models, the main session doesn't write code, only you merge to main, branch flow.

During the 0.1 trial, the process steps (spec, plan, review and QA) run by hand.

## 0.2: Process

- Spec skill: numbered claims tied to your words, with proof and assumptions.
- Plan page: HTML page from `plan.md` with diagrams and decision cards.
- Review and QA loop: findings become issues, get fixed, and are re-checked. After 3 rounds the issue goes to you.
- QA evidence guides per platform: web, Apple, Windows, Python data, R data.
- The four reasons a claim gets an automated test.
- Receipt PRs: each claim with its proof and evidence link.
- Assumptions skill and git-flow skill.
- Compound step: a repeated mistake becomes a check.

## 0.3: Design

- `DESIGN.md`: mode, color tokens, type roles, things to refuse, references.
- Type and color rules, with a contrast check script.
- Web default: Tailwind + shadcn/ui.
- Apple (SwiftUI) and Windows (WinUI, Fluent) rules.
- Design critic agent: screenshots plus a slop detector.
- References from a `refs/` folder or Playwright captures.

## 0.4: Second model and voice

- Codex second opinion on plans and diffs.
- Voice check: GitHub posts sound like you, no AI mentions, short replies.
- Inbox and evidence sections in the pane.
- README skill.

## 1.0: Release

- Design pass 2 on the pane and docs, by you or a designer.
- Public release.
