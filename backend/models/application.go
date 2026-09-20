package models

import "time"

// ApplicationStatus is the applications.status ENUM value.
type ApplicationStatus string

const (
	ApplicationStatusPending   ApplicationStatus = "pending"
	ApplicationStatusAccepted  ApplicationStatus = "accepted"
	ApplicationStatusRejected  ApplicationStatus = "rejected"
	ApplicationStatusWithdrawn ApplicationStatus = "withdrawn"
)

// Application corresponds to one row in the applications table. The job's
// funded escrow amount is the final payment; freelancers apply for the fixed
// amount already set by the client and do not propose a counter-amount.
type Application struct {
	ID              uint64            `json:"id"`
	JobID           uint64            `json:"job_id"`
	ApplicantUserID uint64            `json:"applicant_user_id"`
	CoverLetter     string            `json:"cover_letter"`
	EstimatedDays   uint32            `json:"estimated_days"`
	PortfolioURL    *string           `json:"portfolio_url"`
	Status          ApplicationStatus `json:"status"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}
