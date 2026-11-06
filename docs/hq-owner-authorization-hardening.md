# Studio HQ Owner Authorization Hardening Specification & Manual

## Architecture Overview

Studio HQ uses a defense-in-depth authorization model combining **Firebase Authentication** with **Cloudflare D1 Database Authorization**. Every HQ API endpoint (`/api/hq/*`) enforces token verification and owner status checks before granting access to HQ resources (Session, CRM Clients, Projects, Tasks, Milestones).

---

## 1. First-Owner Bootstrap Procedure

### Controlled Enrollment Policy
* **No Public Registration**: HQ APIs do not expose public registration endpoints.
* **Firebase Token Identity**: The browser cannot supply arbitrary user IDs or email addresses. Identity is strictly extracted from the verified Firebase RS256 ID Token (`uid` and `email`).
* **Allowlist Enforcement**: The email address in the Firebase token must match the configured owner allowlist (`HQ_ALLOWED_OWNER_EMAILS` or `jawedimtiaz@gmail.com`).
* **Atomic First-Owner Initialization**:
  1. When an incoming request presents a valid Firebase ID token for an allowlisted email, the authorization handler inspects `hq_users`.
  2. If `hq_users` is completely empty (`COUNT(*) === 0`), the handler atomically enrolls the user as the initial owner with `role = 'owner'` and `status = 'active'`.
  3. An audit record (`OWNER_ENROLLED`) is written to `hq_audit_logs`.
  4. Subsequent requests by unregistered UIDs are rejected with `HTTP 403 OWNER_NOT_ENROLLED`.

---

## 2. Owner Disable Procedure

To disable an owner's access (e.g., during emergency response or key rotation):

### Step A. Execute D1 Command via Wrangler CLI
Run the following SQL statement against the remote `HQ_DB` database:

```bash
npx wrangler d1 execute HQ_DB --remote --command="
  UPDATE hq_users 
  SET status = 'disabled', updated_at = strftime('%s', 'now') * 1000 
  WHERE id = 'TARGET_FIREBASE_UID';
"
```

### Step B. Effect & Verification
* On the next API call (including session checks, CRM, or Projects operations), `verifyAndAuthorizeOwner()` detects `status = 'disabled'`.
* The API logs `OWNER_DISABLED_REJECTED` in `hq_audit_logs` and immediately returns `HTTP 403 OWNER_DISABLED` ("Owner account is disabled. Access denied.").
* **Active Protection**: Login attempts or ordinary API operations **never** overwrite or reactivate a disabled status.

---

## 3. Owner Recovery Procedure

To reactivate a disabled owner or enroll a secondary owner after bootstrap:

### Step A. Execute Authorized Recovery D1 Command
Run the following SQL statement via the Wrangler CLI or Cloudflare Dashboard console:

```bash
npx wrangler d1 execute HQ_DB --remote --command="
  UPDATE hq_users 
  SET status = 'active', updated_at = strftime('%s', 'now') * 1000 
  WHERE id = 'TARGET_FIREBASE_UID' AND email = 'jawedimtiaz@gmail.com';
"
```

### Step B. Audit Record
After manual status recovery, insert an audit log entry:

```bash
npx wrangler d1 execute HQ_DB --remote --command="
  INSERT INTO hq_audit_logs (id, user_id, action, status, details, ip_address, created_at)
  VALUES (
    lower(hex(randomblob(16))), 
    'TARGET_FIREBASE_UID', 
    'OWNER_RECOVERED_MANUAL', 
    'SUCCESS', 
    'Manual owner status recovery via admin CLI', 
    'admin-cli', 
    strftime('%s', 'now') * 1000
  );
"
```

---

## 4. D1 Migration Requirements

Execute the schema migration script prior to enabling HQ API routes in production:

```bash
npx wrangler d1 execute HQ_DB --remote --file=./migrations/0002_hq_owner_authorization_hardening.sql
```

### Migration Tables Created:
* `hq_users`: User identities (`id`, `email`, `role`, `status`, `created_at`, `updated_at`, `last_login_at`).
* `hq_audit_logs`: Security audit history (`id`, `user_id`, `action`, `status`, `details`, `ip_address`, `created_at`).
* `hq_clients`: CRM records (`id`, `name`, `company`, `email`, `phone`, `status`, `created_at`, `updated_at`).
* `hq_projects`: Projects (`id`, `client_id`, `title`, `description`, `status`, `budget`, `created_at`, `updated_at`).
* `hq_tasks`: Tasks (`id`, `project_id`, `title`, `status`, `priority`, `due_date`, `created_at`, `updated_at`).
* `hq_milestones`: Milestones (`id`, `project_id`, `title`, `status`, `target_date`, `created_at`, `updated_at`).

---

## 5. Security Assumptions

1. **Firebase Authentication**: Assumes Firebase securely verifies user credentials and issues RS256 JWT tokens. `email_verified` must be `true`.
2. **Exact Email Allowlist**: `HQ_ALLOWED_OWNER_EMAILS` restricts allowed owner emails.
3. **Database Fail-Closed**: If `HQ_DB` is missing or fails to execute queries, all HQ API endpoints fail closed with `HTTP 503 DATABASE_UNAVAILABLE`.
4. **Immutable Authorization Checks**: CRM and Projects CRUD operations execute `verifyAndAuthorizeOwner()` on every request and never modify `hq_users.status`.

---

## 6. Known Limitations

1. **Short-Lived In-Memory Token Caching**: Firebase ID tokens expire in 1 hour; token revocation in Firebase Console takes effect when the token expires or when user signs out.
2. **Single-Region SQLite Locks**: Cloudflare D1 uses primary SQLite replication; concurrent writes are serialized by D1.
