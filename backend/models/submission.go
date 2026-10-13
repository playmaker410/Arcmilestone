package models

import "time"

// Submission statuses.
const (
	SubmissionStatusSubmitted        = "SUBMITTED"
	SubmissionStatusChangesRequested = "CHANGES_REQUESTED"
	SubmissionStatusApproved         = "APPROVED"
)

// Submission corresponds to one submission row for a marketplace job.
// A job has at most one row; a resubmission after a revision request updates
// the row and increments RevisionCount. The full history lives in job_messages.
type Submission struct {
	ID                        uint64     `json:"id"`
	JobID                     uint64     `json:"job_id"`
	FreelancerUserID          uint64     `json:"freelancer_user_id"`
	RepositoryURL             *string    `json:"repository_url"`
	DemoURL                   *string    `json:"demo_url"`
	SubmissionURL             string     `json:"submission_url"` // legacy: primary link (repo or demo)
	Notes                     string     `json:"notes"`
	Status                    string     `json:"status"`
	RevisionCount             uint32     `json:"revision_count"`
	ReviewFeedback            *string    `json:"review_feedback"`
	ReviewedAt                *time.Time `json:"reviewed_at"`
	DeliverableHash           *string    `json:"deliverable_hash"`
	SubmissionTransactionHash *string    `json:"submission_transaction_hash"`
	CreatedAt                 time.Time  `json:"created_at"`
	UpdatedAt                 time.Time  `json:"updated_at"`
}
