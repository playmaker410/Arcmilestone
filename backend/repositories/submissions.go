package repositories

import (
	"context"
	"database/sql"
	"fmt"

	"arcmilestone/models"
)

// SubmissionRepository contains persistence operations for work submissions.
type SubmissionRepository struct {
	db *sql.DB
}

type CreateSubmissionParams struct {
	JobID                     uint64
	FreelancerUserID          uint64
	RepositoryURL             *string
	DemoURL                   *string
	SubmissionURL             string
	Notes                     string
	DeliverableHash           *string
	SubmissionTransactionHash *string
}

type UpdateSubmissionParams struct {
	RepositoryURL             *string
	DemoURL                   *string
	SubmissionURL             string
	Notes                     string
	DeliverableHash           *string
	SubmissionTransactionHash *string
}

const submissionColumns = `
	id,
	job_id,
	freelancer_user_id,
	repository_url,
	demo_url,
	submission_url,
	notes,
	status,
	revision_count,
	review_feedback,
	reviewed_at,
	deliverable_hash,
	submission_transaction_hash,
	created_at,
	updated_at`

func NewSubmissionRepository(db *sql.DB) *SubmissionRepository {
	return &SubmissionRepository{db: db}
}

func (r *SubmissionRepository) Create(ctx context.Context, params CreateSubmissionParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO submissions (
			job_id,
			freelancer_user_id,
			repository_url,
			demo_url,
			submission_url,
			notes,
			status,
			revision_count,
			deliverable_hash,
			submission_transaction_hash
		) VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', 0, ?, ?)`,
		params.JobID,
		params.FreelancerUserID,
		params.RepositoryURL,
		params.DemoURL,
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
	return uint64(lastID), nil
}

func (r *SubmissionRepository) Resubmit(ctx context.Context, jobID uint64, repoURL, demoURL *string, subURL, notes string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE submissions
		SET repository_url = ?,
		    demo_url = ?,
		    submission_url = ?,
		    notes = ?,
		    status = 'SUBMITTED',
		    revision_count = revision_count + 1,
		    deliverable_hash = NULL,
		    submission_transaction_hash = NULL,
		    updated_at = NOW(6)
		WHERE job_id = ?`,
		repoURL, demoURL, subURL, notes, jobID,
	)
	if err != nil {
		return fmt.Errorf("resubmit work: %w", err)
	}
	return requireOneAffectedRow(ctx, r.db, "submissions", jobID, result, "resubmit work")
}

func (r *SubmissionRepository) RequestChanges(ctx context.Context, jobID uint64, feedback string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE submissions
		SET status = 'CHANGES_REQUESTED',
		    review_feedback = ?,
		    reviewed_at = NOW(6),
		    updated_at = NOW(6)
		WHERE job_id = ?`,
		feedback, jobID,
	)
	if err != nil {
		return fmt.Errorf("request changes on submission: %w", err)
	}
	return requireOneAffectedRow(ctx, r.db, "submissions", jobID, result, "request changes")
}

func (r *SubmissionRepository) Approve(ctx context.Context, jobID uint64) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE submissions
		SET status = 'APPROVED',
		    reviewed_at = NOW(6),
		    updated_at = NOW(6)
		WHERE job_id = ?`,
		jobID,
	)
	return err
}

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

func (r *SubmissionRepository) Update(ctx context.Context, submissionID uint64, params UpdateSubmissionParams) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE submissions
		SET repository_url = ?,
		    demo_url = ?,
		    submission_url = ?,
		    notes = ?,
		    deliverable_hash = ?,
		    submission_transaction_hash = ?
		WHERE id = ?`,
		params.RepositoryURL,
		params.DemoURL,
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
		&s.RepositoryURL,
		&s.DemoURL,
		&s.SubmissionURL,
		&s.Notes,
		&s.Status,
		&s.RevisionCount,
		&s.ReviewFeedback,
		&s.ReviewedAt,
		&s.DeliverableHash,
		&s.SubmissionTransactionHash,
		&s.CreatedAt,
		&s.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return s, nil
}
