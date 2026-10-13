# ArcMilestone

A trustless, non-custodial freelance escrow built on the Arc Testnet. Clients post fixed-price jobs and lock payment on-chain before a single line of work is written. Freelancers apply, get selected, deliver, and get paid — all enforced by a smart contract that neither party can override.

This is a proof of concept. It is a complete, working product: deployed contract, a Go API with a chain event listener, and a React frontend with wallet-based auth. The goal was to see how far an EVM chain with native USDC could take a real-world application without shortcuts.

> **Deployed contract:** [`0x9e16cC1DEC047DeAa798C757291Fd1f629Ad144d`](https://testnet.arcscan.app/address/0x9e16cC1DEC047DeAa798C757291Fd1f629Ad144d) on Arc Testnet (Chain ID `5042002`)

---

## The core problem this solves

Traditional freelance platforms sit in the middle of every transaction. They hold funds, make arbitration decisions, and charge for the privilege. The model works until it doesn't — platform insolvency, frozen accounts, arbitrary rulings, and percentage fees that compound on every job.

ArcMilestone removes the intermediary entirely. Payment locks on-chain the moment a job is posted. The contract releases it when the client approves, and provides an automatic fallback if the client goes silent. No platform account holds funds. No admin can freeze a payout.

What makes this different from typical "escrow demo" projects is that it handles the full lifecycle, not just the happy path: revisions, expired deadlines, unresponsive clients, and pre-assignment cancellations are all first-class contract paths — not afterthoughts.

---

## How it works

There are no permanent roles. The same wallet can post a job in one browser tab and apply to a different one in another. Role is always derived from a wallet's relationship to a specific job, never stored as a user attribute.

**The lifecycle has two distinct phases:**

**Phase 1 — Open hiring.** The client calls `createAndFundJobOpen`, locking the full payment in escrow with no freelancer address attached. The job appears on the marketplace. Freelancers browse, apply, and include a cover letter and delivery estimate. The client reviews applications off-chain, selects one, and calls `assignFreelancer` on-chain. Funds were already locked; no second transaction is needed to move money.

**Phase 2 — Active engagement.** The selected freelancer does the work and calls `submitWork` with a hash of the deliverable (an IPFS CID or similar). The client reviews and either calls `approveAndRelease` — which immediately transfers the full escrow to the freelancer — or `requestRevision`, which resets the job to active and extends the deadline by a minimum of 3 days so a last-second revision request cannot manufacture a refund.

If the client neither approves nor requests changes within 7 days of a submission, the freelancer can call `claimPaymentAfterReview` and collect payment without client action. A silent client cannot hold earned funds indefinitely.

```
createAndFundJobOpen ──► AwaitingFreelancer
                                │
                    assignFreelancer(wallet)
                                │
                             Funded ◄──────────── requestRevision
                                │                       │
                           submitWork             (deadline extended,
                                │                  min 3 days)
                         WorkSubmitted ──────────────────┘
                                │
               ┌────────────────┴────────────────┐
               │                                 │
        approveAndRelease            claimPaymentAfterReview
        (client approves)            (client silent 7+ days)
               │                                 │
           Completed ◄───────────────────────────┘
```

**Exit paths:**
- `cancelUnassignedJob` — client cancels before a freelancer is assigned, USDC returns immediately
- `refundExpiredJob` — deadline passes with no submission, client reclaims the escrow

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.34 · Hardhat · Hardhat Ignition |
| Backend | Go 1.26 · standard `net/http` · MySQL 8.0 |
| Chain integration | `go-ethereum` ethclient (EIP-1474 log polling) |
| Frontend | React 19 · Vite · viem v2 · Tailwind CSS v4 |
| Auth | EIP-191 `personal_sign` · HMAC-SHA512 session tokens |
| Testing | 56 Hardhat contract tests · `go-sqlmock` unit tests |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                       │
│  viem · React Router v7 · Tailwind CSS v4 · Lucide React   │
└────────────────────┬────────────────────────────────────────┘
                     │  REST + Bearer token
┌────────────────────▼────────────────────────────────────────┐
│                        Go API (1.26)                        │
│  handlers → services → repositories → MySQL 8.0            │
│                     │                                       │
│            ArcListener (background goroutine)               │
│            polls chain every 2 s · decodes event logs      │
└────────────────────┬────────────────────────────────────────┘
                     │  eth_getLogs  (EIP-1474)
┌────────────────────▼────────────────────────────────────────┐
│              ArcMilestone.sol  ·  Arc Testnet               │
│  Chain ID 5042002  ·  USDC is the native asset (18 dec)     │
└─────────────────────────────────────────────────────────────┘
```

```
arcmilestone/
├── backend/      # Go API — handlers, services, repositories, auth, event listener
├── frontend/     # React UI — wallet auth, job lifecycle, dashboard
└── contracts/    # Solidity escrow — Hardhat + Hardhat Ignition, 56 tests
```

---

## Smart contract

**File:** `contracts/contracts/ArcMilestone.sol`

Arc exposes USDC both as a native asset and as an ERC-20. The contract deliberately uses only the native interface — `msg.value` in, `.call{value}` out. Using both interfaces on the same underlying balance is a well-known source of accounting errors; keeping one interface eliminates the ambiguity entirely.

### Design decisions

**Funding decoupled from hiring.** `createAndFundJobOpen` takes no freelancer address. Payment locks before anyone is selected. `assignFreelancer` is a separate transaction that binds a wallet after off-chain review. Every funded job always has a full escrow — the freelancer never starts work on a promise.

**Checks-Effects-Interactions, every time.** `approveAndRelease`, `cancelUnassignedJob`, `refundExpiredJob`, and `claimPaymentAfterReview` all write their terminal state (`Completed` or `Refunded`) and decrement `totalLocked` before the external `.call`. A re-entrant callback observes a finalised job and hits the wrong-status guard before it can trigger a second payout. The manual `_reentrancyEntered` flag adds a second layer.

**Revision cannot be weaponised.** `requestRevision` is only valid from `WorkSubmitted` or `Funded`. If called, it extends the deadline to `max(current_deadline, now + 3 days)`. A client cannot request revision at the last second to let the submission window expire and then claim a refund — the freelancer always gets the full revision window from the moment of the request.

**Freelancer protection by default.** `REVIEW_PERIOD` (7 days) is a hard constant in the contract. There is no admin function to reduce it, no escape hatch that requires trusting the platform operator.

**No untracked funds.** `receive()` and `fallback()` both revert with `DirectPaymentNotAllowed`. Every wei inside the contract entered through `createAndFundJobOpen` and has an associated job record. `totalLocked` is always accurate.

**Custom errors carry context.** Every revert includes the `jobId`, the `caller`, and the `currentStatus`. A frontend or debugger can identify the exact failed guard without parsing revert strings.

### On-chain events

| Event | Indexed fields |
|---|---|
| `JobCreatedAndFundedOpen` | `jobId`, `client` |
| `FreelancerAssigned` | `jobId`, `client`, `freelancer` |
| `WorkSubmitted` | `jobId`, `freelancer` |
| `RevisionRequested` | `jobId`, `client` |
| `PaymentReleased` | `jobId`, `freelancer` |
| `JobRefunded` | `jobId`, `client` |

### Contract setup

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test          # 56 tests covering the full lifecycle
```

Deploy to Arc Testnet:

```bash
npx hardhat ignition deploy ignition/modules/ArcMilestone.ts --network arcTestnet
```

Deployment records live in `contracts/ignition/deployments/chain-5042002/` and `contracts/DEPLOYMENTS.md`.

---

## Backend

**Language:** Go 1.26 · **Database:** MySQL 8.0

### Layer structure

```
HTTP request
    │
routes/routes.go          CORS middleware + request logging
    │
handlers/                 JSON decode, input validation, HTTP response shaping
    │
services/                 Business rules, domain errors, cross-repo orchestration
    │
repositories/             Parameterised SQL only — no business logic, no string queries
    │
MySQL (arcmilestone)
```

The Go standard library handles routing and HTTP. No framework. Each layer has a single responsibility and dependencies are injected from `cmd/api/main.go`, which wires together repositories, services, and handlers in one place before handing control to `net/http`.

### Chain event listener

`ArcListener` runs as a background goroutine started at boot. It polls `HeaderByNumber` every 2 seconds, builds a `FilterQuery` over the deployed contract address and all six event topics (computed via `crypto.Keccak256Hash` at startup, not hardcoded), and calls `eth_getLogs` for each new block range.

Each event type has a dedicated handler:

- `JobCreatedAndFundedOpen` — correlates the emitted `metadataHash` against open DB jobs, creates a `job_escrows` row, and records the funding transaction hash.
- `FreelancerAssigned` — updates escrow status to `funded`, transitions the job to `in_progress`.
- `WorkSubmitted` — updates escrow status to `work_submitted`.
- `RevisionRequested` — resets escrow to `funded`, job to `in_progress`.
- `PaymentReleased` — marks escrow and job `completed`.
- `JobRefunded` — marks escrow and job `refunded`/`cancelled`.

Every processed event is written to `escrow_events` with a `(blockchain_job_id, log_index, block_number)` deduplication key. Re-processing the same block range is safe. The HTTP handlers never update `escrow_status` directly — the listener is the only path that moves financial state forward.

### Authentication

The backend implements **EIP-191 `personal_sign` wallet authentication** with no password storage and no private key exposure.

1. `POST /api/auth/nonce` — generates 32 bytes of CSPRNG entropy, stores only the SHA-256 hash, returns the plaintext hex string. Nonces expire after 10 minutes.
2. The frontend passes the plaintext nonce to the connected wallet for signing.
3. `POST /api/auth/verify` — SHA-256 hashes the submitted nonce, retrieves the stored record (enforcing `used_at IS NULL AND expires_at > NOW()` at the query layer), reconstructs the EIP-191 prefixed message, recovers the signer via secp256k1 ECDSA, and confirms it matches the claimed address. The nonce is immediately marked `used_at`.
4. A session token is issued. Format: `base64url(payload) + "." + base64url(HMAC-SHA512(payload, secret))`. The payload is binary: 8 bytes user ID (LE) + 8 bytes expiry unix timestamp (LE) + wallet address bytes. No external JWT library.
5. Every protected request calls `hmac.Equal` (constant-time) to verify the MAC before reading the payload.

### Database schema

| Table | Purpose |
|---|---|
| `users` | Wallet address + optional display username. No roles stored. |
| `auth_nonces` | SHA-256 hashed single-use challenges, `expires_at`, `used_at` |
| `jobs` | Marketplace metadata: title, description, skills, budget, deadlines, status, selected freelancer |
| `applications` | Cover letter, estimated days, portfolio URL, application status |
| `job_escrows` | Chain ID, contract address, on-chain job ID, funding tx hash, escrow status |
| `job_submissions` | Delivery URL, description, timestamps |
| `notifications` | In-app events (application received, work submitted, payment released, etc.) |
| `escrow_events` | Deduplicated on-chain event log — one row per `(job, log_index, block)` |
| `messages` | Job-scoped threaded discussion between client and selected freelancer |

### Environment variables

Copy `backend/.env.example` to `backend/.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP server port |
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | _(required)_ | MySQL username |
| `DB_PASSWORD` | _(required)_ | MySQL password |
| `DB_NAME` | `arcmilestone` | MySQL database name |
| `DB_SSL_MODE` | `disable` | `disable`, `preferred`, or `required` |
| `MYSQL_DSN` | _(empty)_ | Full DSN override — takes precedence over all `DB_*` vars |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `AUTH_SECRET` | _(required)_ | HMAC-SHA512 signing key — never commit this |
| `ARC_RPC_URL` | _(empty)_ | Arc RPC endpoint. Listener is disabled if empty. |
| `ARC_CONTRACT_ADDRESS` | _(empty)_ | Deployed contract address. Listener is disabled if empty. |

### Database setup

```bash
sudo systemctl start mysql
mysql -u <user> -p -e "CREATE DATABASE arcmilestone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u <user> -p arcmilestone < backend/database/migrations/001_initial_schema.sql
mysql -u <user> -p arcmilestone < backend/database/migrations/002_processed_events.sql
mysql -u <user> -p arcmilestone < backend/database/migrations/003_revisions_messages_events.sql
```

### Running the API

```bash
cd backend
go run ./cmd/api
```

```bash
curl http://localhost:8080/api/health
# {"service":"ArcMilestone API","status":"ok"}
```

### Tests

```bash
cd backend
go test ./...      # unit tests with go-sqlmock — no live DB or chain required
go vet ./...
go build ./...
gofmt -l .         # should print nothing
```

### API reference

All endpoints expect `Content-Type: application/json`. Protected routes require `Authorization: Bearer <token>`.

| Group | Endpoints |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/nonce` · `POST /api/auth/verify` · `GET /api/auth/me` · `POST /api/auth/logout` |
| Users | `GET /api/users/me` · `PATCH /api/users/me` · `GET /api/users/check-username` |
| Jobs | `POST /api/jobs` · `GET /api/jobs` · `GET /api/jobs/{id}` · `PATCH /api/jobs/{id}` · `POST /api/jobs/{id}/publish` · `POST /api/jobs/{id}/cancel` |
| Applications | `POST /api/jobs/{id}/applications` · `GET /api/jobs/{id}/applications` · `POST /api/jobs/{id}/applications/{appId}/accept` · `POST /api/jobs/{id}/applications/{appId}/reject` · `GET /api/applications/me` · `POST /api/applications/{id}/withdraw` |
| Submissions | `POST /api/jobs/{id}/submission` · `GET /api/jobs/{id}/submission` |
| Escrow | `POST /api/jobs/{id}/escrow` · `GET /api/jobs/{id}/escrow` |
| Notifications | `GET /api/notifications` · `GET /api/notifications/unread` · `PATCH /api/notifications/{id}/read` |

---

## Frontend

**Framework:** React 19 + Vite · **Wallet:** viem v2 · **Routing:** React Router v7 · **Styling:** Tailwind CSS v4

### Structure

```
src/
├── context/AppContext.jsx         Global auth state, jobs, applications, notifications
├── services/
│   ├── api.js                     All backend HTTP calls — centralised fetch wrapper
│   └── blockchain.js              viem public + wallet clients, full contract ABI
├── pages/
│   ├── Home.jsx                   Landing page
│   ├── CreateJob.jsx              Multi-step job creation form
│   ├── Jobs.jsx                   Creator's own job list
│   ├── ExploreJobs.jsx            Public marketplace with filters
│   ├── JobDetails.jsx             Full job view — all lifecycle actions in one place
│   ├── ReviewApplications.jsx     Application inbox with accept/reject
│   ├── MyApplications.jsx         Freelancer's application history
│   ├── Overview.jsx               Dashboard summary and stats
│   ├── Notifications.jsx
│   ├── Transactions.jsx           On-chain event history with decoded log data
│   ├── Settings.jsx
│   └── Help.jsx
├── components/                    Shared UI — Modal, Toast, JobCard, Pagination, etc.
└── utils/
    ├── permissions.js             Resource-scoped authorisation helpers
    ├── format.js                  USDC (18-decimal), date, and address formatting
    └── pollJob.js                 Post-transaction polling until escrow status updates
```

### Permission model

All authorisation checks are resource-scoped, not role-based. `permissions.js` never asks "is this user a freelancer?" — it asks "what is this wallet's relationship to job #N?":

```js
isJobCreator(job, wallet)
isSelectedFreelancer(job, wallet)
canApply(job, wallet, applications)         // open + deadline not passed + not creator + not already applied
canFundJob(job, wallet)                     // creator + no escrow row yet
canAssignOnChain(job, wallet)               // creator + escrow.status === awaiting_freelancer + freelancer selected
canSubmitWork(job, wallet)                  // selected freelancer + escrow.status === funded
canApproveWork(job, wallet)                 // creator + escrow.status === work_submitted or funded
canCancelUnassignedJob(job, wallet)         // creator + escrow.status === awaiting_freelancer
canClaimRefund(job, wallet)                 // creator + escrow funded + delivery deadline passed
canRequestChanges(job, wallet)              // creator + escrow work_submitted or funded
canClaimPaymentAfterReview(job, wallet, submission)  // selected freelancer + work_submitted + 7+ days elapsed
```

These gates drive UI visibility only. The smart contract enforces every financial rule independently and will reject any out-of-order call regardless of what the frontend sends.

### Environment variables

Copy `frontend/.env.example` to `frontend/.env`:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (default: `http://localhost:8080`) |
| `VITE_CONTRACT_ADDRESS` | Deployed ArcMilestone contract address |
| `VITE_CHAIN_ID` | Arc Testnet chain ID (`5042002`) |

### Running

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
npm run build     # production build
```

---

## Local development setup

### Prerequisites

- Go 1.22+
- Node.js 18+
- MySQL 8.0+
- MetaMask or any EIP-1193 compatible wallet browser extension
- Arc Testnet USDC in your test wallet

### Steps

```bash
# 1. Clone
git clone <repo> && cd arcmilestone

# 2. Compile the contract (generates ABIs used by Hardhat tests)
cd contracts && npm install && npx hardhat compile

# 3. Backend
cd ../backend
cp .env.example .env
# Fill in DB_USER, DB_PASSWORD, AUTH_SECRET, ARC_RPC_URL, ARC_CONTRACT_ADDRESS

sudo systemctl start mysql
mysql -u <user> -p -e "CREATE DATABASE arcmilestone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u <user> -p arcmilestone < database/migrations/001_initial_schema.sql
mysql -u <user> -p arcmilestone < database/migrations/002_processed_events.sql
mysql -u <user> -p arcmilestone < database/migrations/003_revisions_messages_events.sql
go run ./cmd/api

# 4. Frontend (new terminal)
cd ../frontend
cp .env.example .env
# Set VITE_CONTRACT_ADDRESS to the deployed contract address
npm install && npm run dev
```

Open `http://localhost:5173`, connect your wallet, sign the nonce prompt, and you are authenticated. No username or password is required or stored.

---

## Security notes

**Private keys and seed phrases** never touch the backend. Authentication works by asking the wallet to sign a server-generated challenge. The backend only ever sees the public address and the signature.

**Nonces** are 32 bytes of CSPRNG entropy, hex-encoded. The backend stores only the SHA-256 hash. The plaintext is never written to disk or a database. Replay is prevented at the SQL query level (`used_at IS NULL AND expires_at > NOW()`), not in application code where it could be accidentally bypassed.

**Session tokens** are custom binary-payload + HMAC-SHA512 tokens with no external JWT library. `hmac.Equal` (constant-time comparison) is used on every request. The payload encodes user ID, expiry, and wallet address as fixed-length binary fields — not JSON, not base64-padded strings.

**Escrow state** can only move forward via confirmed on-chain events processed by the `ArcListener`. No HTTP handler updates `escrow_status`. A compromised API server cannot fabricate a payment release or refund — the contract will reject the transaction, and the listener will see no matching event.

**Reentrancy** is blocked by a manual `_reentrancyEntered` flag combined with checks-effects-interactions on all fund-moving functions. There is no dependency on OpenZeppelin's `ReentrancyGuard`, but the pattern is identical.

`AUTH_SECRET` and `DB_PASSWORD` must never be committed. Both are listed in `.gitignore`.
