# Studio 201 agent rules

These rules apply to every agent and person who works in this repo.

Studio 201 is for solo developers: new projects, projects they maintain, and contributions to existing projects, with or without prior knowledge of them.

## Git

- Cut each feature branch from main as `feature/<name>`.
- Cut each issue branch from its feature branch as `issue/<number>-<name>`, and work it in its own worktree.
- Do not name an issue branch under `feature/<name>/`. Git refuses a branch nested inside another branch's name.
- Open issue PRs into the feature branch. Squash merge them after review and QA pass.
- Small related issues may share one PR. Name its branch after the first issue and list every issue in the PR body.
- Merge main into the feature branch whenever main moves.
- Send the feature branch to main through one PR, squash merged.
- List every issue the feature covers as "- Closes #n" in the feature PR. GitHub closes issues only on a merge to main.
- Issue PRs may carry "- Closes #n" too.
- Bump the version in the feature PR into main. A feature bumps the minor version. A fix bumps the patch version.
- Only the owner merges into main. Agents never merge into main or push to it.
- Follow semantic versioning, with one GitHub milestone per version.
- Stay on 0.x until design pass 2. Then 1.0 is the public release.
- Use a feature flag only when a feature must ship hidden.
- Write commit subjects in the imperative, 50 characters or fewer, with no trailing period.
- Write commit bodies as 1 to 5 bullets. Give the reason when the diff doesn't show it.
- Write PR descriptions, issues, and comments in first person as the owner.
- Never mention Claude or AI. Never add co-author or "generated with" lines.
- Write PR descriptions as a one-sentence summary, then Changes, Testing (what actually ran), and Risk (tier and how to revert).
