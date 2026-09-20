# ArcMilestone Backend

Go API for the ArcMilestone offchain marketplace. Uses the Go standard library's `net/http` package and `database/sql` with the MySQL driver — no ORM.

---

## Architecture

```
HTTP client
    │
    ▼
routes/routes.go          ← central route registration; CORS + logging applied globally
    │
    ▼
handlers/                 ← decode JSON, validate input, call service, write JSON response
    │
    ▼
services/                 ← business rules, domain errors, coordinate repositories
    │
    ▼
repositories/             ← parameterised SQL, no business logic
    │
    ▼
database/sql + MySQL driver
    │
    ▼
MySQL (arcmilestone database)
```

### Marketplace vs blockchain separation

MySQL is the authority for **offchain marketplace state**:

- Users and wallet identities
- Authentication nonces (single-use, hashed, expiring challenges)
- Jobs (marketplace metadata, hiring method, status, deadlines)
- Applications (cover letters, estimated days, acceptance state)
- Submissions (delivery URL and notes)
- Notifications (user-facing convenience messages)
- Indexed copies of blockchain event logs (for display/search only)

**The ArcMilestone smart contract is the authority for escrow/payment state:**

- Escrow balance and funding
- Onchain job ID, client/freelancer wallets
- Deliverable hash recorded by the contract
- Payment and refund outcomes

The Go backend never signs transactions, never stores wallet private keys or seed phrases, and never claims that a job is funded based on a client API request alone. The `escrow_status` column on `jobs` is an indexed copy of contract events — not a payment ledger.

---

## Requirements

- **Go 1.22+** (module declares `go 1.26.8`; Go 1.22 method+pattern routing syntax is used)
- **MySQL 8.0+**
- Environment variables listed below

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your local values. Variables explicitly set in the shell always override `.env`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP server port |
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | _(required)_ | MySQL username |
| `DB_PASSWORD` | _(required)_ | MySQL password — never commit this |
| `DB_NAME` | `arcmilestone` | MySQL database name |
| `DB_SSL_MODE` | `disable` | `disable`, `preferred`, or `required` |
| `MYSQL_DSN` | _(empty)_ | Full DSN override; takes precedence over `DB_*` when set |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `ARC_RPC_URL` | _(empty)_ | Arc network RPC endpoint (future use) |
| `ARC_CONTRACT_ADDRESS` | _(empty)_ | ArcMilestone contract address (future use) |
| `AUTH_SECRET` | _(required)_ | Secret key for HMAC-SHA512 session tokens — never commit this |

**Never commit real credentials, private keys, seed phrases, or keystore files.**

---

## Database Setup

Apply migrations in order against the `arcmilestone` database. DBeaver is only a client — the MySQL server must already be running.

```bash
# Start MySQL (systemd)
sudo systemctl start mysql

# Create the database once
mysql -u <your-user> -p -e "CREATE DATABASE arcmilestone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Apply migration 001 (initial schema)
mysql -u <your-user> -p arcmilestone < database/migrations/001_initial_schema.sql

# Apply migration 002 (removes proposed_amount from applications)
mysql -u <your-user> -p arcmilestone < database/migrations/002_remove_proposed_amount.sql
```

The migration files are the schema source of truth. Apply them in numerical order. They do not create or drop the database — they target whichever database is currently selected.

---

## Running

From the `backend/` directory:

```bash
go run ./cmd/api
```

The server starts on `http://localhost:8080` by default. Override the port with the `PORT` environment variable.

Check the health endpoint:

```bash
curl http://localhost:8080/api/health
```

Expected:

```json
{"service":"ArcMilestone API","status":"ok"}
```

Stop with `Ctrl+C`. The server handles `SIGINT` and `SIGTERM` and drains in-flight requests before exiting.

---

## API

All JSON request bodies must set `Content-Type: application/json`. Protected endpoints require `Authorization: Bearer <token>` where `<token>` is obtained from `POST /api/auth/verify`.

Error responses follow this envelope:

```json
{"error": "human-readable message", "fields": {"field_name": "message"}}
```

