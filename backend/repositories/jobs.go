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
// Escrow and payment state remain authoritative on the Arc blockchain; this
// repository stores only the offchain marketplace record and indexed copies of
// onchain identifiers.
type JobRepository struct {
	db *sql.DB
}

// CreateJobParams contains the fields accepted when a job is first inserted.
// The database generates id, created_at, and updated_at.
type CreateJobParams struct {
	CreatorUserID       uint64
	HiringMethod        models.HiringMethod
	Title               string
	Description         string
	RequiredSkills      []byte // raw JSON array
	Budget              string // exact decimal string, never float
	ApplicationDeadline *time.Time
	DeliveryDeadline    time.Time
	ReferenceURL        *string
	MarketplaceStatus   models.MarketplaceStatus
}

// UpdateJobParams contains the marketplace fields that may be edited before a
// job is linked to a blockchain identity. Immutable IDs are intentionally absent.
type UpdateJobParams struct {
	Title               string
	Description         string
	RequiredSkills      []byte
	Budget              string
	ApplicationDeadline *time.Time
	DeliveryDeadline    time.Time
	ReferenceURL        *string
}

// LinkBlockchainJobParams captures the three values that must be set together
// when the offchain job row is associated with an onchain escrow.
type LinkBlockchainJobParams struct {
	BlockchainJobID        string
	ContractAddress        string
	ChainID                uint64
	FundingTransactionHash *string
	MetadataHash           *string
}

const jobColumns = `
	id,
	creator_user_id,
	hiring_method,
	title,
	description,
	required_skills,
	budget,
	application_deadline,
	delivery_deadline,
	reference_url,
	marketplace_status,
	selected_freelancer_user_id,
	selected_freelancer_wallet,
	blockchain_job_id,
	contract_address,
	funding_transaction_hash,
	metadata_hash,
	escrow_status,
	chain_id,
	created_at,
	updated_at`

// NewJobRepository constructs a repository using an existing connection pool.
func NewJobRepository(db *sql.DB) *JobRepository {
	return &JobRepository{db: db}
}

// Create inserts a new job row and returns the database-generated ID.
func (r *JobRepository) Create(ctx context.Context, params CreateJobParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO jobs (
			creator_user_id,
			hiring_method,
			title,
			description,
			required_skills,
			budget,
			application_deadline,
			delivery_deadline,
			reference_url,
			marketplace_status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		params.CreatorUserID,
		params.HiringMethod,
		params.Title,
		params.Description,
		params.RequiredSkills,
		params.Budget,
		nullableTime(params.ApplicationDeadline),
		params.DeliveryDeadline.UTC(),
		params.ReferenceURL,
		params.MarketplaceStatus,
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

// FindByID returns a job by its internal database ID. A missing job is
// returned as a wrapped sql.ErrNoRows.
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

// ListOpen returns jobs that are currently accepting applications, ordered
// newest first. "Open" means marketplace_status = 'open'. The caller may use
// the returned slice for display or pagination at a higher layer.
func (r *JobRepository) ListOpen(ctx context.Context) ([]*models.Job, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+jobColumns+`
		FROM jobs
		WHERE marketplace_status = 'open'
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

// ListBySelectedFreelancer returns all jobs assigned to a given freelancer,
// newest first.
func (r *JobRepository) ListBySelectedFreelancer(ctx context.Context, freelancerUserID uint64) ([]*models.Job, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+jobColumns+`
		FROM jobs
		WHERE selected_freelancer_user_id = ?
		ORDER BY created_at DESC, id DESC`,
		freelancerUserID,
	)
	if err != nil {
		return nil, fmt.Errorf("list jobs by selected freelancer: %w", err)
	}
	defer rows.Close()

	return collectJobs(rows)
}

// Update overwrites the editable marketplace fields of a job. It does not
// touch creator_user_id, hiring_method, blockchain fields, or status fields.
func (r *JobRepository) Update(ctx context.Context, jobID uint64, params UpdateJobParams) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET title = ?,
		    description = ?,
		    required_skills = ?,
		    budget = ?,
		    application_deadline = ?,
		    delivery_deadline = ?,
		    reference_url = ?
		WHERE id = ?`,
		params.Title,
		params.Description,
		params.RequiredSkills,
		params.Budget,
		nullableTime(params.ApplicationDeadline),
		params.DeliveryDeadline.UTC(),
		params.ReferenceURL,
		jobID,
	)
	if err != nil {
		return fmt.Errorf("update job: %w", err)
	}

	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "update job")
}

