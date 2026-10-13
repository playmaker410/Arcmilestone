# ArcMilestone

A trustless, non custodial freelance escrow built on the Arc Testnet. Clients post fixed-price jobs and lock payment on-chain before a single line of work is written. Freelancers apply, get selected, deliver, and get paid all enforced by a smart contract that neither party can override.

This is a proof of concept. It is a complete, working product: deployed contract, a Go API with a chain event listener, and a React frontend with wallet-based auth. The goal was to see how far an EVM chain with native USDC could take a real-world application without shortcuts.

> **Deployed contract:** [`0x9e16cC1DEC047DeAa798C757291Fd1f629Ad144d`](https://testnet.arcscan.app/address/0x9e16cC1DEC047DeAa798C757291Fd1f629Ad144d) on Arc Testnet (Chain ID `5042002`)

---

## The core problem this solves

Traditional freelance platforms sit in the middle of every transaction. They hold funds, make arbitration decisions, and charge for the privilege. The model works until it doesn't platform insolvency, frozen accounts, arbitrary rulings, and percentage fees that compound on every job.

ArcMilestone removes the intermediary entirely. Payment locks on-chain the moment a job is posted. The contract releases it when the client approves, and provides an automatic fallback if the client goes silent. No platform account holds funds. No admin can freeze a payout.

What makes this different from typical "escrow demo" projects is that it handles the full lifecycle, not just the happy path: revisions, expired deadlines, unresponsive clients, and pre-assignment cancellations are all first-class contract paths not afterthoughts.

---

## Target users

ArcMilestone is built for two sides of the same transaction. Neither side needs a platform account, a bank account, or trust in a company — only a wallet.

### Clients (job posters)
- **Crypto-native businesses and DAOs** that pay contributors in USDC and want payment enforced by code, not by a support ticket
- **Startup founders and indie builders** hiring for short fixed price contracts (design, development, content) who want funds locked before work begins not released on a promise
- **Anyone burned by a freelancer disappearing after receiving payment** escrow removes that risk entirely since no freelancer is paid until work is delivered and approved

### Freelancers (job seekers)
- **Web3 developers, designers, and writers** who are already wallet-native and prefer USDC over platform-controlled earnings
- **Freelancers in markets with unreliable banking** where receiving international payments through traditional platforms is slow, expensive, or blocked — a wallet address is enough
- **Anyone burned by a client who refused to pay after receiving work** the 7-day automatic release (`claimPaymentAfterReview`) means a silent client cannot hold earned funds indefinitely
  
---

## Revenue model

ArcMilestone currently takes no fee. Every wei of the escrowed amount goes directly to the freelancer on `approveAndRelease`. The following models are planned for a production deployment:

### Primary: Protocol fee (1–2% per completed job)
When `approveAndRelease` or `claimPaymentAfterReview` executes, the contract deducts a fixed percentage from the escrow and routes it to a treasury wallet before sending the remainder to the freelancer. The fee percentage is a hardcoded contract constant not an admin-settable variable so clients and freelancers can verify the exact cost before committing funds.

This is a single function change to the deployed contract. No backend or frontend changes are required.

**Revenue projection at scale:**

| Monthly completed jobs | Avg job value | 1% protocol fee | Monthly revenue |
| --- | --- | --- | --- |
| 500 | $200 | 1% | $1,000 |
| 2,000 | $200 | 1% | $4,000 |
| 10,000 | $500 | 1% | $50,000 |

Revenue scales with volume and requires zero additional infrastructure — the contract collects fees automatically.

### Secondary: Featured job listings
Clients pay a flat fee (in USDC) to have their job pinned at the top of the marketplace for a set duration.

### Tertiary: Verified freelancer badges
Freelancers pay a one time or annual fee to undergo identity or portfolio verification and display a badge on their profile. Clients can filter the marketplace by verified freelancers only. Builds platform trust and creates a recurring revenue stream independent of transaction volume.

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

| Layer             | Technology                                           |
| ----------------- | ---------------------------------------------------- |
| Smart contract    | Solidity 0.8.34 · Hardhat · Hardhat Ignition         |
| Backend           | Go 1.26 · standard `net/http` · MySQL 8.0            |
| Chain integration | `go-ethereum` ethclient (EIP-1474 log polling)       |
| Frontend          | React 19 · Vite · viem v2 · Tailwind CSS v4          |
| Auth              | EIP-191 `personal_sign` · HMAC-SHA512 session tokens |
| Testing           | 56 Hardhat contract tests · `go-sqlmock` unit tests  |

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

**Revision cannot be weaponised.** `requestRevision` is only valid from `WorkSubmitted`. If called, it extends the deadline to `max(current_deadline, now + 3 days)`. A client cannot request revision at the last second to let the submission window expire and then claim a refund  the freelancer always gets the full revision window from the moment of the request.

**Freelancer protection by default.** `REVIEW_PERIOD` (7 days) is a hard constant in the contract. There is no admin function to reduce it, no escape hatch that requires trusting the platform operator.

**No untracked funds.** `receive()` and `fallback()` both revert with `DirectPaymentNotAllowed`. Every wei inside the contract entered through `createAndFundJobOpen` and has an associated job record. `totalLocked` is always accurate.

**Custom errors carry context.** Every revert includes the `jobId`, the `caller`, and the `currentStatus`. A frontend or debugger can identify the exact failed guard without parsing revert strings.

### On-chain events

| Event                     | Indexed fields                  |
| ------------------------- | ------------------------------- |
| `JobCreatedAndFundedOpen` | `jobId`, `client`               |
| `FreelancerAssigned`      | `jobId`, `client`, `freelancer` |
| `WorkSubmitted`           | `jobId`, `freelancer`           |
| `RevisionRequested`       | `jobId`, `client`               |
| `PaymentReleased`         | `jobId`, `freelancer`           |
| `JobRefunded`             | `jobId`, `client`               |

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

| Table             | Purpose                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `users`           | Wallet address + optional display username. No roles stored.                                     |
| `auth_nonces`     | SHA-256 hashed single-use challenges, `expires_at`, `used_at`                                    |
| `jobs`            | Marketplace metadata: title, description, skills, budget, deadlines, status, selected freelancer |
| `applications`    | Cover letter, estimated days, portfolio URL, application status                                  |
| `job_escrows`     | Chain ID, contract address, on-chain job ID, funding tx hash, escrow status                      |
| `job_submissions` | Delivery URL, description, timestamps                                                            |
| `notifications`   | In-app events (application received, work submitted, payment released, etc.)                     |
| `escrow_events`   | Deduplicated on-chain event log — one row per `(job, log_index, block)`                          |
| `messages`        | Job-scoped threaded discussion between client and selected freelancer                            |

### Environment variables

Copy `backend/.env.example` to `backend/.env`:

| Variable               | Default                 | Description                                               |
| ---------------------- | ----------------------- | --------------------------------------------------------- |
| `PORT`                 | `8080`                  | HTTP server port                                          |
| `DB_HOST`              | `127.0.0.1`             | MySQL host                                                |
| `DB_PORT`              | `3306`                  | MySQL port                                                |
| `DB_USER`              | _(required)_            | MySQL username                                            |
| `DB_PASSWORD`          | _(required)_            | MySQL password                                            |
| `DB_NAME`              | `arcmilestone`          | MySQL database name                                       |
| `DB_SSL_MODE`          | `disable`               | `disable`, `preferred`, or `required`                     |
| `MYSQL_DSN`            | _(empty)_               | Full DSN override — takes precedence over all `DB_*` vars |
| `FRONTEND_URL`         | `http://localhost:5173` | Allowed CORS origin                                       |
| `AUTH_SECRET`          | _(required)_            | HMAC-SHA512 signing key — never commit this               |
| `ARC_RPC_URL`          | _(empty)_               | Arc RPC endpoint. Listener is disabled if empty.          |
| `ARC_CONTRACT_ADDRESS` | _(empty)_               | Deployed contract address. Listener is disabled if empty. |

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

| Group         | Endpoints                                                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health        | `GET /api/health`                                                                                                                                                                                                                                    |
| Auth          | `POST /api/auth/nonce` · `POST /api/auth/verify` · `GET /api/auth/me` · `POST /api/auth/logout`                                                                                                                                                      |
| Users         | `GET /api/users/me` · `PATCH /api/users/me` · `GET /api/users/check-username`                                                                                                                                                                        |
| Jobs          | `POST /api/jobs` · `GET /api/jobs` · `GET /api/jobs/{id}` · `PATCH /api/jobs/{id}` · `POST /api/jobs/{id}/publish` · `POST /api/jobs/{id}/cancel`                                                                                                    |
| Applications  | `POST /api/jobs/{id}/applications` · `GET /api/jobs/{id}/applications` · `POST /api/jobs/{id}/applications/{appId}/accept` · `POST /api/jobs/{id}/applications/{appId}/reject` · `GET /api/applications/me` · `POST /api/applications/{id}/withdraw` |
| Submissions   | `POST /api/jobs/{id}/submission` · `GET /api/jobs/{id}/submission`                                                                                                                                                                                   |
| Escrow        | `POST /api/jobs/{id}/escrow` · `GET /api/jobs/{id}/escrow`                                                                                                                                                                                           |
| Notifications | `GET /api/notifications` · `GET /api/notifications/unread` · `PATCH /api/notifications/{id}/read`                                                                                                                                                    |

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
isJobCreator(job, wallet);
isSelectedFreelancer(job, wallet);
canApply(job, wallet, applications); // open + deadline not passed + not creator + not already applied
canFundJob(job, wallet); // creator + no escrow row yet
canAssignOnChain(job, wallet); // creator + escrow.status === awaiting_freelancer + freelancer selected
canSubmitWork(job, wallet); // selected freelancer + escrow.status === funded
canApproveWork(job, wallet); // creator + escrow.status === work_submitted or funded
canCancelUnassignedJob(job, wallet); // creator + escrow.status === awaiting_freelancer
canClaimRefund(job, wallet); // creator + escrow funded + delivery deadline passed
canRequestChanges(job, wallet); // creator + escrow work_submitted or funded
canClaimPaymentAfterReview(job, wallet, submission); // selected freelancer + work_submitted + 7+ days elapsed
```

These gates drive UI visibility only. The smart contract enforces every financial rule independently and will reject any out-of-order call regardless of what the frontend sends.

### Environment variables

Copy `frontend/.env.example` to `frontend/.env`:

| Variable                | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `VITE_API_URL`          | Backend base URL (default: `http://localhost:8080`) |
| `VITE_CONTRACT_ADDRESS` | Deployed ArcMilestone contract address              |
| `VITE_CHAIN_ID`         | Arc Testnet chain ID (`5042002`)                    |

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

---

## Known limitations and future enhancements

This is a proof of concept. The core lifecycle — fund, assign, deliver, pay — works end to end and is enforced on-chain. The limitations below are understood and have identified solutions; they are deferred to keep the PoC scope manageable.

### Delivery theft (the open-link problem)

**Current behaviour:** `submitWork` accepts any URL or IPFS CID as the delivery reference. If a freelancer submits a public GitHub repo link, a malicious client can clone it and refuse to approve, keeping the escrow funds while having the deliverable.

**Why it is not fully solved at this stage:** The fix requires a commit-reveal scheme — the freelancer submits `keccak256(delivery_url + salt)` on-chain, and only reveals the plaintext after payment is released. The cryptographic primitives are already available in the EVM. This is a contract extension, not a redesign, but it adds complexity to the submission flow that goes beyond the PoC scope.

**Practical mitigation today:** Freelancers should submit deliverables as encrypted archives, private repo invitations that require wallet-derived key decryption, or watermarked previews rather than public links. The contract already supports any content-addressable hash as the submission value.

### Quality disputes (the bad-work problem)

**Current behaviour:** The contract gives the client final say. If a freelancer submits poor work, the client calls `requestRevision`. If the freelancer ignores the revision or the deadline passes without an acceptable resubmission, the client calls `refundExpiredJob` and recovers the escrow. The freelancer has the `claimPaymentAfterReview` fallback only if the client goes completely silent for 7 days after a `WorkSubmitted` state — it does not override a client who actively disputes quality.

**The fundamental limitation:** Code cannot evaluate quality. No smart contract can determine whether a logo design is "good enough" or whether a codebase meets the brief. Every escrow platform — including centralised ones — resolves this with a human layer.

**Planned enhancements:**

- **Reputation system:** On-chain or off-chain job completion history and ratings. A freelancer with 50 completed jobs and a strong rating reduces the client's risk of paying for bad work. This is the primary long-term solution and is the model used by Upwork and Fiverr at scale.
- **Milestone-based payments:** Split a single job into multiple escrow tranches (e.g., 30% on spec approval, 40% on draft, 30% on final delivery). Each milestone is independently approved, capping the maximum loss on either side. This requires a contract-level change to support multiple escrow amounts per job.
- **Optional decentralised arbitration:** Integrate with a protocol such as Kleros for disputed jobs. A random panel of token-holding jurors reviews evidence and votes on the outcome. This adds a credible neutral third party without reintroducing a centralised operator.

### Protocol fee (monetisation)

**Current behaviour:** The platform takes no cut. Every wei of the escrowed amount goes directly to the freelancer on `approveAndRelease`.

**Planned enhancement:** A small protocol fee (e.g., 1–2%) deducted at the point of payment release and routed to a treasury wallet. This is a single-line change to `approveAndRelease` — compute the fee, send the remainder to the freelancer, send the fee to a hardcoded or upgradeable treasury address. Keeping the fee percentage as a contract constant (rather than an admin-settable variable) preserves trustlessness: clients and freelancers can verify the exact fee before committing.

### Real-time event push (WebSockets / Server-Sent Events)

**Current behaviour:** After a on-chain transaction the frontend polls the backend API every few seconds via `pollJob` until the escrow status updates. This works but creates unnecessary HTTP traffic and a visible delay.

**Planned enhancement:** When `ArcListener` writes a confirmed event to the database, it pushes a notification directly to the affected user's browser over a persistent WebSocket or Server-Sent Events connection. The Go standard library supports SSE without additional dependencies. This removes polling entirely and makes state transitions — freelancer assigned, work submitted, payment released — feel instant.

### Other deferred features

| Limitation | Notes |
| --- | --- |
| Testnet only | Deployed on Arc Testnet (Chain ID `5042002`). Mainnet deployment requires no structural changes only a redeployment and environment variable update. |
| No mobile experience | The frontend is desktop-first. Wallet connection on mobile requires WalletConnect integration, which is not yet implemented. |
| No email or push notifications | Notifications are in-app only. Production would add email or push delivery for critical events (application received, work submitted, payment released). |
| No fiat onramp | Users must already hold Arc Testnet USDC. A production version would integrate an onramp provider so clients can fund jobs directly from a bank card. |
| Single-currency | Only native USDC is supported. Multi-token support is an additive contract change. |
| No dispute flag on-chain | Either party can walk away or go silent, but there is no explicit `disputeJob` state. Adding it is straightforward and would be required before decentralised arbitration is meaningful. |
