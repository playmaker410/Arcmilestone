package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"arcmilestone/models"
)

// NotificationRepository contains persistence operations for user-facing
// notifications. Notifications are not authoritative financial records.
type NotificationRepository struct {
	db *sql.DB
}

// CreateNotificationParams contains the fields required to insert a notification.
// The database generates id and created_at.
type CreateNotificationParams struct {
	UserID           uint64
	NotificationType string
	Title            string
	Message          string
	RelatedJobID     *uint64
}

const notificationColumns = `
	id,
	user_id,
	notification_type,
	title,
	message,
	related_job_id,
	read_at,
	created_at`

// NewNotificationRepository constructs a repository using an existing connection pool.
func NewNotificationRepository(db *sql.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// Create inserts a new notification row and returns the database-generated ID.
func (r *NotificationRepository) Create(ctx context.Context, params CreateNotificationParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO notifications (
			user_id,
			notification_type,
			title,
			message,
			related_job_id
		) VALUES (?, ?, ?, ?, ?)`,
		params.UserID,
		params.NotificationType,
		params.Title,
		params.Message,
		params.RelatedJobID,
	)
	if err != nil {
		return 0, fmt.Errorf("create notification: %w", err)
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read created notification ID: %w", err)
	}
	if lastID < 0 {
		return 0, fmt.Errorf("read created notification ID: database returned a negative ID")
	}

	return uint64(lastID), nil
}

// FindByID returns a notification by its internal database ID. A missing row
// is returned as a wrapped sql.ErrNoRows.
func (r *NotificationRepository) FindByID(ctx context.Context, id uint64) (*models.Notification, error) {
	n, err := scanNotification(r.db.QueryRowContext(ctx,
		"SELECT "+notificationColumns+" FROM notifications WHERE id = ?",
		id,
	))
	if err != nil {
		return nil, fmt.Errorf("find notification by ID: %w", err)
	}

	return n, nil
}

// ListByUser returns all notifications for a given user, newest first.
func (r *NotificationRepository) ListByUser(ctx context.Context, userID uint64) ([]*models.Notification, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+notificationColumns+`
		FROM notifications
		WHERE user_id = ?
		ORDER BY created_at DESC, id DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list notifications by user: %w", err)
	}
	defer rows.Close()

	return collectNotifications(rows)
}

// ListUnread returns unread notifications for a given user, newest first.
// A notification is considered unread when read_at IS NULL.
func (r *NotificationRepository) ListUnread(ctx context.Context, userID uint64) ([]*models.Notification, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+notificationColumns+`
		FROM notifications
		WHERE user_id = ?
		  AND read_at IS NULL
		ORDER BY created_at DESC, id DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list unread notifications: %w", err)
	}
	defer rows.Close()

	return collectNotifications(rows)
}

// MarkAsRead sets read_at to the given time on a single notification. The
// update is conditional on read_at being NULL so replaying the call is safe.
func (r *NotificationRepository) MarkAsRead(ctx context.Context, notificationID uint64, readAt time.Time) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE notifications
		SET read_at = ?
		WHERE id = ?
		  AND read_at IS NULL`,
		readAt.UTC(),
		notificationID,
	)
	if err != nil {
		return fmt.Errorf("mark notification as read: %w", err)
	}

	// If zero rows were affected, check whether the row simply doesn't exist.
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("mark notification as read: check affected rows: %w", err)
	}
	if affected > 0 {
		return nil
	}

	var existingID uint64
	err = r.db.QueryRowContext(ctx,
		"SELECT id FROM notifications WHERE id = ?", notificationID,
	).Scan(&existingID)
	if err != nil {
		return fmt.Errorf("mark notification as read: %w", sql.ErrNoRows)
	}

	// Row exists but was already read — not an error.
	return nil
}

// MarkAllAsRead sets read_at to the given time on every unread notification
// belonging to a user. It returns the number of rows updated.
func (r *NotificationRepository) MarkAllAsRead(ctx context.Context, userID uint64, readAt time.Time) (int64, error) {
	result, err := r.db.ExecContext(ctx, `
		UPDATE notifications
		SET read_at = ?
		WHERE user_id = ?
		  AND read_at IS NULL`,
		readAt.UTC(),
		userID,
	)
	if err != nil {
		return 0, fmt.Errorf("mark all notifications as read: %w", err)
	}

	updated, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("count marked notifications: %w", err)
	}

	return updated, nil
}

func collectNotifications(rows *sql.Rows) ([]*models.Notification, error) {
	notifications := make([]*models.Notification, 0)
	for rows.Next() {
		n, err := scanNotification(rows)
		if err != nil {
			return nil, fmt.Errorf("scan notification row: %w", err)
		}
		notifications = append(notifications, n)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notification rows: %w", err)
	}

	return notifications, nil
}

func scanNotification(row rowScanner) (*models.Notification, error) {
	n := new(models.Notification)
	if err := row.Scan(
		&n.ID,
		&n.UserID,
		&n.NotificationType,
		&n.Title,
		&n.Message,
		&n.RelatedJobID,
		&n.ReadAt,
		&n.CreatedAt,
	); err != nil {
		return nil, err
	}

	return n, nil
}