// SelectFreelancer stores the chosen freelancer's user ID and wallet address on
// a job. Business rules (e.g. only the creator may do this) belong to the service layer.
func (r *JobRepository) SelectFreelancer(ctx context.Context, jobID uint64, freelancerUserID uint64, freelancerWallet string) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET selected_freelancer_user_id = ?,
		    selected_freelancer_wallet = ?
		WHERE id = ?`,
		freelancerUserID,
		normalizeWalletAddress(freelancerWallet),
		jobID,
	)
	if err != nil {
		return fmt.Errorf("select freelancer for job: %w", err)
	}

	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "select freelancer for job")
}

// UpdateMarketplaceStatus sets only the marketplace_status column.
func (r *JobRepository) UpdateMarketplaceStatus(ctx context.Context, jobID uint64, status models.MarketplaceStatus) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET marketplace_status = ?
		WHERE id = ?`,
		status,
		jobID,
	)
	if err != nil {
		return fmt.Errorf("update job marketplace status: %w", err)
	}

	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "update job marketplace status")
}

// UpdateEscrowStatus sets only the escrow_status column. This is an indexed copy
// of the onchain state; the Arc contract remains authoritative.
func (r *JobRepository) UpdateEscrowStatus(ctx context.Context, jobID uint64, status models.EscrowStatus) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET escrow_status = ?
		WHERE id = ?`,
		status,
		jobID,
	)
	if err != nil {
		return fmt.Errorf("update job escrow status: %w", err)
	}

	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "update job escrow status")
}

// LinkBlockchainJob stores the blockchain_job_id, contract_address, chain_id,
// and optionally the funding transaction hash and metadata hash on a job row.
// These three blockchain identity values must be set atomically per the schema
// CHECK constraint chk_jobs_blockchain_identity_complete.
func (r *JobRepository) LinkBlockchainJob(ctx context.Context, jobID uint64, params LinkBlockchainJobParams) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE jobs
		SET blockchain_job_id = ?,
		    contract_address = ?,
		    chain_id = ?,
		    funding_transaction_hash = ?,
		    metadata_hash = ?
		WHERE id = ?`,
		params.BlockchainJobID,
		params.ContractAddress,
		params.ChainID,
		params.FundingTransactionHash,
		params.MetadataHash,
		jobID,
	)
	if err != nil {
		return fmt.Errorf("link blockchain job: %w", err)
	}

	return requireOneAffectedRow(ctx, r.db, "jobs", jobID, result, "link blockchain job")
}

// collectJobs iterates sql.Rows and scans each row into a Job. It always closes
// the rows and checks for iteration errors.
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

func scanJob(row rowScanner) (*models.Job, error) {
	j := new(models.Job)
	var escrowStatus sql.NullString
	if err := row.Scan(
		&j.ID,
		&j.CreatorUserID,
		&j.HiringMethod,
		&j.Title,
		&j.Description,
		&j.RequiredSkills,
		&j.Budget,
		&j.ApplicationDeadline,
		&j.DeliveryDeadline,
		&j.ReferenceURL,
		&j.MarketplaceStatus,
		&j.SelectedFreelancerUserID,
		&j.SelectedFreelancerWallet,
		&j.BlockchainJobID,
		&j.ContractAddress,
		&j.FundingTransactionHash,
		&j.MetadataHash,
		&escrowStatus,
		&j.ChainID,
		&j.CreatedAt,
		&j.UpdatedAt,
	); err != nil {
		return nil, err
	}

	if escrowStatus.Valid {
		es := models.EscrowStatus(escrowStatus.String)
		j.EscrowStatus = &es
	}

	return j, nil
}

// nullableTime converts a *time.Time to a value suitable for a nullable column.
// A nil pointer stores NULL; a non-nil pointer stores the UTC time.
func nullableTime(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return t.UTC()
}

// requireOneAffectedRow checks whether an UPDATE touched exactly one row. When
// zero rows were affected it distinguishes "row does not exist" from "value was
// already identical" with a follow-up SELECT.
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

	// Row exists; values were already identical — treat as success.
	return nil
}
