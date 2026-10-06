package models

import (
	"encoding/json"
	"time"
)

// JobStatus mirrors the jobs.status column (VARCHAR(32)).
// The default value in the database is 'OPEN'.
type JobStatus string

const (
	JobStatusOpen                  JobStatus = "OPEN"
	JobStatusReviewingApplications JobStatus = "REVIEWING_APPLICATIONS"
	JobStatusInProgress            JobStatus = "IN_PROGRESS"
	JobStatusCompleted             JobStatus = "COMPLETED"
	JobStatusCancelled             JobStatus = "CANCELLED"
)

// Job corresponds to one row in the jobs table.
//
// Budget is kept as a decimal string so DECIMAL(36,18) values remain exact
// and never pass through floating-point arithmetic.
//
// RequiredSkills is stored as TEXT in MySQL (a JSON array string) and exposed
// as raw JSON so callers can unmarshal or re-encode as needed.
//
// SelectedFreelancerID is NULL until the job creator selects an applicant.
type Job struct {
	ID                  uint64          `json:"id"`
	CreatorUserID       uint64          `json:"creator_user_id"`
	Title               string          `json:"title"`
	Description         string          `json:"description"`
	RequiredSkills      json.RawMessage `json:"required_skills"`
	Budget              string          `json:"budget"`
	ApplicationDeadline *time.Time      `json:"application_deadline"`
	DeliveryDeadline    time.Time       `json:"delivery_deadline"`
	Status              JobStatus       `json:"status"`
	SelectedFreelancerID *uint64        `json:"selected_freelancer_id"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}
