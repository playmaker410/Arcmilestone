CREATE TABLE processed_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chain_id BIGINT UNSIGNED NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_unique_event (chain_id, transaction_hash, log_index)
);
