-- ArcMilestone marketplace initial schema
-- Target: MySQL 8.0+ (the arcmilestone database must already be selected).
--
-- This migration is deliberately non-destructive: it creates only the
-- offchain marketplace tables and never stores wallet secrets or controls funds.
-- MySQL DDL commonly performs implicit commits, so this file is not wrapped in
-- a transaction that would misleadingly suggest automatic rollback is possible.
--
-- Timestamp policy: TIMESTAMP values are stored by MySQL in UTC. DATETIME values
-- in this schema are also UTC by application convention; future connections
-- should use a UTC session time zone when reading and writing them.

-- =====================================================
-- USERS
-- =====================================================
-- Wallet addresses are public identifiers, not credentials. The application
-- must normalize them to lowercase before inserting or querying this table.
-- Private keys, seed/recovery phrases, and wallet passwords must never enter
-- this database.
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    wallet_address CHAR(42) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT 'Lowercase 0x-prefixed EVM address; public identifier only.',
    display_name VARCHAR(100) NULL,
    email VARCHAR(254) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT uq_users_wallet_address UNIQUE (wallet_address),
    CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Marketplace users. Wallet secrets must never be stored here.';

-- =====================================================
-- AUTHENTICATION NONCES
-- =====================================================
-- Future wallet authentication proves ownership by signing a one-time challenge.
-- Only a hash of that challenge is kept. RESTRICT preserves challenge history if
-- a user deletion is attempted; it does not silently erase authentication audit data.
CREATE TABLE IF NOT EXISTS auth_nonces (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    nonce_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT 'Hex-encoded nonce hash, never the plaintext signing challenge.',
    expires_at DATETIME(6) NOT NULL COMMENT 'UTC expiration time for this challenge.',
    used_at DATETIME(6) NULL COMMENT 'UTC time when the signed challenge was consumed.',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT uq_auth_nonces_nonce_hash UNIQUE (nonce_hash),
    KEY idx_auth_nonces_valid_lookup (user_id, used_at, expires_at),
    CONSTRAINT fk_auth_nonces_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Hashed, expiring, single-use wallet-signature challenges.';

-- =====================================================
-- JOBS
-- =====================================================
-- ENUMs make the allowed lifecycle values visible and reject invalid values.
-- Adding or renaming a status later requires a deliberate follow-up migration.
-- required_skills uses MySQL 8 native JSON so the API can preserve an ordered
-- skill list. That convenience is MySQL-specific; the API remains responsible
-- for validating that it receives a JSON array of strings.
--
-- DECIMAL(36,18) means up to 36 total digits with up to 18 after the decimal
-- point, with no floating-point rounding. The Arc contract still uses integer
-- smallest units; conversion belongs in carefully tested Go application code.
CREATE TABLE IF NOT EXISTS jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    creator_user_id BIGINT UNSIGNED NOT NULL,
    hiring_method ENUM('open', 'direct') NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    required_skills JSON NOT NULL,
    budget DECIMAL(36,18) NOT NULL,
    application_deadline DATETIME(6) NULL COMMENT 'UTC; normally null for a direct hire.',
    delivery_deadline DATETIME(6) NOT NULL COMMENT 'UTC marketplace deadline.',
    reference_url VARCHAR(2048) NULL,
    marketplace_status ENUM(
        'draft',
        'open',
        'reviewing_applications',
        'awaiting_funding',
        'in_progress',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'draft',
    selected_freelancer_user_id BIGINT UNSIGNED NULL,
    selected_freelancer_wallet CHAR(42) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT 'Lowercase public EVM address; supports direct hires before a profile exists.',
    blockchain_job_id VARCHAR(78) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT 'Lossless base-10 Solidity uint256 string; MySQL BIGINT is too small.',
    contract_address CHAR(42) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT 'Lowercase 0x-prefixed ArcMilestone contract address.',
    funding_transaction_hash CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT '0x-prefixed transaction hash that funded the onchain escrow.',
    metadata_hash CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT '0x-prefixed bytes32 hash of offchain job metadata.',
    escrow_status ENUM('funded', 'work_submitted', 'completed', 'refunded') NULL
        COMMENT 'Indexed copy of Arc escrow status; the contract remains authoritative.',
    chain_id BIGINT UNSIGNED NULL COMMENT 'EVM chain ID; supports Arc Testnet 5042002.',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT chk_jobs_budget_positive CHECK (budget > 0),
    CONSTRAINT chk_jobs_application_before_delivery
        CHECK (application_deadline IS NULL OR application_deadline < delivery_deadline),
    CONSTRAINT chk_jobs_blockchain_identity_complete CHECK (
        (blockchain_job_id IS NULL AND contract_address IS NULL AND chain_id IS NULL)
        OR
        (blockchain_job_id IS NOT NULL AND contract_address IS NOT NULL AND chain_id IS NOT NULL)
    ),
    CONSTRAINT chk_jobs_escrow_status_requires_chain_job
        CHECK (escrow_status IS NULL OR blockchain_job_id IS NOT NULL),
    CONSTRAINT uq_jobs_chain_contract_blockchain_job
        UNIQUE (chain_id, contract_address, blockchain_job_id),
    KEY idx_jobs_creator (creator_user_id),
    KEY idx_jobs_selected_freelancer_user (selected_freelancer_user_id),
    KEY idx_jobs_selected_freelancer_wallet (selected_freelancer_wallet),
    KEY idx_jobs_hiring_method (hiring_method),
    KEY idx_jobs_marketplace_status (marketplace_status),
    KEY idx_jobs_escrow_status (escrow_status),
    KEY idx_jobs_application_deadline (application_deadline),
    KEY idx_jobs_delivery_deadline (delivery_deadline),
    CONSTRAINT fk_jobs_creator_user
        FOREIGN KEY (creator_user_id) REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_jobs_selected_freelancer_user
        FOREIGN KEY (selected_freelancer_user_id) REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Offchain marketplace jobs and searchable copies of onchain identifiers; never an escrow ledger.';

-- =====================================================
-- APPLICATIONS
-- =====================================================
-- Database constraints prevent duplicate applications, but Go must also verify
-- that the job is open, the deadline has not passed, the creator is not applying
-- to their own job, and only that job creator accepts an applicant.
CREATE TABLE IF NOT EXISTS applications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id BIGINT UNSIGNED NOT NULL,
    applicant_user_id BIGINT UNSIGNED NOT NULL,
    cover_letter TEXT NOT NULL,
    proposed_amount DECIMAL(36,18) NOT NULL,
    estimated_days INT UNSIGNED NOT NULL,
    portfolio_url VARCHAR(2048) NULL,
    status ENUM('pending', 'accepted', 'rejected', 'withdrawn') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT uq_applications_job_applicant UNIQUE (job_id, applicant_user_id),
    CONSTRAINT chk_applications_proposed_amount_positive CHECK (proposed_amount > 0),
    CONSTRAINT chk_applications_estimated_days_positive CHECK (estimated_days > 0),
    KEY idx_applications_job_status (job_id, status),
    KEY idx_applications_applicant (applicant_user_id),
    KEY idx_applications_status (status),
    CONSTRAINT fk_applications_job
        FOREIGN KEY (job_id) REFERENCES jobs (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_applications_applicant_user
        FOREIGN KEY (applicant_user_id) REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Marketplace applications; application business rules are enforced by the Go API.';

-- =====================================================
-- SUBMISSIONS
-- =====================================================
-- Version 1 permits one active submission per job. The URL and notes remain
-- offchain, and no uploaded file contents are stored in MySQL. Hashes may be
-- null while an offchain submission exists before its chain transaction succeeds.
CREATE TABLE IF NOT EXISTS submissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id BIGINT UNSIGNED NOT NULL,
    freelancer_user_id BIGINT UNSIGNED NOT NULL,
    submission_url VARCHAR(2048) NOT NULL,
    notes TEXT NOT NULL,
    deliverable_hash CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT '0x-prefixed bytes32 hash recorded by the contract after submission.',
    submission_transaction_hash CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT '0x-prefixed transaction hash for the contract submission call.',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT uq_submissions_job UNIQUE (job_id),
    KEY idx_submissions_freelancer (freelancer_user_id),
    CONSTRAINT fk_submissions_job
        FOREIGN KEY (job_id) REFERENCES jobs (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_submissions_freelancer_user
        FOREIGN KEY (freelancer_user_id) REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='One v1 offchain deliverable reference per job; file contents live outside MySQL.';

-- =====================================================
-- NOTIFICATIONS
-- =====================================================
-- Notifications are user-facing convenience records, not authoritative financial data.
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    notification_type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_job_id BIGINT UNSIGNED NULL,
    read_at DATETIME(6) NULL COMMENT 'UTC time when the notification was read.',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    KEY idx_notifications_user_unread_created (user_id, read_at, created_at),
    KEY idx_notifications_user_created (user_id, created_at),
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_notifications_related_job
        FOREIGN KEY (related_job_id) REFERENCES jobs (id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='User-facing messages only; not an authoritative financial record.';

-- =====================================================
-- BLOCKCHAIN EVENTS
-- =====================================================
-- This is an idempotent indexed copy of Arc contract logs for search and display.
-- ArcMilestone onchain state remains the authority for escrow, payments, and refunds.
-- uint256 IDs and block numbers are stored as lossless ASCII decimal strings up to
-- 78 digits because MySQL BIGINT cannot represent every Solidity uint256 value.
CREATE TABLE IF NOT EXISTS blockchain_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    chain_id BIGINT UNSIGNED NOT NULL COMMENT 'EVM chain ID, including Arc Testnet 5042002.',
    contract_address CHAR(42) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT 'Lowercase 0x-prefixed contract address that emitted the log.',
    event_name VARCHAR(128) NOT NULL,
    block_number VARCHAR(78) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
        COMMENT 'Lossless base-10 block number; application writes canonical decimal text.',
    transaction_hash CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    log_index BIGINT UNSIGNED NOT NULL,
    block_hash CHAR(66) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    block_timestamp DATETIME(6) NULL COMMENT 'UTC block timestamp when available.',
    blockchain_job_id VARCHAR(78) CHARACTER SET ascii COLLATE ascii_bin NULL
        COMMENT 'Lossless base-10 Solidity uint256 job ID when the event concerns a job.',
    related_job_id BIGINT UNSIGNED NULL,
    event_payload JSON NOT NULL COMMENT 'MySQL 8 JSON copy of decoded public event data.',
    processed_at DATETIME(6) NULL COMMENT 'UTC time when downstream event handling completed.',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),
    CONSTRAINT uq_blockchain_events_chain_transaction_log
        UNIQUE (chain_id, transaction_hash, log_index),
    KEY idx_blockchain_events_contract_event (chain_id, contract_address, event_name),
    KEY idx_blockchain_events_block_number (chain_id, block_number),
    KEY idx_blockchain_events_blockchain_job (chain_id, contract_address, blockchain_job_id),
    KEY idx_blockchain_events_related_job (related_job_id),
    KEY idx_blockchain_events_processed_at (processed_at),
    CONSTRAINT fk_blockchain_events_related_job
        FOREIGN KEY (related_job_id) REFERENCES jobs (id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Idempotent indexed Arc event log copy; never the authority for escrow payment status.';
