package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

// UserService handles user profile operations. Authentication identity comes
// from the wallet address; this service manages the optional display fields.
type UserService struct {
	users *repositories.UserRepository
}

// NewUserService constructs the service.
func NewUserService(users *repositories.UserRepository) *UserService {
	return &UserService{users: users}
}

// UpdateProfileParams contains the fields a user may change on their profile.
type UpdateProfileParams struct {
	DisplayName *string
	Email       *string
}

// GetByID returns a user by internal ID.
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

// UpdateProfile validates and applies profile changes for the given user.
func (s *UserService) UpdateProfile(ctx context.Context, userID uint64, params UpdateProfileParams) (*models.User, error) {
	if params.Email != nil {
		trimmed := strings.TrimSpace(*params.Email)
		if trimmed != "" && !strings.Contains(trimmed, "@") {
			return nil, apperr.NewValidation(map[string]string{"email": "must be a valid email address"})
		}
		if trimmed == "" {
			params.Email = nil
		} else {
			params.Email = &trimmed
		}
	}
	if params.DisplayName != nil {
		trimmed := strings.TrimSpace(*params.DisplayName)
		if len(trimmed) > 100 {
			return nil, apperr.NewValidation(map[string]string{"display_name": "must be 100 characters or fewer"})
		}
		if trimmed == "" {
			params.DisplayName = nil
		} else {
			params.DisplayName = &trimmed
		}
	}

	err := s.users.UpdateProfile(ctx, userID, repositories.UpdateUserProfileParams{
		DisplayName: params.DisplayName,
		Email:       params.Email,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("update profile: %w", err)
	}

	return s.users.FindByID(ctx, userID)
}
