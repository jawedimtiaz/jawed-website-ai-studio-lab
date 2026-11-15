# Studio HQ — Zero-Cost Architecture Requirement & Governance Contract

## Mandatory Zero-Cost Policy

The entire Jawed Web Studio platform, infrastructure, and Studio HQ operations must operate strictly using **free services only**. Under no circumstances will paid subscriptions, billing accounts, or paid API usage be introduced.

---

## 1. Absolute Operating Restrictions

1. **No Paid Subscriptions**: All services must be permanently zero-cost.
2. **No Paid API Calls**: Third-party APIs requiring payment or billing instruments are prohibited.
3. **No Paid AI Models**: AI operations utilize free-tier quotas only (e.g. Google Gemini free tier). Paid model upgrades are strictly banned.
4. **No Cloudflare Workers Paid Plan**: Operates exclusively within Cloudflare's free tier limits (Workers Free: 100,000 requests/day; Cloudflare D1 Free: 5,000,000 reads/day, 100,000 writes/day, 5 GB storage).
5. **No Firebase Blaze Plan**: Authentication runs strictly on the Firebase Spark (Free) plan with Google Sign-in. No paid phone/SMS auth or Blaze plan upgrades.
6. **No Paid GitHub Features**: Operates strictly within free public/open-source repository allowances.
7. **No Paid Database Services**: Relies solely on Cloudflare D1's free tier. No external paid database instances.
8. **No Paid Third-Party Integrations**: No paid SaaS, payment gateways, transactional email APIs, or third-party paid tooling.
9. **No Automatic Billing Upgrades**: System configurations must never authorize automatic tier upgrades, overage charges, or credit card attachments.
10. **No Paid Fallback Providers**: Systems must never fail over to paid services.

---

## 2. Quota Exhaustion & Graceful Degradation Contract

* **Fail Closed / Fail Graceful**: When a free tier limit or quota is reached, the application must gracefully report the operational limitation to the user rather than attempting an automatic upgrade or paid fallback.
* **No Temporary Trials**: Free trials requiring credit cards or transitioning to paid plans after a trial period are classified as paid services and prohibited.
* **Audit & Validation**: Every architecture review and feature proposal must verify 100% compliance with this zero-cost contract before implementation.
