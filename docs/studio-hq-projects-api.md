# Studio HQ Projects API

## Scope
First project-management slice. It provides project records linked to active CRM clients. Milestones and task tables exist in D1, but their APIs are not included in this slice.

## Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/hq/projects` | List active projects |
| GET | `/api/hq/projects?archivedOnly=true` | List archived projects |
| GET | `/api/hq/projects?status=in-progress` | Filter by project status |
| GET | `/api/hq/projects?clientId=:id` | Filter by client |
| POST | `/api/hq/projects` | Create project |
| GET | `/api/hq/projects/:id` | Read project and client details |
| PATCH | `/api/hq/projects/:id` | Update allowed project fields |
| POST | `/api/hq/projects/:id/archive` | Soft-archive project |
| POST | `/api/hq/projects/:id/restore` | Restore archived project |
| GET | `/api/hq/projects/:id/milestones` | List project milestones |
| POST | `/api/hq/projects/:id/milestones` | Create milestone |
| PATCH | `/api/hq/projects/:id/milestones/:milestoneId` | Update milestone |
| GET | `/api/hq/projects/:id/tasks` | List project tasks |
| POST | `/api/hq/projects/:id/tasks` | Create task |
| PATCH | `/api/hq/projects/:id/tasks/:taskId` | Update task |

## Validation
- Project must reference an existing, non-archived client.
- Name and descriptive fields have length limits.
- Project type, status, and priority use enumerated values.
- Dates must be real `YYYY-MM-DD` dates; target date cannot precede start date.
- Currency must be a three-letter uppercase code.
- Quoted amount is a non-negative safe integer in minor currency units.
- Unknown request fields are rejected.

## Security and data integrity
- Every request uses the shared Firebase owner verifier and exact owner allowlist.
- D1 access is server-side only through `HQ_DB`.
- Prepared statements bind values; dynamic update keys are allowlisted.
- Mutations upsert the verified owner and append an audit event in a D1 batch.
- No permanent-delete route.
- Responses are no-store and receive Worker security headers.

## Remaining
- Milestone and task APIs are implemented and covered by lifecycle tests; dedicated milestone/task UI and archive/restore controls remain outstanding.
- Live Worker preview verification.
- Rate limiting and Firebase token revocation strategy.
- Customer approval, QA and release workflows.
