# CI dependency advisory exception

## Scope

The committed `bun.lock` currently contains the reviewed Firebase Firestore dependency chain:

- `firebase@13.0.0`
- `@firebase/firestore@4.18.0`
- `@firebase/firestore-compat@0.4.15`
- `@grpc/grpc-js@1.9.16`

The two reviewed advisories are GHSA-m9gg-hp2v-232j (high) and GHSA-f596-whhp-79r4 (low). The Firestore package declares `@grpc/grpc-js` as `~1.9.0`, which prevents a compatible resolution to the patched 1.13.6+ line without an upstream dependency change or an override. No override is applied.

The advisory concerns gRPC server-authentication credential configurations. The application uses Firebase's browser SDK and Cloudflare Worker-side JOSE token verification; the reviewed application code does not intentionally use the Node gRPC server-authentication APIs.

## CI treatment

The Studio HQ workflow uses the committed `bun.lock` as its dependency source of truth. It installs with `bun install --frozen-lockfile --ignore-scripts`, so CI fails if `package.json` and the committed lockfile disagree and does not execute dependency lifecycle scripts during installation. The workflow also runs `bun audit --json`, which audits the versions recorded in the lockfile rather than a separately resolved npm dependency tree.

`scripts/check-dependency-audit.mjs` permits only the two exact reviewed GHSA identifiers and the reviewed Firebase/gRPC package chain. An unknown report schema, new advisory, unexpected package, severity, or incomplete advisory record fails CI. The raw audit JSON is retained in the runner temporary directory for the job.

After the production frontend build and Wrangler dry-run bundle are generated, `scripts/verify-no-grpc-runtime.mjs` scans both artifact directories for the gRPC package marker and server-authentication API markers. A match or missing artifact directory fails CI. This is a bundle-content regression guard, not proof that all upstream advisory scenarios are impossible.

These checks are a narrowly scoped CI exception and a regression guard. They are not a claim that the upstream dependency has been patched, nor a substitute for upgrading to a vendor-fixed dependency when Firebase/Firestore constraints permit it. Reassess and remove this exception when the dependency chain resolves to a patched `@grpc/grpc-js` release.

## Explicitly not done

- No Firebase downgrade.
- No forced dependency override.
- No blanket audit suppression.
- No production deployment or Cloudflare configuration change.
