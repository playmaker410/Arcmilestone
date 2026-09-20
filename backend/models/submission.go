package models

import "time"

// Submission corresponds to one v1 submission row for a marketplace job.
// File contents stay in external storage; this model contains only their URL
// and the optional onchain hashes that reference the delivery.
type Submission struct {
	ID                        uint64    `json:"id"`
	JobID                     uint64    `json:"job_id"`
	FreelancerUserID          uint64    `json:"freelancer_user_id"`
	SubmissionURL             string    `json:"submission_url"`
	Notes                     string    `json:"notes"`
	DeliverableHash           *string   `json:"deliverable_hash"`
	SubmissionTransactionHash *string   `json:"submission_transaction_hash"`
	CreatedAt                 time.Time `json:"created_at"`
	UpdatedAt                 time.Time `json:"updated_at"`
}