`fields` is only present for validation errors (HTTP 422).

---

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | public | Returns `{"status":"ok","service":"ArcMilestone API"}` |

---

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/nonce` | public | Request a wallet-signature challenge |
| `POST` | `/api/auth/verify` | public | Submit signed challenge, receive session token |
| `GET` | `/api/auth/me` | **required** | Return the authenticated user |
| `POST` | `/api/auth/logout` | **required** | Invalidate session (client-side; returns 204) |

**POST /api/auth/nonce**
```json
{"wallet_address": "0x..."}
```
Response:
```json
{"nonce": "<64-char hex>", "expires_at": "<RFC3339>"}
```

**POST /api/auth/verify**
```json
{"wallet_address": "0x...", "nonce": "<plaintext nonce>", "signature": "0x..."}
```
Response:
```json
{"token": "<session token>", "user": {...}}
```

---

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/me` | **required** | Return the authenticated user's profile |
| `PATCH` | `/api/users/me` | **required** | Update display name and/or email |

**PATCH /api/users/me** — all fields optional:
```json
{"display_name": "Alice", "email": "alice@example.com"}
```

---

### Jobs

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/jobs` | **required** | Create a new job (starts as `draft`) |
| `GET` | `/api/jobs` | public | List open jobs; `?mine=true` lists caller's jobs (auth required) |
| `GET` | `/api/jobs/{id}` | public | Get a single job by ID |
| `PATCH` | `/api/jobs/{id}` | **required** | Edit a `draft` or `open` job (creator only) |
| `POST` | `/api/jobs/{id}/publish` | **required** | Transition `draft` → `open` (creator only) |
| `POST` | `/api/jobs/{id}/cancel` | **required** | Cancel a `draft`, `open`, or `reviewing_applications` job (creator only) |

**POST /api/jobs** body:
```json
{
  "hiring_method": "open",
  "title": "Build a smart contract",
  "description": "...",
  "required_skills": ["Solidity", "Hardhat"],
  "budget": "500.000000000000000000",
  "delivery_deadline": "2025-12-01T00:00:00Z",
  "application_deadline": "2025-11-01T00:00:00Z",
  "reference_url": "https://...",
  "freelancer_wallet": null
}
```

`budget` is a decimal string — never a float. `freelancer_wallet` is used only with `hiring_method: "direct"`.

Marketplace status lifecycle:
```
draft → open → reviewing_applications → awaiting_funding → in_progress → completed
                                                                        ↘ cancelled
```

`escrow_status` is a separate, nullable field (`funded | work_submitted | completed | refunded`) that mirrors the onchain contract state. The contract is authoritative; this field is an indexed copy only.

---

### Applications

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/jobs/{id}/applications` | **required** | Apply to a job |
| `GET` | `/api/jobs/{id}/applications` | **required** | List applications for a job (creator only) |
| `GET` | `/api/applications/me` | **required** | List the caller's own applications |
| `POST` | `/api/jobs/{id}/applications/{applicationId}/accept` | **required** | Accept an application (creator only) |
| `POST` | `/api/jobs/{id}/applications/{applicationId}/reject` | **required** | Reject an application (creator only) |
| `POST` | `/api/applications/{id}/withdraw` | **required** | Withdraw own pending application |

**POST /api/jobs/{id}/applications** body:
```json
{
  "cover_letter": "I am a great fit because...",
  "estimated_days": 14,
  "portfolio_url": "https://..."
}
```

There is no `proposed_amount` field. Applications are for the job's fixed funded amount.

Business rules enforced by the service:
- Job must be `open` or `reviewing_applications`
- Application deadline must not have passed
- Job creator cannot apply to their own job
- Duplicate applications (same user + same job) are rejected
- Accepting an application selects that user as the job's freelancer and rejects all other pending applications
- Only the creator may accept or reject; only the applicant may withdraw

---

