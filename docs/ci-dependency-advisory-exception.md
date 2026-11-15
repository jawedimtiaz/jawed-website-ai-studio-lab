# CI dependency advisory exception

## Dependency baseline

The committed `package.json` and `bun.lock` are the source of truth for CI dependency installation.

- `firebase@13.0.0`
- `@firebase/firestore@4.18.0`
- `@firebase/firestore-compat@0.4.15`
- `@grpc/grpc-js@1.9.16`
- `vite@6.4.6`

The Vite lockfile entry was updated from 6.4.4 to 6.4.6. This is above the patched version 6.4.5 for GHSA-8g5g-mxqh-grgj; the Vite advisory is not part of the exception.

## Reviewed Firebase/gRPC advisories

The two reviewed advisories are GHSA-m9gg-hp2v-232j (high) and GHSA-f596-whhp-79r4 (low). Firestore declares `@grpc/grpc-js` as `~1.9.0`, which prevents a compatible resolution to the patched 1.13.6+ line without an upstream dependency change or an override. No override is applied.

The advisory concerns gRPC server-authentication credential configurations. The application uses Firebase's browser SDK and Cloudflare Worker-side JOSE token verification; the reviewed application code does not intentionally use the Node gRPC server-authentication APIs.

## CI treatment

The Studio HQ workflow installs the committed lockfile with `bun install --frozen-lockfile --ignore-scripts`. CI fails if `package.json` and `bun.lock` disagree and does not execute dependency lifecycle scripts during installation. The workflow runs `bun audit --json`, which audits the versions recorded in the lockfile rather than a separately resolved npm dependency tree.

`scripts/check-dependency-audit.mjs` permits only the two exact reviewed GHSA identifiers, for `@grpc/grpc-js`, with their expected severities. Any additional package, advisory, changed severity, incomplete report, or unknown report shape fails CI. This ensures the Vite advisory and any future new finding are not silently accepted.

After the production frontend build and Wrangler dry-run bundle are generated, `scripts/verify-no-grpc-runtime.mjs` scans both artifact directories for the gRPC package marker and server-authentication API markers. A match or missing artifact directory fails CI. This is a bundle-content regression guard, not proof that all upstream advisory scenarios are impossible.

These checks are a narrowly scoped CI exception and a regression guard. They are not a claim that the upstream dependency has been patched, nor a substitute for upgrading to a vendor-fixed dependency when Firebase/Firestore constraints permit it. Reassess and remove this exception when the dependency chain resolves to a patched `@grpc/grpc-js` release.

## Explicitly not done

- No Firebase downgrade.
- No forced dependency override.
- No blanket audit suppression.
- No production deployment or Cloudflare configuration change.
