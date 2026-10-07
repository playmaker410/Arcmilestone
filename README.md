# ArcMilestone

A blockchain escrow platform built on Arc Testnet. Users create fixed-payment jobs, apply to other users' jobs, and send or receive payments through a smart contract. A user's role — client or freelancer — is determined by their relationship to a specific job, not permanently assigned to their account.

---

## How It Works

```
User connects wallet (MetaMask)
        ↓
Signs a nonce to prove wallet ownership
        ↓
Creates a job with a fixed USDC payment and funds the escrow on-chain
        ↓
Other users browse and apply to the job
        ↓
Job creator reviews applications and selects one applicant
        ↓
Creator confirms the freelancer on-chain (assignFreelancer)
        ↓
Freelancer performs and submits work
        ↓
Job creator approves the submission
        ↓
Smart contract releases the escrowed USDC to the freelancer
```

Cancel path:

```
Funded job, no freelancer assigned yet → client clicks "Cancel Job" → smart contract returns USDC immediately
```

Refund path:

```
Funded job, freelancer assigned → deadline passes with no submission → client requests refund → smart contract returns USDC
```

---

## Key Design Principle: No Permanent Roles

A user is not permanently a client or freelancer. The same wallet can create a job (acting as client) and apply to a different job (acting as freelancer) at the same time.

```
Alice creates Job #1  →  Alice = client,   Bob = freelancer
Bob creates Job #2    →  Bob   = client,   Alice = freelancer
```

The role is always determined by the relationship between a user and a specific job.

---

## Repository Structure

```
arcmilestone/
├── backend/          # Go API — handlers, services, repositories, auth
├── frontend/         # React UI — wallet connection, job lifecycle, dashboard
└── contracts/        # Solidity smart contract — Hardhat + Hardhat Ignition
```

---

## Smart Contract

**File:** `contracts/contracts/ArcMilestone.sol`
**Network:** Arc Testnet
**Chain ID:** `5042002`
**Deployed address:** `0x7eB7199607b41a2fb066d345a199cedBDD7932fb`
**Explorer:** https://testnet.arcscan.app/address/0x7eB7199607b41a2fb066d345a199cedBDD7932fb

The contract is the financial authority. It is responsible for:

- Receiving and locking USDC in escrow
- Tracking the total amount currently locked (`totalLocked`)
- Enforcing job state transitions
- Releasing payment to the freelancer on approval
- Returning funds to the client on cancellation or expired deadline
- Emitting events (`JobCreatedAndFundedOpen`, `FreelancerAssigned`, `WorkSubmitted`, `PaymentReleased`, `JobRefunded`)
- Reentrancy protection on all fund-moving functions

### Job status lifecycle (on-chain)

```
AwaitingFreelancer → Funded → WorkSubmitted → Completed
        ↓                ↓
    Refunded          Refunded
  (cancel anytime)  (deadline passed, no submission)
```

| Status | Meaning |
|---|---|
| `AwaitingFreelancer` | Job funded, no freelancer assigned yet |
| `Funded` | Freelancer assigned, work not yet submitted |
| `WorkSubmitted` | Freelancer submitted deliverable |
| `Completed` | Client approved, payment released |
| `Refunded` | Funds returned to client (cancel or expired) |

### Contract setup

```bash
cd contracts
npm install

# Compile
npx hardhat compile

# Run tests (56 tests covering the full lifecycle)
npx hardhat test
```

### Deploy to Arc Testnet

```bash
npx hardhat ignition deploy ignition/modules/ArcMilestone.ts --network arcTestnet
```

Deployment records live in `contracts/ignition/deployments/chain-5042002/` and `contracts/DEPLOYMENTS.md`.

---

## Backend

**Language:** Go 1.22+
**Database:** MySQL 8.0+
**Key dependencies:**
- `github.com/decred/dcrd/dcrec/secp256k1` — EIP-191 signature recovery
- `github.com/ethereum/go-ethereum` — blockchain RPC client
- `github.com/go-sql-driver/mysql` — MySQL driver

The backend manages all offchain application state and enforces business rules. The smart contract remains authoritative for escrow funds.

### Architecture

```
HTTP request
    ↓
routes/routes.go       — CORS + logging applied globally
    ↓
handlers/              — decode JSON, validate input, call service, write response
    ↓
services/              — business rules, domain errors, orchestrate repositories
    ↓
repositories/          — parameterised SQL only, no business logic
    ↓
MySQL (arcmilestone database)
```

### What MySQL stores

- Users and wallet identities
- Authentication nonces (hashed, single-use, expiring)
- Jobs (marketplace metadata, status, deadlines)
- Applications (cover letter, estimated days, status)
- Submissions (delivery URL, notes)
- Escrow references (blockchain job ID, funding transaction hash)
- Notifications
- Indexed copies of blockchain events (for display and search)

