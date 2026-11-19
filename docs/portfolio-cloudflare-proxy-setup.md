# Portfolio Tracker Cloudflare Proxy

The Portfolio Tracker should connect to the same-origin endpoint:

`/api/portfolio`

The Worker proxies to a Google Apps Script Web App and keeps the Apps Script URL/token in Cloudflare Worker secrets.

## Worker secrets / variables

Configure in Cloudflare Dashboard → Workers & Pages → jawed-website-ai-studio-lab → Settings → Variables and Secrets:

- `PORTFOLIO_FEED_URL` (secret or encrypted variable): complete Apps Script `/exec` URL, without the token query string.
- `PORTFOLIO_FEED_TOKEN` (secret): the token stored in Apps Script Script Properties.

Do not commit either value.

## Tracker setup

In Portfolio Tracker → Data Source settings:

- Endpoint URL: `/api/portfolio`
- Auth Token: leave blank

The Worker reads the secret values server-side and adds the token to the Apps Script request. It returns the Apps Script JSON envelope unchanged for the existing normalization service.

## Security and behavior

- GET only.
- Missing configuration returns HTTP 503.
- Invalid/unavailable upstream returns HTTP 502 with a generic error.
- No token or upstream URL is returned to the browser.
- Responses use `Cache-Control: private, no-store`.
- Source is read-only; no spreadsheet writes are performed.
