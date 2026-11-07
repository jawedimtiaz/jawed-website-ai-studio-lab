# AI origin and knowledge source contract

## Browser-origin trust boundary

The public AI API is callable from the Jawed Web Studio site and its controlled preview environments. It must not trust arbitrary third-party hosting origins merely because they use a common platform suffix.

Allowed browser origins:
- HTTPS on jawed.co.in and its subdomains.
- HTTPS on the exact Cloudflare Pages project domain jawed-website-ai-studio-lab.pages.dev and its branch/commit preview subdomains.
- HTTPS on the two known Workers.dev hosts owned by this project: jawed-website-ai-studio-lab.jawed-eee.workers.dev and jawed-studio-hq-preview.jawed-eee.workers.dev.
- HTTP or HTTPS localhost/127.0.0.1 for local development.

Rejected:
- Arbitrary *.workers.dev, *.pages.dev and *.run.app origins.
- Non-HTTPS production origins.
- Malformed origins, origins containing paths, and the opaque "null" origin.

Requests with no Origin header remain permitted for non-browser/server-to-server callers. Browser CORS responses echo only a validated origin; they never use a wildcard.

## AI knowledge source contract

The sitemap includes two tool routes implemented as React-rendered pages rather than standalone HTML files:
- /tools/apple-macos-jamf-support-helper/
- /tools/m365-workplace-sign-in-diagnostic/

For these routes, the content source of truth is the corresponding toolsData.ts entry, rendered by ToolDetailPage.tsx and the mapped tool component. The AI knowledge inventory must contain a reviewed summary and keywords for each route. If either the data entry or component mapping changes, re-review the associated knowledge summary and update reviewed_against_sitemap_on.

The AI runtime knowledge bundle must be regenerated from assets/data/ai-knowledge.json; do not edit the generated bundle independently.
