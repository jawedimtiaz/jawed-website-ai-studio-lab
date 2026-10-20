# Security Specification: IT Service Request & Tracking System

## 1. Data Invariants
1. **Identity Binding**: A ticket's `clientId` MUST strictly match `request.auth.uid`. A client cannot forge or assign a ticket to another user UID.
2. **Email Consistency**: The ticket's `clientEmail` must match the authenticated user's email (`request.auth.token.email`).
3. **Immutability of Origin**: `clientId`, `createdAt`, and original core submission values cannot be overwritten or hijacked during updates.
4. **Field Technician Authorization**: Only authorized field technicians or administrators (bootstrapped admin: `jawedimtiaz@gmail.com` or verified entries in `/admins/{userId}`) can update ticket status or append technician resolution worklogs.
5. **Workflow State Integrity**: Status must belong strictly to `['Open', 'In Progress', 'Resolved']`.
6. **Key Whitelisting**: Payloads on creation must contain all required fields and only valid optional fields. Shadow fields (e.g. `isApproved`, `isAdmin`, `deleteSecret`) are strictly blocked.
7. **Size & Range Bounds**: Text fields are bounded by strict maximum lengths (`issueDescription` <= 2000 chars, `siteLocation` <= 150 chars, `resolutionNotes` <= 5000 chars) to prevent resource exhaustion attacks.
8. **Client Isolation**: Non-technician clients can only list/read their own tickets (`resource.data.clientId == request.auth.uid`). Technicians can read all tickets.

## 2. The "Dirty Dozen" Threat Payloads (Must be Denied)

1. **Unauthenticated Creation**:
   `POST /tickets/ticket_001` with no auth header.
2. **Identity Spoofing**:
   Client `uid_alice` attempts to submit ticket with `clientId: "uid_bob"`.
3. **Email Impersonation**:
   User with `email: "alice@example.com"` submits ticket with `clientEmail: "ceo@company.com"`.
4. **Shadow Field Injection**:
   Client injects `"isSuperAdmin": true` or `"override": true` into ticket document.
5. **Oversized Payload / Denial of Wallet**:
   Client submits `issueDescription` of 100,000 characters.
6. **Invalid Device Type Enum**:
   Client submits `deviceType: "SmartToaster9000"`.
7. **Invalid Priority Enum**:
   Client submits `priority: "MegaUrgent"`.
8. **Unauthorized Status Modification**:
   Regular client attempts to update ticket status to `"Resolved"` without technician authority.
9. **Tampering with Immutable Creation Timestamp**:
   Client attempts to modify `createdAt` or `clientId` on update.
10. **Unauthorized Cross-Client Reading**:
    Client `uid_alice` attempts to read ticket created by `uid_bob`.
11. **Self-Promoted Admin Privilege Escalation**:
    Non-admin user attempts to create or write document to `/admins/{uid_alice}`.
12. **Malformed Document ID Attack**:
    User attempts to create ticket with 2,000 character ID or directory traversal path.