### What MySQL does not store

- Private keys, seed phrases, or wallet passwords
- The authoritative escrow balance (that lives in the contract)
- `proposed_amount` on applications — payment is fixed by the job

### Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP server port |
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | _(required)_ | MySQL username |
| `DB_PASSWORD` | _(required)_ | MySQL password |
| `DB_NAME` | `arcmilestone` | MySQL database name |
| `DB_SSL_MODE` | `disable` | `disable`, `preferred`, or `required` |
| `MYSQL_DSN` | _(empty)_ | Full DSN override — takes precedence over `DB_*` |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `AUTH_SECRET` | _(required)_ | Secret for HMAC-SHA512 session tokens — never commit this |
| `ARC_RPC_URL` | _(empty)_ | Arc network RPC endpoint |
| `ARC_CONTRACT_ADDRESS` | _(empty)_ | Deployed ArcMilestone contract address |

### Database setup

```bash
# Start MySQL
sudo systemctl start mysql

# Create the database once
mysql -u <user> -p -e "CREATE DATABASE arcmilestone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Apply migrations in order
mysql -u <user> -p arcmilestone < backend/database/migrations/001_initial_schema.sql
mysql -u <user> -p arcmilestone < backend/database/migrations/002_remove_proposed_amount.sql
```

### Running

```bash
cd backend
go run ./cmd/api
```

The server starts on `http://localhost:8080`. Check it:

```bash
curl http://localhost:8080/api/health
# {"service":"ArcMilestone API","status":"ok"}
```

### Tests

```bash
cd backend
go test ./...
go vet ./...
go build ./...
gofmt -l .        # should print nothing
```

Tests do not require a live database.

### API overview

All JSON requests require `Content-Type: application/json`. Protected routes require `Authorization: Bearer <token>` obtained from `POST /api/auth/verify`.

| Group | Endpoints |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/nonce`, `POST /api/auth/verify`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Users | `GET /api/users/me`, `PATCH /api/users/me`, `GET /api/users/check-username` |
| Jobs | `POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/{id}`, `PATCH /api/jobs/{id}`, `POST /api/jobs/{id}/publish`, `POST /api/jobs/{id}/cancel` |
| Applications | `POST /api/jobs/{id}/applications`, `GET /api/jobs/{id}/applications`, `POST /api/jobs/{id}/applications/{applicationId}/accept`, `POST /api/jobs/{id}/applications/{applicationId}/reject`, `GET /api/applications/me`, `POST /api/applications/{id}/withdraw` |
| Submissions | `POST /api/jobs/{id}/submission`, `GET /api/jobs/{id}/submission` |
| Escrow | `POST /api/jobs/{id}/escrow`, `GET /api/jobs/{id}/escrow` |
| Notifications | `GET /api/notifications`, `GET /api/notifications/unread`, `PATCH /api/notifications/{id}/read` |

### Authentication

The backend uses **EIP-191 `personal_sign` wallet authentication** — no passwords, no private key storage.

1. Client calls `POST /api/auth/nonce` with the wallet address.
2. Backend generates a random 32-byte nonce, stores its **SHA-256 hash**, returns the plaintext. Expires after 10 minutes.
3. Client passes the plaintext nonce to MetaMask, which signs it and returns a 65-byte signature.
4. Client calls `POST /api/auth/verify` with the address, plaintext nonce, and signature.
5. Backend verifies the hash matches a valid unused nonce, recovers the signer from the EIP-191 signature using secp256k1, and checks it matches the claimed address.
6. Nonce is marked used (prevents replay). A session token is issued.
7. Session token format: `base64url(payload) + "." + base64url(HMAC-SHA512(payload, AUTH_SECRET))`. Expires after 24 hours.

### Job status lifecycle (offchain)

```
draft → open → reviewing_applications → awaiting_funding → in_progress → completed
                                                                        ↘ cancelled
```

`escrow_status` is a separate nullable field (`awaiting_freelancer | funded | work_submitted | completed | refunded`) that mirrors on-chain state. The contract is always the authority.

---

## Frontend

**Framework:** React 19 + Vite 8
**Wallet library:** viem v2
**Routing:** React Router v7
**Styling:** Tailwind CSS v4
**Icons:** Lucide React

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
npm run dev
```

Opens at `http://localhost:5173`.

### Structure

