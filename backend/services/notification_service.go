package services

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

// NotificationService handles read-state management for user notifications.
// Notifications are not financial records.
type NotificationService struct {
	notif *repositories.NotificationRepository
}

// NewNotificationService constructs the service.
func NewNotificationService(notif *repositories.NotificationRepository) *NotificationService {
	return &NotificationService{notif: notif}
}

// ListAll returns all notifications for the authenticated user, newest first.
func (s *NotificationService) ListAll(ctx context.Context, userID uint64) ([]*models.Notification, error) {
	return s.notif.ListByUser(ctx, userID)
}

// ListUnread returns only unread notifications for the authenticated user.
func (s *NotificationService) ListUnread(ctx context.Context, userID uint64) ([]*models.Notification, error) {
	return s.notif.ListUnread(ctx, userID)
}

// MarkRead marks a single notification as read.
// Only the owner of the notification may do this.
func (s *NotificationService) MarkRead(ctx context.Context, notifID, callerUserID uint64) error {
	n, err := s.notif.FindByID(ctx, notifID)
	if errors.Is(err, sql.ErrNoRows) {
		return apperr.ErrNotFound
	}
	if err != nil {
		return err
	}
	if n.UserID != callerUserID {
		return apperr.ErrForbidden
	}
	return s.notif.MarkAsRead(ctx, notifID, time.Now().UTC())
}
