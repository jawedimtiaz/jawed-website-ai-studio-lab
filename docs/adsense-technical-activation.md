# AdSense Technical Activation Audit

Status: **pre-activation**

## ACT-02 technical audit result

- The real publisher verification meta tag is present on the current initial eligible AdSense inventory pages.
- Excluded surfaces remain outside the publisher-tag boundary until they are intentionally added to monetized inventory.
- The site already uses Referrer-Policy: strict-origin-when-cross-origin, which Google documents as sufficient for cross-origin referrer sharing needed by Google consent-management message deployment.
- The existing Content Security Policy remains restrictive and has not been weakened or pre-populated with speculative AdSense domains.
- No AdSense runtime script, ad slot, ads.txt, or Auto Ads configuration has been activated.
- Google review has been requested in AdSense; this repository audit does not represent Google approval.

## Current baseline

- ads.txt is intentionally absent before actual ad activation.
- The site uses a restrictive Content Security Policy.
- The current CSP allows the existing analytics/CDN sources but does not contain a pre-emptive AdSense exception.
- No AdSense publisher script or ad slot is present in the repository.

## Activation checks

Before enabling AdSense:

1. **Publisher identity** — use the real publisher ID from the AdSense account.
2. **Inventory/tag coverage** — every page selected for actual ad serving must have the intended publisher/CMP implementation.
3. **ads.txt** — add the exact Google-provided publisher record when the account/integration requires it.
4. **CSP** — add only the domains actually required by the final Google ad implementation and verify that the resulting policy still blocks unrelated third-party execution.
5. **Consent/CMP** — verify that final ad requests respect the configured consent mode and regional requirements. Google says pages using its consent-management solution need an up-to-date AdSense tag, and the tag must match the account where the message is configured.
6. **Network behavior** — confirm ad requests occur only on approved inventory and do not break existing AI, analytics, tools, or navigation behavior.
7. **Error handling** — verify that blocked/failed ad resources do not create broken layout, deceptive controls, or inaccessible content.

## Performance and failure safeguards

- Advertising requests must not block the initial publisher content or navigation.
- Ad runtime requests must wait for the required consent state before they are made.
- Do not add speculative advertising hosts or requests before activation.
- Do not introduce ad-runtime retry loops or page reload behavior.
- If a future ad fails, publisher content and site functionality must remain available and surrounding content must not shift after layout is established.
- Use the real Google-provided configuration at activation time and re-check the resulting network behavior.

## Do not preconfigure

- Do not add guessed Google ad domains to CSP.
- Do not add an empty or placeholder `ads.txt`.
- Do not add a guessed publisher ID.
- Do not enable ad scripts globally before consent and inventory activation are complete.

This audit records the technical dependency boundary; it is not a Google approval determination.


## Offline fallback exception — 2026-11-07

The AdSense performance safeguard scans monetized/published content and application assets for reload-dependent ad behavior. The standalone offline fallback (offline.html) is a non-monetized PWA utility page. Its explicit “Check Connection & Retry” button uses a page reload to retry navigation after connectivity returns; this is intentional offline UX and is not an advertising dependency. The validator excludes only offline.html from the page-reload assertion while continuing to reject ad runtime tokens and reload dependencies across all other scanned files.
