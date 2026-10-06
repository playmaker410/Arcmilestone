package repositories

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"arcmilestone/models"
)

// JobRepository contains persistence operations for marketplace jobs.
// Escrow and payment state live in the separate job_escrows table and remain
// authoritative on the Arc blockchain; this repository stores only the
// offchain marketplace record.
type JobRepository struct {
	db *sql.DB
}

// NewJobRepository constructs a repository using an existing connection pool.
func NewJobRepository(db *sql.DB) *JobRepository {
	return &JobRepository{db: db}
}

// CreateJobParams contains the fields accepted when a job is first inserted.
// The database generates id, created_at, updated_at, and defaults status to 'OPEN'.
// selected_freelancer_id is always NULL on creation.
type CreateJobParams struct {
	CreatorUserID       uint64
	Title               string
	Description         string
	RequiredSkills      []byte     // raw JSON, e.g. ["React","Go"]
	Budget              string     // exact decimal string, never float
	ApplicationDeadline *time.Time // optional
	DeliveryDeadline    time.Time
	Status              models.JobStatus
}

// jobColumns is the ordered column list used in every SELECT so scanJob
// positions match exactly.
const jobColumns = `
	id,
	creator_user_id,
	title,
	description,
	required_skills,
	budget,
	application_deadline,
	delivery_deadline,
	status,
	selected_freelancer_id,
	created_at,
	updated_at`

// Create inserts a new job row and returns the database-generated ID.
func (r *JobRepository) Create(ctx context.Context, params CreateJobParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO jobs (
			creator_user_id,
			title,
			description,
			required_skills,
			budget,
			application_deadline,
			delivery_deadline,
			status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		params.CreatorUserID,
		params.Title,
		params.Description,
		params.RequiredSkills,
		params.Budget,
		nullableTime(params.ApplicationDeadline),
		params.DeliveryDeadline.UTC(),
		params.Status,
	)
	if err != nil {
		return 0, fmt.Errorf("create job: %w", err)
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read created job ID: %w", err)
	}
	if lastID < 0 {
		return 0, fmt.Errorf("read created job ID: database returned a negative ID")
	}

	return uint64(lastID), nil
}

// FindByID returns a job by its internal database ID.
// A missing row is returned as a wrapped sql.ErrNoRows.
func (r *JobRepository) FindByID(ctx context.Context, id uint64) (*models.Job, error) {
	job, err := scanJob(r.db.QueryRowContext(ctx,
		"SELECT "+jobColumns+" FROM jobs WHERE id = ?",
		id,
	))
	if err != nil {
		return nil, fmt.Errorf("find job by ID: %w", err)
	}
	return job, nil
}

// ListOpen returns jobs with status = 'OPEN', ordered newest first.
func (r *JobRepository) ListOpen(ctx context.Context) ([]*models.Job, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+jobColumns+`
		FROM jobs
		WHERE status = 'OPEN'
		ORDER BY created_at DESC, id DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list open jobs: %w", err)
	}
	defer rows.Close()
	return collectJobs(rows)
}

// ListByCreator returns all jobs created by a given user, newest first.
func (r *JobRepository) ListByCreator(ctx context.Context, creatorUserID uint64) ([]*models.Job, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+jobColumns+`
		FROM jobs
		WHERE creator_user_id = ?
		ORDER BY created_at DESC, id DESC`,
		creatorUserID,
	)
	if err != nil {
		return nil, fmt.Errorf("list jobs by creator: %w", err)
	}
	defer rows.Close()
	return collectJobs(rows)
}

// ListBySelectedFreelancer returns all jobs where the given user has been
// chosen as the selected freelancer, newest first.
func (r *JobRepository) ListBySelectedFreelancer(ctx context.Context, freelancerUserID uint64) ([]*models.Job, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+jobColumns+`
		FROM jobs
		WHERE selected_freelancer_id = ?
		ORDER BY created_at DESC, id DESC`,
		freelancerUserID,
	)
	if err != nil {
		return nil, fmt.Errorf("list jobs by selected freelancer: %w", err)
	}
	defer rows.Close()
	return collectJobs(rows)
}

// UpdateDetailsParams contains the mutable fields a creator may change after
// a job is posted. Budget is intentionally absent — it is locked at creation
// time and must never be altered once workers have seen the listing.
type UpdateDetailsParams struct {
	Title               string
	Description         string
	RequiredSkills      []byte     // raw JSON
	ApplicationDeadline *time.Time // nil clears the deadline (not allowed — always required now)
	DeliveryDeadline    time.Time
}

// UpdateDetails overwrites the editable metadata columns on a job.
// The budget, status, creator_user_id, and selected_freelancer_id columns are
// never touched by this method.
func (r *JobRepository) UpdateDetails(ctx context.Context, jobID uint64, params UpdateDetailsParams) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET
			title               = ?,
			description         = ?,
			required_skills     = ?,
			application_deadline = ?,
			delivery_deadline   = ?
		WHERE id = ?`,
		params.Title,
		params.Description,
		params.RequiredSkills,
		nullableTime(params.ApplicationDeadline),
		params.DeliveryDeadline.UTC(),
		jobID,
	)
	if err != nil {
		return fmt.Errorf("update job details: %w", err)
	}
	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "update job details")
}

