# Main Branch Protection Policy

## Scope

This policy applies only to the `main` branch of `jawedimtiaz/jawed-website-ai-studio-lab`.

## Active GitHub ruleset

- Name: Protect main — Require PR and CI
- Ruleset ID: 28095706
- Enforcement: Active
- Target: `refs/heads/main`
- Administrator bypass: None

## Required merge controls

- Changes must be submitted through a pull request.
- Required approving reviews: 0 (single-owner repository workflow).
- Review conversation threads must be resolved.
- The branch must be up to date with the base branch before merging.
- The following GitHub Actions checks must pass:
  - `Pull request validation`
  - `Secrets and supply-chain baseline`
- Force pushes are blocked.
- Deletion of `main` is blocked.

## Additional CI workflows

Other workflows may use path filters and run only when their watched files change. They are not global required checks because they may legitimately be skipped for unrelated pull requests. They continue to execute under their configured triggers.

## Development procedure

1. Create a dedicated development branch from the latest `main`.
2. Keep changes scoped to the task and review the complete diff.
3. Open a pull request targeting `main`.
4. Resolve review conversations and wait for all required checks to pass.
5. Review the final diff and merge only after explicit maintainer approval.
6. Verify the resulting `main` commit and relevant deployment status separately.

## Safety boundaries

- Do not bypass the ruleset for routine development.
- Do not commit directly to `main`.
- Do not force-push or delete `main`.
- Do not treat a successful GitHub merge as proof of a successful Cloudflare deployment.
- Keep customer projects and the personal website separate from this repository.

## Verification record

The ruleset was verified active on 2026-11-25. A documentation-only enforcement test (PR #86) showed the merge control disabled while both required checks were pending and enabled after both checks succeeded. PR #86 was closed without merging.

The enforcement test's temporary branch is separate from `main` and may be removed after its closed PR is no longer needed for audit reference.
