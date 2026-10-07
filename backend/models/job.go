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

// JobDetail is the enriched response returned by API endpoints.
// It embeds Job and adds wallet addresses (from the users table) and
// escrow fields (from the job_escrows table) so the frontend can perform
// permission checks and display blockchain state without extra round-trips.
//
// Fields sourced from joined tables use pointers so they marshal as null
// when the row does not exist (e.g. no freelancer selected yet, no escrow
// recorded yet).
type JobDetail struct {
	Job

	// From users JOIN on creator_user_id
	CreatorWallet string `json:"creator_wallet"`

	// From users JOIN on selected_freelancer_id (null when no freelancer yet)
	SelectedFreelancerWallet *string `json:"selected_freelancer_wallet"`

	// From job_escrows LEFT JOIN (null when escrow not yet recorded)
	EscrowStatus           *string `json:"escrow_status"`
	BlockchainJobID        *string `json:"blockchain_job_id"`
	FundingTransactionHash *string `json:"funding_transaction_hash"`
}
