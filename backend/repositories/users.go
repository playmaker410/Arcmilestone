package repositories

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"arcmilestone/models"
)

// UserRepository contains persistence operations for users.
// The database pool is injected so the repository does not create
// global mutable database state.
type UserRepository struct {
	db *sql.DB
}

// CreateUserParams contains the fields required to create a user.
//
// A new user only needs a wallet address.
// Username is intentionally not included because it is chosen later
// from the dashboard after wallet authentication.
type CreateUserParams struct {
	WalletAddress string
}

// UpdateUsernameParams contains the username selected by the user.
type UpdateUsernameParams struct {
	Username string
}

const userColumns = `
	id,
	wallet_address,
	username,
	created_at,
	updated_at`

// NewUserRepository constructs a repository using an existing connection pool.
func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create inserts a new user with a wallet address.
//
// Username is intentionally left NULL because a new user chooses
// their username later from the dashboard
func (r *UserRepository) Create(ctx context.Context, params CreateUserParams) (uint64, error) {

	WalletAdress := normalizeWalletAddress(params.WalletAddress)

	if WalletAdress == "" {
		return 0, fmt.Errorf("create user: wallet address is required")
	}

	result, err := r.db.ExecContext(ctx, `INSERT INTO users(wallet_address) VALUE(?)`, WalletAdress)

	if err != nil {
		return 0, fmt.Errorf("create user %w", err)
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

// FindByID returns a user by the internal database ID.
//
// sql.ErrNoRows is wrapped and returned when the user does not exist.

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

// FindByWalletAddress returns the user associated with a wallet address.
//
// This is the important lookup for your returning-user flow:
//
// wallet address -> existing user -> user ID -> dashboard data
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

// UpdateUsername sets the username for an existing user.
//
// The wallet address and user ID are intentionally not changed here.
func (r *UserRepository) UpdateUsername(
	ctx context.Context,
	userID uint64,
	params UpdateUsernameParams,
) error {
	username := strings.TrimSpace(params.Username)

	if username == "" {
		return fmt.Errorf("update username: username is required")
	}

	result, err := r.db.ExecContext(ctx, `
		UPDATE users
		SET username = ?
		WHERE id = ?`,
		username,
		userID,
	)
	if err != nil {
		return fmt.Errorf("update username: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("check updated username: %w", err)
	}

	if affected > 0 {
		return nil
	}

	// Some MySQL configurations report 0 affected rows when the supplied
	// username is already the current value. Check whether the user exists
	// before deciding that the user ID is invalid.

	var existingID uint64

	err = r.db.QueryRowContext(ctx, "SELECT id FROM users WHERE id = ?", userID).Scan(&existingID)

	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("update user profile: %w", sql.ErrNoRows)
	}

	if err != nil {
		return fmt.Errorf("confirm user exists after username update: %w", err)
	}

	return nil
}

// CheckUsernameExists returns true if the username is already taken.
func (r *UserRepository) CheckUsernameExists(ctx context.Context, username string) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)", username).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check username exists: %w", err)
	}
	return exists, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(row rowScanner) (*models.User, error) {
	user := new(models.User)
	if err := row.Scan(
		&user.ID,
		&user.WalletAddress,
		&user.Username,
		&user.CreatedAt,
		&user.UpdatedAt,
	); err != nil {
		return nil, err
	}

	return user, nil
}

// normalizeWalletAddress ensures wallet addresses are stored and searched
// consistently.

func normalizeWalletAddress(walletAddress string) string {
	return strings.ToLower(strings.TrimSpace(walletAddress))
}
