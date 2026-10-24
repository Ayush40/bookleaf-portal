# API Reference

Base URL: `/api` · JSON in/out · Auth: `Authorization: Bearer <JWT>` on everything except `/health` and `/auth/login`.

**Roles:** `author` (sees only their own data, scoped by the token) and `admin` (everything, under `/api/admin/*` plus `/api/books`).

**Error format** (always): `{ "error": { "code": "VALIDATION_ERROR", "message": "Subject must be at least 5 characters", "details": [{ "field": "subject", "message": "…" }] } }`

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_BOOK`, `INVALID_ASSIGNEE` |
| 401 | `UNAUTHENTICATED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (wrong role) |
| 404 | `NOT_FOUND` (also returned for other authors' resources) |
| 409 | `DUPLICATE_TICKET`, `TICKET_CLOSED` |
| 413 / 429 | `PAYLOAD_TOO_LARGE` / `RATE_LIMITED` |

## Auth
### `POST /auth/login`
Body `{ "email": "ananya.reddy@email.com", "password": "Author@123" }` →
`200 { "token": "<jwt>", "user": { "id", "name", "email", "role", "authorId" } }`. Rate limited (30 / 15 min / IP).
### `GET /auth/me` → `{ "user": {…} }`

## Books
### `GET /books` → `{ "items": [Book] }`
Author: own books. Admin: all, optional `?authorId=AUTH003`.
### `GET /books/:bookId` → `{ "book": Book }` (404 if not yours)

`Book`: `bookId, title, isbn, genre, status, isLive, publicationDate|null, mrp|null, royaltyPerCopy|null, copiesSold, royaltyEarned, royaltyPaid, royaltyPending, lastPayoutDate|null, printPartner|null, availableOn[], productionStage|null, productionStageIndex, royalty: { state, note, nextPayoutBy, quarterEnd }`
`royalty.state` ∈ `in_production | no_sales | settled | below_threshold | overdue_review | pending`.

## Author tickets (role: author)
### `POST /tickets` → `201 { ticket }`
Body: `{ "bookId": "BK005" | "general" | null, "subject": "5-150 chars", "description": "20-5000 chars", "attachments": ["photo.jpg"] (≤5, names only) }`.
Saves immediately with rule-based category/priority, then classifies with AI in the background. 20/hour/author.
### `GET /tickets` → `{ items: [Ticket] }` (most recently updated first)
### `GET /tickets/:id` → `{ ticket: { …, messages: [{ id, sender: "admin"|"author", senderName, body, createdAt }] } }`
Never includes priority, AI fields, internal notes or assignee.
### `POST /tickets/:id/messages` → `201 { ticket }`
Body `{ "body": "…" }`. Reopens a `Resolved` ticket; `409 TICKET_CLOSED` if `Closed`.

## Admin (role: admin)
### `GET /admin/tickets`
Query (all optional): `status, category, priority, assigned (me|unassigned|<adminId>), q (subject/description/author/BL-0001), from, to (YYYY-MM-DD), sort (urgency|oldest|newest, default urgency), limit (≤200), offset`.
Default `urgency` order: unresolved first → Critical > High > Medium > Low → oldest first.
→ `{ items: [TicketRow], total }` where `TicketRow` adds `priority, categorySource, prioritySource ("rules"|"ai"|"admin"), aiStatus ("pending"|"done"|"failed"|"skipped"), authorName, assigneeName, lastSender`.
### `GET /admin/tickets/:id` → `{ ticket }` incl. `author, book (with royalty state), messages, notes, draft: { text, source: "ai"|"template" } | null, aiReason`
### `PATCH /admin/tickets/:id`
Body: any of `{ status, category, priority, assignedTo: "me" | <adminId> | null }` (≥1 field). Changing category/priority marks it as an admin override (AI will never overwrite it). Assigning an `Open` ticket moves it to `In Progress`.
### `POST /admin/tickets/:id/draft` → `{ draft, source: "ai"|"template", warning|null }`
Generates/regenerates. **Never fails because of the AI**: falls back to a template using real data.
### `POST /admin/tickets/:id/reply` → `201 { ticket }`
Body `{ "body": "…", "status": "Resolved" (optional) }`. Visible to the author immediately. Default status change: `Open → In Progress`. `409` if Closed and no status given.
### `POST /admin/tickets/:id/notes` → `201 { ticket }` Body `{ "body": "…" }` (internal only)
### `POST /admin/tickets/:id/reclassify` → `{ ticket }` re-runs AI classification
### `GET /admin/stats` → `{ tickets: { open, inProgress, resolved, criticalOpen, unassigned, overdue }, ai: { enabled, calls, failedCalls, promptTokens, outputTokens } }`
### `GET /admin/admins` → `{ items: [{ id, name, email }] }`

## Health
### `GET /health` → `{ status: "ok", ai: "configured"|"not configured", model: {…} }`

## Example
```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@bookleaf.com","password":"Admin@123"}' | jq -r .token)
curl -s "localhost:4000/api/admin/tickets?priority=Critical&status=Open" -H "Authorization: Bearer $TOKEN"
```
