package repositories

import (
	"context"
	"database/sql"
	"fmt"

	"arcmilestone/models"
)

// SubmissionRepository contains persistence operations for work submissions.
// Version 1 allows exactly one submission per job (enforced by the UNIQUE(job_id)
// constraint). File contents are never stored here; only the URL and optional
// onchain hashes are kept.
type SubmissionRepository struct {
	db *sql.DB
}

// CreateSubmissionParams contains the fields required to insert a submission.
// The database generates id, created_at, and updated_at.
type CreateSubmissionParams struct {
	JobID                     uint64
	FreelancerUserID          uint64
	SubmissionURL             string
	Notes                     string
	DeliverableHash           *string // nullable: may arrive after the offchain submission
	SubmissionTransactionHash *string // nullable: may arrive after the offchain submission
}

// UpdateSubmissionParams contains the fields that may be updated after a
// submission is created, typically to record the onchain hashes once confirmed.
type UpdateSubmissionParams struct {
	SubmissionURL             string
	Notes                     string
	DeliverableHash           *string
	SubmissionTransactionHash *string
}

const submissionColumns = `
	id,
	job_id,
	freelancer_user_id,
	submission_url,
	notes,
	deliverable_hash,
	submission_transaction_hash,
	created_at,
	updated_at`

// NewSubmissionRepository constructs a repository using an existing connection pool.
func NewSubmissionRepository(db *sql.DB) *SubmissionRepository {
	return &SubmissionRepository{db: db}
}

// Create inserts a new submission row and returns the database-generated ID.
// The UNIQUE(job_id) constraint prevents a second row for the same job; a
// duplicate insert surfaces as a driver-level error.
func (r *SubmissionRepository) Create(ctx context.Context, params CreateSubmissionParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO submissions (
			job_id,
			freelancer_user_id,
			submission_url,
			notes,
			deliverable_hash,
			submission_transaction_hash
		) VALUES (?, ?, ?, ?, ?, ?)`,
		params.JobID,
		params.FreelancerUserID,
		params.SubmissionURL,
		params.Notes,
		params.DeliverableHash,
		params.SubmissionTransactionHash,
	)
	if err != nil {
		return 0, fmt.Errorf("create submission: %w", err)
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read created submission ID: %w", err)
	}
	if lastID < 0 {
		return 0, fmt.Errorf("read created submission ID: database returned a negative ID")
	}

	return uint64(lastID), nil
}

// FindByID returns a submission by its internal database ID. A missing row is
// returned as a wrapped sql.ErrNoRows.
func (r *SubmissionRepository) FindByID(ctx context.Context, id uint64) (*models.Submission, error) {
	sub, err := scanSubmission(r.db.QueryRowContext(ctx,
		"SELECT "+submissionColumns+" FROM submissions WHERE id = ?",
		id,
	))
	if err != nil {
		return nil, fmt.Errorf("find submission by ID: %w", err)
	}

	return sub, nil
}

// FindByJobID returns the single submission row for a job. Because the schema
// enforces UNIQUE(job_id), at most one row can exist. A missing row is returned
// as a wrapped sql.ErrNoRows.
func (r *SubmissionRepository) FindByJobID(ctx context.Context, jobID uint64) (*models.Submission, error) {
	sub, err := scanSubmission(r.db.QueryRowContext(ctx,
		"SELECT "+submissionColumns+" FROM submissions WHERE job_id = ?",
		jobID,
	))
	if err != nil {
		return nil, fmt.Errorf("find submission by job ID: %w", err)
	}

	return sub, nil
}

// Update overwrites the mutable fields of a submission. This is primarily used
// to record deliverable_hash and submission_transaction_hash once the onchain
// transaction confirms.
func (r *SubmissionRepository) Update(ctx context.Context, submissionID uint64, params UpdateSubmissionParams) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE submissions
		SET submission_url = ?,
		    notes = ?,
		    deliverable_hash = ?,
		    submission_transaction_hash = ?
		WHERE id = ?`,
		params.SubmissionURL,
		params.Notes,
		params.DeliverableHash,
		params.SubmissionTransactionHash,
		submissionID,
	)
	if err != nil {
		return fmt.Errorf("update submission: %w", err)
	}

	return requireOneAffectedRow(ctx, r.db, "submissions", submissionID, result, "update submission")
}

func scanSubmission(row rowScanner) (*models.Submission, error) {
	s := new(models.Submission)
	if err := row.Scan(
		&s.ID,
		&s.JobID,
		&s.FreelancerUserID,
		&s.SubmissionURL,
		&s.Notes,
		&s.DeliverableHash,
		&s.SubmissionTransactionHash,
		&s.CreatedAt,
		&s.UpdatedAt,
	); err != nil {
		return nil, err
	}

	return s, nil
}
