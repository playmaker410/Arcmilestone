package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"arcmilestone/models"
)

// AuthNonceRepository contains persistence operations for wallet-signature
// challenges. It stores only the hash of each challenge, never the plaintext.
type AuthNonceRepository struct {
	db *sql.DB
}

// CreateAuthNonceParams contains the fields required to insert a new nonce row.
// The database generates id and created_at.
type CreateAuthNonceParams struct {
	UserID    uint64
	NonceHash string
	ExpiresAt time.Time
}

const authNonceColumns = `
	id,
	user_id,
	nonce_hash,
	expires_at,
	used_at,
	created_at`

// NewAuthNonceRepository constructs a repository using an existing connection pool.
func NewAuthNonceRepository(db *sql.DB) *AuthNonceRepository {
	return &AuthNonceRepository{db: db}
}

// Create inserts a new auth nonce row and returns the database-generated ID.
func (r *AuthNonceRepository) Create(ctx context.Context, params CreateAuthNonceParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO auth_nonces (user_id, nonce_hash, expires_at)
		VALUES (?, ?, ?)`,
		params.UserID,
		params.NonceHash,
		params.ExpiresAt.UTC(),
	)
	if err != nil {
		return 0, fmt.Errorf("create auth nonce: %w", err)
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read created auth nonce ID: %w", err)
	}
	if lastID < 0 {
		return 0, fmt.Errorf("read created auth nonce ID: database returned a negative ID")
	}

	return uint64(lastID), nil
}

// FindValidByNonceHash returns a nonce row that has not been used and has not
// expired. A missing or invalid nonce returns a wrapped sql.ErrNoRows.
func (r *AuthNonceRepository) FindValidByNonceHash(ctx context.Context, nonceHash string) (*models.AuthNonce, error) {
	nonce, err := scanAuthNonce(r.db.QueryRowContext(ctx, `
		SELECT`+authNonceColumns+`
		FROM auth_nonces
		WHERE nonce_hash = ?
		  AND used_at IS NULL
		  AND expires_at > UTC_TIMESTAMP(6)`,
		nonceHash,
	))
	if err != nil {
		return nil, fmt.Errorf("find valid auth nonce by hash: %w", err)
	}

	return nonce, nil
}

// MarkUsed records the time at which a nonce was consumed. The update is
// conditional on used_at being NULL so a replay of the same hash is harmless:
// the row is simply not updated a second time. A wrapped sql.ErrNoRows is
// returned when the nonce does not exist at all.
func (r *AuthNonceRepository) MarkUsed(ctx context.Context, id uint64, usedAt time.Time) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE auth_nonces
		SET used_at = ?
		WHERE id = ?
		  AND used_at IS NULL`,
		usedAt.UTC(),
		id,
	)
	if err != nil {
		return fmt.Errorf("mark auth nonce used: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check marked auth nonce: %w", err)
	}
	if affected > 0 {
		return nil
	}

	// Distinguish "does not exist" from "already used" for the caller.
	var existingID uint64
	err = r.db.QueryRowContext(ctx,
		"SELECT id FROM auth_nonces WHERE id = ?", id,
	).Scan(&existingID)
	if err != nil {
		return fmt.Errorf("mark auth nonce used: %w", sql.ErrNoRows)
	}

	// Row exists but used_at is already set — treat as already consumed.
	return fmt.Errorf("mark auth nonce used: nonce has already been consumed")
}

// DeleteExpired removes nonce rows whose expiry time is in the past and which
// have already been used. It leaves unused-but-expired rows in place for
// debugging purposes. It returns the number of deleted rows.
func (r *AuthNonceRepository) DeleteExpired(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `
		DELETE FROM auth_nonces
		WHERE expires_at <= UTC_TIMESTAMP(6)
		  AND used_at IS NOT NULL`)
	if err != nil {
		return 0, fmt.Errorf("delete expired auth nonces: %w", err)
	}

	deleted, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("count deleted auth nonces: %w", err)
	}

	return deleted, nil
}

func scanAuthNonce(row rowScanner) (*models.AuthNonce, error) {
	n := new(models.AuthNonce)
	if err := row.Scan(
		&n.ID,
		&n.UserID,
		&n.NonceHash,
		&n.ExpiresAt,
		&n.UsedAt,
		&n.CreatedAt,
	); err != nil {
		return nil, err
	}

	return n, nil
}