// UpdateStatus sets only the status column on a job.
// Business rules about which transitions are allowed belong to the service layer.
func (r *JobRepository) UpdateStatus(ctx context.Context, jobID uint64, status models.JobStatus) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET status = ?
		WHERE id = ?`,
		status,
		jobID,
	)
	if err != nil {
		return fmt.Errorf("update job status: %w", err)
	}
	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "update job status")
}

// SelectFreelancer stores the chosen freelancer's user ID on a job.
// Business rules (only the creator may do this, job must be in the right
// state, etc.) belong to the service layer.
func (r *JobRepository) SelectFreelancer(ctx context.Context, jobID uint64, freelancerUserID uint64) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET selected_freelancer_id = ?
		WHERE id = ?`,
		freelancerUserID,
		jobID,
	)
	if err != nil {
		return fmt.Errorf("select freelancer for job: %w", err)
	}
	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "select freelancer for job")
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// collectJobs iterates sql.Rows and scans each into a Job.
func collectJobs(rows *sql.Rows) ([]*models.Job, error) {
	jobs := make([]*models.Job, 0)
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, fmt.Errorf("scan job row: %w", err)
		}
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate job rows: %w", err)
	}
	return jobs, nil
}

// scanJob reads a row into a Job. Column order must match jobColumns exactly.
func scanJob(row rowScanner) (*models.Job, error) {
	j := new(models.Job)
	if err := row.Scan(
		&j.ID,
		&j.CreatorUserID,
		&j.Title,
		&j.Description,
		&j.RequiredSkills,
		&j.Budget,
		&j.ApplicationDeadline,
		&j.DeliveryDeadline,
		&j.Status,
		&j.SelectedFreelancerID,
		&j.CreatedAt,
		&j.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return j, nil
}

// nullableTime converts a *time.Time to a value suitable for a nullable
// DATETIME column. A nil pointer stores NULL; a non-nil pointer stores UTC.
func nullableTime(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.UTC()
}

// requireOneAffectedRow checks that an UPDATE touched exactly one row.
// Zero affected rows triggers a follow-up SELECT to distinguish "row does
// not exist" from "value was already identical" (MySQL reports 0 in both
// cases when the value is unchanged).
//
// table is the plain table name used in the confirmation SELECT; it must
// not contain any user-controlled input.
func requireOneAffectedRow(ctx context.Context, db *sql.DB, table string, id uint64, result sql.Result, op string) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("%s: check affected rows: %w", op, err)
	}
	if affected > 0 {
		return nil
	}

	var existingID uint64
	err = db.QueryRowContext(ctx,
		"SELECT id FROM "+table+" WHERE id = ?", id,
	).Scan(&existingID)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("%s: %w", op, sql.ErrNoRows)
	}
	if err != nil {
		return fmt.Errorf("%s: confirm existence: %w", op, err)
	}

	// Row exists; value was already identical — treat as success.
	return nil
}

// Delete completely removes a job from the database.
func (r *JobRepository) Delete(ctx context.Context, id uint64) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM jobs WHERE id = ?", id)
	return err
}
