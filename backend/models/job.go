package models

import (
	"encoding/json"
	"time"
)

// HiringMethod is the jobs.hiring_method ENUM value.
type HiringMethod string

const (
	HiringMethodOpen   HiringMethod = "open"
	HiringMethodDirect HiringMethod = "direct"
)

// MarketplaceStatus is the jobs.marketplace_status ENUM value.
type MarketplaceStatus string

const (
	MarketplaceStatusDraft                 MarketplaceStatus = "draft"
	MarketplaceStatusOpen                  MarketplaceStatus = "open"
	MarketplaceStatusReviewingApplications MarketplaceStatus = "reviewing_applications"
	MarketplaceStatusAwaitingFunding       MarketplaceStatus = "awaiting_funding"
	MarketplaceStatusInProgress            MarketplaceStatus = "in_progress"
	MarketplaceStatusCompleted             MarketplaceStatus = "completed"
	MarketplaceStatusCancelled             MarketplaceStatus = "cancelled"
)

// EscrowStatus is the optional, indexed copy of the onchain escrow state.
// The ArcMilestone contract remains authoritative for payment status.
type EscrowStatus string

const (
	EscrowStatusFunded        EscrowStatus = "funded"
	EscrowStatusWorkSubmitted EscrowStatus = "work_submitted"
	EscrowStatusCompleted     EscrowStatus = "completed"
	EscrowStatusRefunded      EscrowStatus = "refunded"
)

// Job corresponds to one row in the jobs table. Budget is kept as a decimal
// string so DECIMAL(36,18) values remain exact and never pass through floats.
type Job struct {
	ID                       uint64            `json:"id"`
	CreatorUserID            uint64            `json:"creator_user_id"`
	CreatorWallet            string            `json:"creator_wallet"`
	HiringMethod             HiringMethod      `json:"hiring_method"`
	Title                    string            `json:"title"`
	Description              string            `json:"description"`
	RequiredSkills           json.RawMessage   `json:"required_skills"`
	Budget                   string            `json:"budget"`
	ApplicationDeadline      *time.Time        `json:"application_deadline"`
	DeliveryDeadline         time.Time         `json:"delivery_deadline"`
	ReferenceURL             *string           `json:"reference_url"`
	MarketplaceStatus        MarketplaceStatus `json:"marketplace_status"`
	SelectedFreelancerUserID *uint64           `json:"selected_freelancer_user_id"`
	SelectedFreelancerWallet *string           `json:"selected_freelancer_wallet"`
	BlockchainJobID          *string           `json:"blockchain_job_id"`
	ContractAddress          *string           `json:"contract_address"`
	FundingTransactionHash   *string           `json:"funding_transaction_hash"`
	MetadataHash             *string           `json:"metadata_hash"`
	EscrowStatus             *EscrowStatus     `json:"escrow_status"`
	ChainID                  *uint64           `json:"chain_id"`
	CreatedAt                time.Time         `json:"created_at"`
	UpdatedAt                time.Time         `json:"updated_at"`
}
