package repositories

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"arcmilestone/models"
)

// JobEscrowRepository persists references to on-chain escrow records.
// The blockchain remains the source of truth for funds; this table is an
// offchain index that lets the backend serve blockchain_job_id and
// funding_transaction_hash without an RPC call on every request.
type JobEscrowRepository struct {
	db *sql.DB
}

// NewJobEscrowRepository constructs a repository using an existing connection pool.
func NewJobEscrowRepository(db *sql.DB) *JobEscrowRepository {
	return &JobEscrowRepository{db: db}
}

// CreateJobEscrowParams contains the fields written after a funding transaction
// is confirmed on-chain.
type CreateJobEscrowParams struct {
	JobID                  uint64
	ChainID                uint64
	ContractAddress        string
	BlockchainJobID        string // lossless base-10 string from the contract
	Amount                 string // decimal string matching jobs.budget
	FundingTransactionHash string
}

// Create inserts a new job_escrows row. The UNIQUE constraint on job_id
// prevents duplicate rows for the same job — a second insert returns an error
// the caller should treat as a conflict.
func (r *JobEscrowRepository) Create(ctx context.Context, params CreateJobEscrowParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO job_escrows (
			job_id,
			chain_id,
			contract_address,
			blockchain_job_id,
			amount,
			funding_transaction_hash,
			status
		) VALUES (?, ?, ?, ?, ?, ?, 'funded')`,
		params.JobID,
		params.ChainID,
		params.ContractAddress,
		params.BlockchainJobID,
		params.Amount,
		params.FundingTransactionHash,
	)
	if err != nil {
		return 0, fmt.Errorf("create job escrow: %w", err)
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read created job escrow ID: %w", err)
	}
	if lastID < 0 {
		return 0, fmt.Errorf("read created job escrow ID: database returned a negative ID")
	}

	return uint64(lastID), nil
}

// FindByJobID returns the escrow record for a given job.
// Returns a wrapped sql.ErrNoRows when no row exists.
func (r *JobEscrowRepository) FindByJobID(ctx context.Context, jobID uint64) (*models.JobEscrow, error) {
	e := new(models.JobEscrow)
	err := r.db.QueryRowContext(ctx, `
		SELECT
			id,
			job_id,
			chain_id,
			contract_address,
			blockchain_job_id,
			amount,
			funding_transaction_hash,
			status,
			created_at,
			updated_at
		FROM job_escrows
		WHERE job_id = ?`,
		jobID,
	).Scan(
		&e.ID,
		&e.JobID,
		&e.ChainID,
		&e.ContractAddress,
		&e.BlockchainJobID,
		&e.Amount,
		&e.FundingTransactionHash,
		&e.Status,
		&e.CreatedAt,
		&e.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, sql.ErrNoRows
	}
	if err != nil {
		return nil, fmt.Errorf("find job escrow by job ID: %w", err)
	}
	return e, nil
}
