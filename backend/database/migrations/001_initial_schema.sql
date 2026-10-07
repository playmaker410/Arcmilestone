-- ============================================================
-- 1. USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    username VARCHAR(50) NULL,
    wallet_address VARCHAR(255) NOT NULL,

    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),

    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_wallet_address (wallet_address)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2. AUTH NONCES
-- Temporary values used during wallet authentication
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_nonces (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NULL,
    wallet_address VARCHAR(255) NOT NULL,

    nonce_hash VARCHAR(128) NOT NULL,

    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6) NULL,

    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),

    UNIQUE KEY uq_auth_nonces_nonce (nonce),
    KEY idx_auth_nonces_wallet (wallet_address),
    KEY idx_auth_nonces_user (user_id),
    KEY idx_auth_nonces_expires (expires_at),

    CONSTRAINT fk_auth_nonces_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3. JOBS
-- A user can create a job and also apply for other jobs.
-- There are no permanent client/freelancer roles.
-- ============================================================

CREATE TABLE IF NOT EXISTS jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    creator_user_id BIGINT UNSIGNED NOT NULL,

    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,

    required_skills TEXT NULL,

    budget DECIMAL(36,18) NOT NULL,

    application_deadline DATETIME(6) NOT NULL,
    delivery_deadline DATETIME(6) NOT NULL,

    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',

    selected_freelancer_id BIGINT UNSIGNED NULL,

    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),

    KEY idx_jobs_creator (creator_user_id),
    KEY idx_jobs_status (status),
    KEY idx_jobs_application_deadline (application_deadline),
    KEY idx_jobs_delivery_deadline (delivery_deadline),
    KEY idx_jobs_selected_freelancer (selected_freelancer_id),

    CONSTRAINT fk_jobs_creator
        FOREIGN KEY (creator_user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    CONSTRAINT fk_jobs_selected_freelancer
        FOREIGN KEY (selected_freelancer_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    CONSTRAINT chk_jobs_budget
        CHECK (budget > 0)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 4. JOB APPLICATIONS
-- Records users who apply for jobs.
-- ============================================================

CREATE TABLE IF NOT EXISTS applications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    job_id BIGINT UNSIGNED NOT NULL,
    applicant_user_id BIGINT UNSIGNED NOT NULL,

    cover_letter TEXT NULL,
    estimated_days INT UNSIGNED NOT NULL,
    portfolio_url TEXT NULL,

    status VARCHAR(32) NOT NULL DEFAULT 'pending',

    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),

    UNIQUE KEY uq_job_applications_job_applicant
        (job_id, applicant_user_id),

    KEY idx_job_applications_job (job_id),
    KEY idx_job_applications_applicant (applicant_user_id),
    KEY idx_job_applications_status (status),

    CONSTRAINT fk_job_applications_job
        FOREIGN KEY (job_id)
        REFERENCES jobs (id)
        ON DELETE CASCADE
        ON UPDATE RESTRICT,

    CONSTRAINT fk_job_applications_applicant
        FOREIGN KEY (applicant_user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 5. JOB ESCROWS
-- Stores references to the blockchain escrow.
-- The blockchain remains the source of truth for the money.
-- ============================================================

CREATE TABLE IF NOT EXISTS job_escrows (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    job_id BIGINT UNSIGNED NOT NULL,

    chain_id BIGINT UNSIGNED NOT NULL,
    contract_address VARCHAR(255) NOT NULL,

    blockchain_job_id VARCHAR(128) NOT NULL,

    amount DECIMAL(36,18) NOT NULL,

    funding_transaction_hash VARCHAR(255) NULL,

    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),

    UNIQUE KEY uq_job_escrows_job (job_id),

    KEY idx_job_escrows_chain (chain_id),
    KEY idx_job_escrows_contract (contract_address),
    KEY idx_job_escrows_blockchain_job (blockchain_job_id),
    KEY idx_job_escrows_status (status),
    KEY idx_job_escrows_funding_tx (funding_transaction_hash),

    CONSTRAINT fk_job_escrows_job
        FOREIGN KEY (job_id)
        REFERENCES jobs (id)
        ON DELETE CASCADE
        ON UPDATE RESTRICT,

    CONSTRAINT chk_job_escrows_amount
        CHECK (amount > 0)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 6. JOB SUBMISSIONS
-- Stores the work submitted by the selected freelancer.
-- ============================================================

CREATE TABLE IF NOT EXISTS job_submissions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    job_id BIGINT UNSIGNED NOT NULL,
    freelancer_id BIGINT UNSIGNED NOT NULL,

    repository_url VARCHAR(2048) NULL,
    demo_url VARCHAR(2048) NULL,

    description TEXT NULL,

    status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',

    submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    reviewed_at DATETIME(6) NULL,

    PRIMARY KEY (id),

    KEY idx_job_submissions_job (job_id),
    KEY idx_job_submissions_freelancer (freelancer_id),
    KEY idx_job_submissions_status (status),

    CONSTRAINT fk_job_submissions_job
        FOREIGN KEY (job_id)
        REFERENCES jobs (id)
        ON DELETE CASCADE
        ON UPDATE RESTRICT,

    CONSTRAINT fk_job_submissions_freelancer
        FOREIGN KEY (freelancer_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 7. NOTIFICATIONS
-- User-facing notifications.
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    user_id BIGINT UNSIGNED NOT NULL,

    notification_type VARCHAR(64) NOT NULL,

    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    related_job_id BIGINT UNSIGNED NULL,

    read_at DATETIME(6) NULL
        COMMENT 'UTC time when the notification was read.',

    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    PRIMARY KEY (id),

    KEY idx_notifications_user_unread_created
        (user_id, read_at, created_at),

    KEY idx_notifications_user_created
        (user_id, created_at),

    KEY idx_notifications_related_job
        (related_job_id),

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    CONSTRAINT fk_notifications_related_job
        FOREIGN KEY (related_job_id)
        REFERENCES jobs (id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;