### Submissions

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/jobs/{id}/submission` | **required** | Submit work for a job |
| `GET` | `/api/jobs/{id}/submission` | **required** | Get the submission for a job |

**POST /api/jobs/{id}/submission** body:
```json
{"submission_url": "https://...", "notes": "Deliverable is at..."}
```

Business rules:
- Caller must be the job's selected freelancer
- Job must be `in_progress`
- One submission per job (enforced by `UNIQUE(job_id)` in the schema)

The submission URL and notes are offchain. `deliverable_hash` and `submission_transaction_hash` are nullable and updated later when the onchain transaction confirms.

---

### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | **required** | List all notifications for the caller, newest first |
| `GET` | `/api/notifications/unread` | **required** | List unread notifications only |
| `PATCH` | `/api/notifications/{id}/read` | **required** | Mark a notification as read (owner only) |

Notifications are created automatically by the backend when key events occur (new application, application accepted, work submitted). They are not financial records.

---

## Authentication

The backend implements **EIP-191 `personal_sign` wallet authentication** without passwords or private-key storage.

1. Client sends `POST /api/auth/nonce` with the user's wallet address.
2. Backend normalises the address to lowercase, finds or creates the user, generates 32 bytes of cryptographically random data, hex-encodes it as the plaintext nonce, stores only the **SHA-256 hash** of that nonce, and returns the plaintext.
3. Client passes the plaintext nonce to the wallet (MetaMask, WalletConnect, or any EIP-191-compatible wallet), which signs it and returns a 65-byte signature.
4. Client sends `POST /api/auth/verify` with the wallet address, the original plaintext nonce, and the hex-encoded signature.
5. Backend verifies:
   - The nonce hash matches a valid, unused, unexpired record in `auth_nonces`
   - The nonce belongs to the expected wallet address
   - The EIP-191 signature recovers the correct wallet address (using secp256k1 public-key recovery via `github.com/decred/dcrd/dcrec/secp256k1`)
6. Backend marks the nonce as used (replay prevention), then issues a session token.
7. The session token is `base64url(payload) + "." + base64url(HMAC-SHA512(payload, AUTH_SECRET))` where `payload` encodes user ID, expiry timestamp, and wallet address. It is **not a JWT** but has equivalent security properties for this application.
8. Client includes the token in subsequent requests as `Authorization: Bearer <token>`.

Security properties:
- Plaintext nonces are never stored — only SHA-256 hashes
- Nonces expire after 10 minutes
- Nonces are single-use — the `used_at` column prevents replay
- Wallet private keys never touch the backend
- Session tokens expire after 24 hours
- Token MAC uses constant-time comparison (`hmac.Equal`)

---

## Tests

```bash
# From backend/
go test ./...
go vet ./...
go build ./...
gofmt -l .       # should print nothing
```

Tests do not require a live database. Repository integration tests verify struct shapes, column lists, and normalization logic. Handler tests use `net/http/httptest` and verify HTTP behaviour end-to-end without hitting MySQL.

---

## Remaining Work

The following items are not yet implemented:

1. **Blockchain event listener** — `services/arc_listener.go` is a stub. A future implementation would poll or subscribe to Arc contract logs, decode events, and call `BlockchainEventRepository.Create` for idempotent storage, then update `jobs.escrow_status` and `jobs.marketplace_status` where appropriate. The repository layer and schema are ready.

2. **Submission update endpoint** — `SubmissionRepository.Update` exists but no HTTP endpoint exposes it. This would allow recording `deliverable_hash` and `submission_transaction_hash` once the onchain transaction confirms (likely driven by the event listener, not a direct API call).

3. **Pagination** — list endpoints (`GET /api/jobs`, `GET /api/jobs/{id}/applications`, `GET /api/notifications`, etc.) return all matching rows. Cursor- or offset-based pagination should be added before the dataset grows large.

4. **Token revocation** — the current session token scheme is stateless; there is no server-side revocation list. `POST /api/auth/logout` is a client-side operation. A blocklist (in Redis or a `revoked_tokens` table) would be needed for hard logout support.

5. **Rate limiting** — no rate limiting is applied to the nonce endpoint or other public endpoints.

6. **Production hardening** — TLS termination, structured/JSON logging, metrics, health-check database probe, and deployment configuration are all outside the current scope.
