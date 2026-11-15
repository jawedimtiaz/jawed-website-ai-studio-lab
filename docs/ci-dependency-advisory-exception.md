# CI dependency advisory exception

## Scope

The CI audit currently reports two reviewed advisories, GHSA-m9gg-hp2v-232j (high) and GHSA-f596-whhp-79r4 (low), through the Firebase Firestore dependency chain. The affected package entries observed during review were:

- `firebase`
- `@firebase/firestore`
- `@firebase/firestore-compat`
- `@grpc/grpc-js`

The advisory concerns gRPC server-authentication credential configurations. The application uses Firebase's browser SDK and Cloudflare Worker-side JOSE token verification; the reviewed application code does not intentionally use the Node gRPC server-authentication APIs.

## CI treatment

CI does not disable npm audit and does not ignore all high-severity findings. `scripts/check-dependency-audit.mjs` permits only those two exact GHSA identifiers and the exact reviewed four-package dependency chain. The aggregate npm package severity can be high because the package is affected by the high-severity advisory; both advisory identifiers must match the reviewed set. A new package, severity, or advisory fails the check. The complete npm audit JSON remains available in the job log.

After the production frontend build and Wrangler dry-run bundle are generated, `scripts/verify-no-grpc-runtime.mjs` scans both artifact directories for the gRPC package marker and server-authentication API markers. A match or missing artifact directory fails CI.

These checks are a narrowly scoped CI exception and a bundle-content regression guard. They are not a claim that the upstream dependency has been patched, nor a substitute for upgrading to a vendor-fixed dependency when Firebase's dependency constraints permit it. Reassess and remove this exception when the Firebase/Firestore dependency chain resolves to a patched `@grpc/grpc-js` release.

## Explicitly not done

- No Firebase downgrade.
- No forced dependency override.
- No blanket audit suppression.
- No production deployment or Cloudflare configuration change.
