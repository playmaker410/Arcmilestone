package models

import "time"

// Notification corresponds to a user-facing notification. It is not an
// authoritative record of any escrow or payment state.
type Notification struct {
	ID               uint64     `json:"id"`
	UserID           uint64     `json:"user_id"`
	NotificationType string     `json:"notification_type"`
	Title            string     `json:"title"`
	Message          string     `json:"message"`
	RelatedJobID     *uint64    `json:"related_job_id"`
	ReadAt           *time.Time `json:"read_at"`
	CreatedAt        time.Time  `json:"created_at"`
}