```
src/
├── context/AppContext.jsx        — global auth, jobs, applications, notifications state
├── services/
│   ├── api.js                    — all backend HTTP calls
│   └── blockchain.js             — viem wallet + contract interactions
├── pages/                        — one file per route
│   ├── Home.jsx
│   ├── CreateJob.jsx
│   ├── Jobs.jsx
│   ├── ExploreJobs.jsx
│   ├── JobDetails.jsx
│   ├── ReviewApplications.jsx
│   ├── MyApplications.jsx
│   ├── Overview.jsx
│   ├── Notifications.jsx
│   ├── Settings.jsx
│   ├── Transactions.jsx
│   └── Help.jsx
├── components/                   — shared UI components
└── utils/
    ├── permissions.js            — resource-level authorization helpers
    ├── format.js                 — date, USDC, address formatting
    └── pollJob.js                — polls backend until escrow status updates
```

### Authorization model

Authorization is always resource-based, not role-based. `permissions.js` checks a user's relationship to each specific job:

```js
isJobCreator(job, walletAddress)              // job.creator_wallet === walletAddress
isSelectedFreelancer(job, walletAddress)      // job.selected_freelancer_wallet === walletAddress
canApply(job, walletAddress, applications)
canFundJob(job, walletAddress)
canAssignOnChain(job, walletAddress)
canSubmitWork(job, walletAddress)
canApproveWork(job, walletAddress)
canClaimRefund(job, walletAddress)            // deadline passed, status funded
canCancelUnassignedJob(job, walletAddress)    // anytime, status awaiting_freelancer
```

There are no permanent `client` or `freelancer` roles on the user object.

---

## Development Setup (full stack)

### Prerequisites

- Go 1.22+
- Node.js 18+
- MySQL 8.0+
- MetaMask (or compatible EVM wallet)
- Arc Testnet USDC in your test wallet

### Steps

```bash
# 1. Clone and install
git clone <repo>
cd arcmilestone

# 2. Smart contract
cd contracts && npm install && npx hardhat compile

# 3. Backend
cd ../backend
cp .env.example .env
# Fill in DB_USER, DB_PASSWORD, AUTH_SECRET, ARC_CONTRACT_ADDRESS, ARC_RPC_URL
sudo systemctl start mysql
mysql -u <user> -p -e "CREATE DATABASE arcmilestone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u <user> -p arcmilestone < database/migrations/001_initial_schema.sql
mysql -u <user> -p arcmilestone < database/migrations/002_remove_proposed_amount.sql
go run ./cmd/api

# 4. Frontend (new terminal)
cd ../frontend
cp .env.example .env
# Set VITE_CONTRACT_ADDRESS to the deployed contract address
npm install
npm run dev
```

Open `http://localhost:5173`, click **Connect Wallet**, approve the MetaMask sign-in prompt, and you are authenticated.

---

## Important Rules

**Never store in the database:**
- Private keys, seed phrases, or wallet passwords
- `proposed_amount` on applications — the payment is fixed by the job
- Permanent `role` fields on users — roles are contextual per job

**Never trust the frontend for financial state:**
- Do not mark a job as funded because the frontend says so
- Blockchain event confirmation via the indexer is required to update `escrow_status`

**Authorization always checks the resource:**
- "Can this user edit job #10?" → check `job.creator_user_id == caller`
- "Can this user submit work on job #10?" → check `job.selected_freelancer_wallet == caller`
- Never check a permanent role field

---

## Remaining Work

1. **Blockchain event listener** — `services/arc_listener.go` is a stub. Needs to poll or subscribe to Arc contract logs, decode events, and update `escrow_status` on jobs.
2. **Submission update endpoint** — `SubmissionRepository.Update` exists but no HTTP endpoint exposes it for recording `deliverable_hash` and `submission_transaction_hash` after on-chain confirmation.
3. **Pagination** — all list endpoints return all rows.
4. **Token revocation** — logout is client-side only; no server-side blocklist.
5. **Rate limiting** — no rate limiting on public endpoints.
6. **Production hardening** — TLS termination, structured logging, metrics, health-check DB probe.

---

## Verification Commands

```bash
# Backend
cd backend
go test ./...
go vet ./...
gofmt -l .

# Frontend
cd frontend
npm run build

# Smart contract
cd contracts
npx hardhat compile
npx hardhat test   # 56 tests
```

---

## Security Notes

- `AUTH_SECRET` and `DB_PASSWORD` must never be committed. Both are in `.gitignore`.
- Nonces are stored as SHA-256 hashes only — the plaintext is never persisted.
- Session token MAC uses constant-time comparison (`hmac.Equal`) to prevent timing attacks.
- The smart contract uses the checks-effects-interactions pattern and a reentrancy guard on all fund-moving functions.
- The contract rejects direct ETH/native-asset payments that arrive outside the expected function calls.
