# Verified Portfolio Live Mapping

Source: user-uploaded XLSX export dated 2026-11-19. This is not a live Google Sheets connection.

- Sheet: Portfolio Live
- Header row: 12
- Holdings rows: 13–49 (filter non-empty name/symbol; exclude blank rows)
- Summary values are formulas/cached values and must be verified in the live Google Sheet.

| Column | Header | Tracker field |
|---|---|---|
| A | Broker | broker |
| B | Stock/Fund Name | name |
| C | Symbol | ticker |
| D | Invested Amount | investedValueInr |
| E | Units | quantity |
| F | NAV/CMP | currentPrice for INR instruments |
| G | Current Value | valueInr |
| H | Average Buy Price | averageBuyPrice |
| I | Current Allocation % | allocationPct |
| J | Gap % | allocationGapPct |
| K | Role | role |
| L | Bucket | bucket |
| M | Asset Class | category |
| N | Investment Goal | investmentGoal |
| O | AI Score | aiScore |
| P | Conviction | conviction |
| Q | Risk | risk |
| R | Expected CAGR | expectedCagr |
| S | Status | thesisStatus |
| T | Priority | priority |
| U | Unrealised P/L | unrealizedPnlInr |
| V | Unrealised % | pnlPct |
| W | Maximum Allocation % | maxAllocationPct |
| X | Target % | targetPct |
| Y | CMP (USD) | currentPrice for US assets |
| Z | 52W High (USD) | high52w |
| AA | % Below 52W High | drawdownPct |
| AB | Price Integrity | priceIntegrity |
| AC | Action | action |
| AD | Master Signal | masterSignal |
| AE | Trigger Alert | triggerAlert |
| AF | Capital Deployment | capitalDeployment |
| AG | Decision Reason | decisionReason |

Summary / constants:
- USD/INR: K1 (cached export value 95.41; verify live)
- USD Cash: row 49, symbol CASH, value G49 (cached 245,585.34 INR; units E49=2,574 USD)
- Total portfolio: B2 (cached export value 9,776,321.088 INR)
- Cash INR value: B3/G49

Mapping rules:
1. Use G as INR market value for every position.
2. Use D as invested cost.
3. Use U and V for source P&L, where valid.
4. For US Equity: currency USD, currentPrice Y, quantity E, symbol C, valueInr G.
5. For INR assets: currency INR, currentPrice F, quantity E, symbol C, valueInr G.
6. Preserve asset class values from M. Blank asset-class rows must be flagged or safely inferred from clear instrument/ticker context; never guess silently.
7. Exclude empty rows and avoid adding summary rows as holdings.
8. Allocation values should be source I if valid; otherwise derive valueInr / totalValueInr.
9. Goal, role, bucket, conviction, risk, score, status, priority, target, and thesis metadata are optional extra fields. Initial app schema may only display some of them; preserve them in feed only if schema is safely extended.
10. Do not expose other workbook tabs or personal/tax data in the first feed.

Architecture recommendation:
- Read-only Apps Script extracts only Portfolio Live.
- Cloudflare Worker proxy protects the endpoint using bearer auth, keeps upstream endpoint/token server-side, and returns normalized JSON to the tracker.
- The browser never receives spreadsheet credentials.
- Never write back to the workbook.

Cached XLSX values are for structural review only, not live market data.
