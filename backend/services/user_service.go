package services

import (
	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// UserService handles user account/profile operations.
//
// Wallet authentication itself belongs to AuthService.
// UserService is responsible for retrieving users and updating
// profile information such as the username.

type UserService struct {
	users *repositories.UserRepository
}

// NewUserService constructs the service.

func NewUserService(users *repositories.UserRepository) *UserService {
	return &UserService{users: users}
}

// NewUserService constructs the service.

func (s *UserService) GetByID(ctx context.Context, id uint64) (*models.User, error) {
	user, err := s.users.FindByID(ctx, id)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}

	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetByWalletAddress returns the user associated with a wallet address.
//
// This is used to determine whether the wallet belongs to an existing
// ArcMilestone user.

func (s *UserService) GetByWalletAddress(ctx context.Context, WalletAdress string) (*models.User, error) {
	WalletAdress = strings.TrimSpace(WalletAdress)

	if WalletAdress == "" {
		return nil, apperr.NewValidation(map[string]string{
			"WalletAdress": "Walletadress is required",
		})
	}

	user, err := s.users.FindByWalletAddress(ctx, WalletAdress)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}

	if err != nil {
		return nil, fmt.Errorf("find user by wallet address: %w", err)
	}

	return user, nil
}

// UpdateUsername sets the username chosen by the user after authentication.
//
// A new account is initially created without a username.
// The dashboard can call this after authentication to complete the profile.

func (s *UserService) UpdateUsername(ctx context.Context, UserID uint64, username string) (*models.User, error) {
	username = strings.TrimSpace(username)

	if username == "" {
		return nil, apperr.NewValidation(map[string]string{
			"Username": "Username is required",
		})
	}

	if len(username) > 50 {
		return nil, apperr.NewValidation(map[string]string{
			"username": "username must be 50 characters or fewer",
		})
	}

	err := s.users.UpdateUsername(ctx, UserID, repositories.UpdateUsernameParams{
		Username: username,
	},
	)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}

	if err != nil {
		return nil, fmt.Errorf("update username: %w", err)
	}

	return s.users.FindByID(ctx, UserID)
}

// IsUsernameAvailable checks if a username is available to claim.
func (s *UserService) IsUsernameAvailable(ctx context.Context, username string) (bool, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return false, nil
	}
	exists, err := s.users.CheckUsernameExists(ctx, username)
	if err != nil {
		return false, err
	}
	// Available if it DOES NOT exist
	return !exists, nil
}
