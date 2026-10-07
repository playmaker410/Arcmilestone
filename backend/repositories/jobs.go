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

// UpdateDetailsParams contains the job fields that can be edited
// after the job has been created.
//
// Budget, status, creator_user_id, and selected_freelancer_id are
// intentionally not included because they cannot be changed here.
type UpdateDetailsParams struct {
	Title               string
	Description         string
	RequiredSkills      []byte
	ApplicationDeadline *time.Time
	DeliveryDeadline    time.Time
}

// UpdateDetails updates the editable details of an existing job.
//
// Business rules such as:
//   - only the creator can edit
//   - job must be OPEN or REVIEWING_APPLICATIONS
//   - deadlines must be valid
//
// are handled by the service layer.
//
// This repository method only performs the database update.
func (r *JobRepository) UpdateDetails(
	ctx context.Context,
	jobID uint64,
	params UpdateDetailsParams,
) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET
			title = ?,
			description = ?,
			required_skills = ?,
			application_deadline = ?,
			delivery_deadline = ?
		WHERE id = ?
	`,
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

	return requireOneAffectedRow(
		ctx,
		r.db,
		"jobs",
		jobID,
		result,
		"update job details",
	)
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
		WHERE status IN ('OPEN', 'REVIEWING_APPLICATIONS')
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
// Enriched queries — return JobDetail with wallet addresses and escrow state
// ---------------------------------------------------------------------------

// detailColumns is the SELECT list for enriched queries. It selects all job
// columns plus creator wallet, optional freelancer wallet, and escrow fields.
const detailColumns = `
	j.id,
	j.creator_user_id,
	j.title,
	j.description,
	j.required_skills,
	j.budget,
	j.application_deadline,
	j.delivery_deadline,
	j.status,
	j.selected_freelancer_id,
	j.created_at,
	j.updated_at,
	creator.wallet_address        AS creator_wallet,
	freelancer.wallet_address     AS selected_freelancer_wallet,
	je.status                     AS escrow_status,
	je.blockchain_job_id,
	je.funding_transaction_hash`

const detailFrom = `
	FROM jobs j
	JOIN  users creator    ON creator.id    = j.creator_user_id
	LEFT JOIN users freelancer ON freelancer.id = j.selected_freelancer_id
	LEFT JOIN job_escrows je   ON je.job_id     = j.id`

// FindDetailByID returns an enriched job by its database ID.
func (r *JobRepository) FindDetailByID(ctx context.Context, id uint64) (*models.JobDetail, error) {
	row := r.db.QueryRowContext(ctx,
		"SELECT"+detailColumns+detailFrom+" WHERE j.id = ?", id)
	detail, err := scanJobDetail(row)
	if err != nil {
		return nil, fmt.Errorf("find job detail by ID: %w", err)
	}
	return detail, nil
}

// ListOpenDetail returns enriched open jobs ordered newest first.
func (r *JobRepository) ListOpenDetail(ctx context.Context) ([]*models.JobDetail, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT"+detailColumns+detailFrom+`
		WHERE j.status IN ('OPEN', 'REVIEWING_APPLICATIONS')
		ORDER BY j.created_at DESC, j.id DESC`)
	if err != nil {
		return nil, fmt.Errorf("list open job details: %w", err)
	}
	defer rows.Close()
	return collectJobDetails(rows)
}

// ListByCreatorDetail returns enriched jobs for a creator ordered newest first.
func (r *JobRepository) ListByCreatorDetail(ctx context.Context, creatorUserID uint64) ([]*models.JobDetail, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT"+detailColumns+detailFrom+`
		WHERE j.creator_user_id = ?
		ORDER BY j.created_at DESC, j.id DESC`,
		creatorUserID)
	if err != nil {
		return nil, fmt.Errorf("list job details by creator: %w", err)
	}
	defer rows.Close()
	return collectJobDetails(rows)
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

// scanJobDetail reads an enriched row into a JobDetail.
// Column order must match detailColumns exactly.
func scanJobDetail(row rowScanner) (*models.JobDetail, error) {
	d := new(models.JobDetail)
	if err := row.Scan(
		&d.ID,
		&d.CreatorUserID,
		&d.Title,
		&d.Description,
		&d.RequiredSkills,
		&d.Budget,
		&d.ApplicationDeadline,
		&d.DeliveryDeadline,
		&d.Status,
		&d.SelectedFreelancerID,
		&d.CreatedAt,
		&d.UpdatedAt,
		&d.CreatorWallet,
		&d.SelectedFreelancerWallet,
		&d.EscrowStatus,
		&d.BlockchainJobID,
		&d.FundingTransactionHash,
	); err != nil {
		return nil, err
	}
	return d, nil
}

// collectJobDetails iterates sql.Rows and scans each into a JobDetail.
func collectJobDetails(rows *sql.Rows) ([]*models.JobDetail, error) {
	details := make([]*models.JobDetail, 0)
	for rows.Next() {
		d, err := scanJobDetail(rows)
		if err != nil {
			return nil, fmt.Errorf("scan job detail row: %w", err)
		}
		details = append(details, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate job detail rows: %w", err)
	}
	return details, nil
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
