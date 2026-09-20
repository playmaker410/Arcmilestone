package repositories

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"arcmilestone/models"
)

// UserRepository contains only user persistence operations. The database pool
// is injected so this repository does not create global mutable state.
type UserRepository struct {
	db *sql.DB
}

// CreateUserParams contains the user fields accepted during creation. Wallet
// secrets are intentionally absent: only the public wallet address is stored.
type CreateUserParams struct {
	WalletAddress string
	DisplayName   *string
	Email         *string
}

// UpdateUserProfileParams contains the only profile fields this repository may
// update. User IDs, wallet addresses, and creation timestamps remain immutable.
type UpdateUserProfileParams struct {
	DisplayName *string
	Email       *string
}

const userColumns = `
	id,
	wallet_address,
	display_name,
	email,
	created_at,
	updated_at`

// NewUserRepository constructs a repository using an existing connection pool.
func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create inserts a user and returns the database-generated internal ID.
// Wallet addresses are normalized to lowercase at this database boundary.
func (r *UserRepository) Create(ctx context.Context, params CreateUserParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO users (wallet_address, display_name, email)
		VALUES (?, ?, ?)`,
		normalizeWalletAddress(params.WalletAddress),
		params.DisplayName,
		params.Email,
	)
	if err != nil {
		return 0, fmt.Errorf("create user: %w", err)
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read created user ID: %w", err)
	}
	if lastID < 0 {
		return 0, fmt.Errorf("read created user ID: database returned a negative ID")
	}

	return uint64(lastID), nil
}

// FindByID returns a user by its internal database ID. A missing user is
// returned as an error wrapping sql.ErrNoRows.
func (r *UserRepository) FindByID(ctx context.Context, id uint64) (*models.User, error) {
	user, err := scanUser(r.db.QueryRowContext(ctx,
		"SELECT "+userColumns+" FROM users WHERE id = ?",
		id,
	))
	if err != nil {
		return nil, fmt.Errorf("find user by ID: %w", err)
	}

	return user, nil
}

// FindByWalletAddress returns a user by normalized lowercase wallet address.
func (r *UserRepository) FindByWalletAddress(ctx context.Context, walletAddress string) (*models.User, error) {
	user, err := scanUser(r.db.QueryRowContext(ctx,
		"SELECT "+userColumns+" FROM users WHERE wallet_address = ?",
		normalizeWalletAddress(walletAddress),
	))
	if err != nil {
		return nil, fmt.Errorf("find user by wallet address: %w", err)
	}

	return user, nil
}

// FindByEmail returns a user by exact email value. An empty string is queried
// as an empty string; it is never silently converted into SQL NULL.
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	user, err := scanUser(r.db.QueryRowContext(ctx,
		"SELECT "+userColumns+" FROM users WHERE email = ?",
		email,
	))
	if err != nil {
		return nil, fmt.Errorf("find user by email: %w", err)
	}

	return user, nil
}

// UpdateProfile updates only display_name and email. It returns a wrapped
// sql.ErrNoRows when the requested user does not exist, including when MySQL
// reports zero affected rows because the supplied values were unchanged.
func (r *UserRepository) UpdateProfile(ctx context.Context, userID uint64, params UpdateUserProfileParams) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE users
		SET display_name = ?, email = ?
		WHERE id = ?`,
		params.DisplayName,
		params.Email,
		userID,
	)
	if err != nil {
		return fmt.Errorf("update user profile: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check updated user profile: %w", err)
	}
	if affected > 0 {
		return nil
	}

	var existingID uint64
	err = r.db.QueryRowContext(ctx, "SELECT id FROM users WHERE id = ?", userID).Scan(&existingID)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("update user profile: %w", sql.ErrNoRows)
	}
	if err != nil {
		return fmt.Errorf("confirm user exists after profile update: %w", err)
	}

	return nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(row rowScanner) (*models.User, error) {
	user := new(models.User)
	if err := row.Scan(
		&user.ID,
		&user.WalletAddress,
		&user.DisplayName,
		&user.Email,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		return nil, err
	}

	return user, nil
}

func normalizeWalletAddress(walletAddress string) string {
	return strings.ToLower(strings.TrimSpace(walletAddress))
}
