# AdSense Activation Contract

Status: **Ready-gated pre-activation**

This document records the account-dependent inputs that must exist before advertising code is introduced into the site.

## Required external inputs

1. **AdSense publisher account**
   - The site owner must have an active Google AdSense account and the domain must be submitted through Google's current site-review flow.
   - Do not invent or hard-code a publisher ID before it is supplied by the real AdSense account.

2. **Publisher ID**
   - Required before production AdSense tags or `ads.txt` entries are generated.
   - Store the real value only in the implementation location required by Google's current AdSense setup instructions.

3. **Consent management**
   - For personalized ads to users in the EEA, UK, or Switzerland, use a Google-certified CMP integrated with the IAB Transparency and Consent Framework as required by Google's current publisher policy.
   - The site currently has no AdSense CMP integration.

4. **Advertising decision**
   - Decide whether personalized, non-personalized, or another supported ad-serving mode will be used.
   - The privacy policy and consent flow must match the actual mode before ads are enabled.

## Google approval gate

- Production advertising activation is blocked until the AdSense Sites page reports **Ready** for `jawed.co.in`.
- `Getting ready` means Google is still running its site checks; do not inject runtime advertising code or resubmit the site solely to accelerate the review.
- `ads.txt` may be added when the real activation configuration requires it and the exact publisher record is available; its absence during review is not by itself a site-approval failure.

## Repository activation rules

- Do not add `adsbygoogle` or Google publisher ad tags while the project remains `pre-activation`.
- Do not create an `ads.txt` publisher line without the real publisher account values.
- Do not load advertising scripts globally before the consent architecture is finalized.
- Keep `/privacy/`, `/contact/`, `/ai/`, and `/tools/` outside the initial ad inventory boundary.
- Revalidate the eligible inventory immediately before activation because page content and policy requirements can change.

## Activation order

AdSense account → real publisher ID → CMP/consent configuration → privacy verification → ad inventory verification → ad tags → ads.txt → production smoke test

## Current state

A Google AdSense site-verification meta tag may be present on eligible pages as a verification marker; it does not activate ad serving. Do not add ad-serving scripts, active ad slots, or an `ads.txt` publisher record until the external account and consent gates are satisfied. No AdSense runtime ad tag, active ad slot, `ads.txt` publisher record, or repository-side CMP runtime is active.

This contract is an implementation safeguard, not a statement that Google has approved the site.
