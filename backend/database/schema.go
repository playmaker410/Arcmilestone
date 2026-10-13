package database

import (
	"context"
	"database/sql"
	"fmt"
)

// EnsureSchema applies small, idempotent schema upgrades at startup so a
// developer database created from an older schema keeps working without a
// manual migration step. Every statement is safe to run repeatedly.
func EnsureSchema(ctx context.Context, db *sql.DB) error {
	tables := []string{
		`CREATE TABLE IF NOT EXISTS submissions (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			job_id BIGINT UNSIGNED NOT NULL,
			freelancer_user_id BIGINT UNSIGNED NOT NULL,
			submission_url VARCHAR(2048) NOT NULL,
			notes TEXT NOT NULL,
			deliverable_hash VARCHAR(66) NULL,
			submission_transaction_hash VARCHAR(66) NULL,
			created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
			updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
			PRIMARY KEY (id),
			UNIQUE KEY uq_submissions_job (job_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		`CREATE TABLE IF NOT EXISTS job_messages (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			job_id BIGINT UNSIGNED NOT NULL,
			sender_user_id BIGINT UNSIGNED NULL,
			sender_role VARCHAR(16) NOT NULL,
			message_type VARCHAR(32) NOT NULL DEFAULT 'message',
			body TEXT NOT NULL,
			created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
			PRIMARY KEY (id),
			KEY idx_job_messages_job (job_id, id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		`CREATE TABLE IF NOT EXISTS escrow_events (
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
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

		`CREATE TABLE IF NOT EXISTS processed_events (
			id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
			chain_id BIGINT UNSIGNED NOT NULL,
			transaction_hash VARCHAR(66) NOT NULL,
			log_index INT UNSIGNED NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY idx_unique_event (chain_id, transaction_hash, log_index)
		)`,
	}
	for _, stmt := range tables {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("ensure schema: %w", err)
		}
	}

	columns := []struct{ table, column, definition string }{
		{"submissions", "repository_url", "VARCHAR(2048) NULL"},
		{"submissions", "demo_url", "VARCHAR(2048) NULL"},
		{"submissions", "status", "VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED'"},
		{"submissions", "revision_count", "INT UNSIGNED NOT NULL DEFAULT 0"},
		{"submissions", "review_feedback", "TEXT NULL"},
		{"submissions", "reviewed_at", "DATETIME(6) NULL"},
	}
	for _, c := range columns {
		var n int
		err := db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
			c.table, c.column).Scan(&n)
		if err != nil {
			return fmt.Errorf("inspect column %s.%s: %w", c.table, c.column, err)
		}
		if n > 0 {
			continue
		}
		stmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", c.table, c.column, c.definition)
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("add column %s.%s: %w", c.table, c.column, err)
		}
	}
	return nil
}
