# Portfolio Tracker — Google Sheets Integration

## Current design

The Portfolio Tracker fetches a JSON payload matching `PortfolioData`. Your Google Sheet remains the source of truth. The app's current settings modal stores the endpoint URL and optional bearer token in browser localStorage; portfolio data currently lives in React state and is not persisted as a durable snapshot.

Your investment workbook has previously been identified as containing tabs including:
- `Portfolio Live` (primary portfolio engine)
- `Rebalance Dashboard`
- `Auto_Buy_Dashboard`
- `Retirement`
- `Master Financial Map`
- `US_Stock_Master`
- `Watchlist`
- `India_View`
- `Tax & LRS Tracker`
- `Executive Summary`
- `Decision Engine`
- `Calc_Data`
- `Morning Dashboard`

The exact headers and column layout of the live workbook must be inspected before mapping. Do not guess column indexes or change the user's sheet.

## Recommended architecture

Google Sheet → Google Apps Script Web App (read-only) → JSON → Portfolio Tracker.

The Apps Script should:
1. Read the configured sheet(s) by header name, not hard-coded column position.
2. Return a normalized `PortfolioData` payload.
3. Use a server-side secret token stored in Script Properties; never hard-code a secret in source.
4. Include `meta.lastUpdated` and the USD/INR rate.
5. Expose only portfolio data required by this dashboard; do not expose unrelated workbook tabs or personal/financial planning details.
6. Return errors as JSON without leaking sheet contents or credentials.
7. Be deployed as a Web App and tested before connecting it to the live dashboard.

## Expected JSON schema

The app accepts this structure (some arrays may be omitted and normalized by the client):

```json
{
  "meta": {
    "lastUpdated": "ISO-8601 timestamp",
    "usdInr": 0,
    "lrsUsedUsd": 0,
    "lrsUsedInr": 0,
    "lrsAnnualLimitUsd": 250000
  },
  "summary": {
    "totalValueInr": 0,
    "investedValueInr": 0,
    "unrealizedPnlInr": 0,
    "unrealizedPnlPct": 0,
    "cashBalanceInr": 0,
    "investedPct": 0
  },
  "allocation": [],
  "holdings": [],
  "snapshots": [],
  "watchlist": [],
  "events": [],
  "retirement": {},
  "theses": []
}
```

## Holdings fields

Each holding should map to:
- `ticker` (or `symbol`)
- `name` (or `company`)
- `market` (`IN`, `US`, `MF`, etc.)
- `role`
- `currentPrice`
- `currency` (`INR` or `USD`)
- `valueInr`
- `allocationPct`
- `pnlPct`
- `thesisStatus`
- optional `sector`, `targetPct`, `thesisNote`

## Important safety / privacy notes

- Use a read-only integration. The tracker must never write to the investment workbook.
- Do not expose any other tabs, tax records, account numbers, family data, insurance, or credentials.
- Avoid publishing a public endpoint without a token check.
- Do not put the token in the repository, browser logs, or the endpoint URL that is shared publicly.
- Test with a small, sanitized response before returning real holdings.
- Google Apps Script web-app authentication and CORS behavior must be verified in the actual deployment. If direct browser fetching is blocked, use a controlled proxy or a compatible endpoint rather than weakening workbook access.

## User-side step required

Before finalizing the mapping, we need the exact headers/column names and formulas from the `Portfolio Live` tab and the relevant US/India data tabs. The assistant cannot directly inspect the user's private Google Sheet from the currently connected tools. A copy of the header rows (or a sanitized export of those tabs) is sufficient; do not share account numbers, credentials, or personal identifiers.

## Implementation phases

1. Inspect workbook structure and confirm source tabs/headers.
2. Map columns to the tracker schema.
3. Create Apps Script endpoint using header-based mapping.
4. Deploy and test JSON endpoint with a sanitized sample.
5. Connect tracker and validate totals against the source workbook.
6. Add persistent last-synced snapshot, auto-sync, stale-data warning, and error fallback.
