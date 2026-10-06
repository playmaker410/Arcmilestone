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

// JobEscrowService handles recording on-chain escrow references in the DB.
type JobEscrowService struct {
	escrows *repositories.JobEscrowRepository
	jobs    *repositories.JobRepository
}

// NewJobEscrowService constructs the service.
func NewJobEscrowService(
	escrows *repositories.JobEscrowRepository,
	jobs *repositories.JobRepository,
) *JobEscrowService {
	return &JobEscrowService{escrows: escrows, jobs: jobs}
}

// RecordEscrowParams contains the fields the frontend sends after a funding
// transaction is confirmed on-chain.
type RecordEscrowParams struct {
	BlockchainJobID        string
	FundingTransactionHash string
}

// RecordEscrow saves the on-chain escrow reference for a job.
// Only the job creator may call this, and only once (the UNIQUE constraint
// on job_id prevents duplicates). Returns the created escrow record.
func (s *JobEscrowService) RecordEscrow(
	ctx context.Context,
	jobID uint64,
	callerUserID uint64,
	params RecordEscrowParams,
) (*models.JobEscrow, error) {
	// Validate inputs.
	if strings.TrimSpace(params.BlockchainJobID) == "" {
		return nil, apperr.NewValidation(map[string]string{
			"blockchain_job_id": "required",
		})
	}
	if strings.TrimSpace(params.FundingTransactionHash) == "" {
		return nil, apperr.NewValidation(map[string]string{
			"funding_transaction_hash": "required",
		})
	}

	// Load job to verify ownership.
	job, err := s.jobs.FindByID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}

	// Check no escrow already recorded (idempotency guard before DB hit).
	existing, err := s.escrows.FindByJobID(ctx, jobID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check existing escrow: %w", err)
	}
	if existing != nil {
		// Already recorded — return it so the frontend can proceed.
		return existing, nil
	}

	_, err = s.escrows.Create(ctx, repositories.CreateJobEscrowParams{
		JobID:                  jobID,
		ChainID:                5042002, // Arc Testnet chain ID
		ContractAddress:        "", // set from env if needed; omitted for now
		BlockchainJobID:        strings.TrimSpace(params.BlockchainJobID),
		Amount:                 job.Budget,
		FundingTransactionHash: strings.TrimSpace(params.FundingTransactionHash),
	})
	if err != nil {
		return nil, fmt.Errorf("record escrow: %w", err)
	}

	return s.escrows.FindByJobID(ctx, jobID)
}

// GetEscrow returns the escrow record for a job, or nil if none exists yet.
func (s *JobEscrowService) GetEscrow(ctx context.Context, jobID uint64) (*models.JobEscrow, error) {
	e, err := s.escrows.FindByJobID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}
