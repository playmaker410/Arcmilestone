-- 003: delivery revisions, job workspace messages, indexed escrow events.
-- The API applies the same changes automatically at startup
-- (database.EnsureSchema), this file documents them for manual setups.

ALTER TABLE submissions
    ADD COLUMN repository_url VARCHAR(2048) NULL,
    ADD COLUMN demo_url VARCHAR(2048) NULL,
    ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    ADD COLUMN revision_count INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN review_feedback TEXT NULL,
    ADD COLUMN reviewed_at DATETIME(6) NULL;

CREATE TABLE IF NOT EXISTS job_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id BIGINT UNSIGNED NOT NULL,
    sender_user_id BIGINT UNSIGNED NULL,
    sender_role VARCHAR(16) NOT NULL,          -- client | freelancer | system
    message_type VARCHAR(32) NOT NULL DEFAULT 'message', -- message | revision_request | submission | system
    body TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_job_messages_job (job_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS escrow_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    amount DECIMAL(36,18) NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INT UNSIGNED NOT NULL,
    block_number BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_escrow_events_log (transaction_hash, log_index),
    KEY idx_escrow_events_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
