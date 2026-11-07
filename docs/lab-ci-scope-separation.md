# Studio Lab CI Scope Separation

**Status:** Draft implementation on `fix/lab-ci-production-monitor-isolation`  
**Issue:** [#23 — Separate Studio Lab runtime checks from jawed.co.in production monitoring](https://github.com/jawedimtiaz/jawed-website-ai-studio-lab/issues/23)

## Why this change exists

The repository `jawed-website-ai-studio-lab` builds and deploys the Studio Lab Worker at `https://lab.jawed.co.in`. The personal website `https://jawed.co.in` is served by a separate Cloudflare Pages project connected to the separate `jawed-website` repository.

A set of workflows in this Lab repository were triggered by pull requests and/or pushes to `main`, but their validators inspected production website contracts and remote endpoints belonging to `jawed.co.in`. Those checks are not reliable acceptance tests for changes to the Lab Worker.

## Scope of this change

The following workflows have their automatic `pull_request` and `push` triggers removed on this branch:

- Deployment Runtime Reliability
- Production AI GET Reliability
- Production AI POST Reliability
- Production Cache Reliability
- Production Smoke Reliability
- Production Static Asset Reliability
- Production Security Headers
- Production 404 Reliability
- Production Robots Reliability
- Production Sitemap Reliability
- Production Legacy Redirects
- Production Media Assets
- Production API Method Boundary
- Production Availability Monitoring
- Production HTML SEO Reliability
- Canonical Origin Reliability

Where a workflow already had `schedule` and/or `workflow_dispatch`, those triggers are retained. The Deployment Runtime workflow is left manual-only because it had no scheduled trigger. This preserves the existing validators and does not change their assertions, expected statuses, origins, or production content.

## What this does NOT do

- It does not change `jawed.co.in`, `www.jawed.co.in`, their Pages project, DNS, routes, or content.
- It does not deploy or modify the Studio Lab Worker.
- It does not claim that `lab.jawed.co.in` has passed runtime checks.
- It does not replace the old production checks with a new Lab runtime suite yet.
- It does not suppress failures from other source-level CI gates.

## Required next step before declaring CI separation complete

Create Lab-specific checks that validate the actual Lab Worker contract and preview deployment independently, without contacting the protected personal website. At minimum, verify:

1. The Lab origin is HTTPS and resolves to the intended Worker service.
2. The Lab app shell and static assets load successfully.
3. The Lab API route behavior is checked with bounded requests and expected JSON/content-type contracts.
4. Private Studio HQ endpoints fail closed when no owner session is present.
5. The preview Worker and preview D1 are isolated from the production Lab Worker and production data.
6. These checks run on Lab PRs against a safe preview target, not against `jawed.co.in`.

Until those tests exist and pass, this is only the **production-monitor trigger isolation** step, not complete Lab deployment validation.

## Verification status

- Workflow files were edited on a dedicated feature branch.
- No GitHub Actions run has yet verified the changed workflow definitions.
- No local YAML parser or repository build/test command has been run in this session.
- A review PR will be opened for inspection; merge and deployment remain separate approvals.
