package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

// JobService handles marketplace job business logic.
// Escrow and payment state remain authoritative on the Arc blockchain and are
// managed through the separate job_escrows table and blockchain event indexer.
type JobService struct {
	jobs  *repositories.JobRepository
	users *repositories.UserRepository
	notif *repositories.NotificationRepository
}

// NewJobService constructs the service.
func NewJobService(
	jobs *repositories.JobRepository,
	users *repositories.UserRepository,
	notif *repositories.NotificationRepository,
) *JobService {
	return &JobService{jobs: jobs, users: users, notif: notif}
}

// CreateJobParams holds the fields submitted by the authenticated user when
// creating a new job. Fields that are determined server-side (creator_user_id,
// selected_freelancer_id, status, id, created_at, updated_at) are never
// accepted from the caller.
type CreateJobParams struct {
	Title               string
	Description         string
	RequiredSkills      []string  // will be marshalled to JSON for storage
	Budget              string    // exact decimal string, e.g. "150.00"
	ApplicationDeadline *time.Time
	DeliveryDeadline    time.Time
}

// Create validates the input, sets the initial job status to OPEN, and
// inserts the job into the database. selected_freelancer_id is always NULL
// on creation. Returns the newly created job.
func (s *JobService) Create(ctx context.Context, creatorUserID uint64, params CreateJobParams) (*models.Job, error) {
	if err := validateCreateJob(params); err != nil {
		return nil, err
	}

	skills, err := json.Marshal(params.RequiredSkills)
	if err != nil {
		return nil, fmt.Errorf("marshal required_skills: %w", err)
	}

	jobID, err := s.jobs.Create(ctx, repositories.CreateJobParams{
		CreatorUserID:       creatorUserID,
		Title:               strings.TrimSpace(params.Title),
		Description:         strings.TrimSpace(params.Description),
		RequiredSkills:      skills,
		Budget:              params.Budget,
		ApplicationDeadline: params.ApplicationDeadline,
		DeliveryDeadline:    params.DeliveryDeadline,
		Status:              models.JobStatusOpen,
	})
	if err != nil {
		return nil, fmt.Errorf("create job: %w", err)
	}

	return s.jobs.FindByID(ctx, jobID)
}

// GetByID returns a single job. Returns apperr.ErrNotFound if absent.
func (s *JobService) GetByID(ctx context.Context, id uint64) (*models.Job, error) {
	job, err := s.jobs.FindByID(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return job, nil
}

// ListOpen returns all jobs with status OPEN.
func (s *JobService) ListOpen(ctx context.Context) ([]*models.Job, error) {
	return s.jobs.ListOpen(ctx)
}

// ListByCreator returns all jobs posted by the given user.
func (s *JobService) ListByCreator(ctx context.Context, userID uint64) ([]*models.Job, error) {
	return s.jobs.ListByCreator(ctx, userID)
}

// Publish transitions a job from OPEN to REVIEWING_APPLICATIONS.
// This is a no-op stub because jobs start as OPEN — if the frontend calls
// publish after create it is still correct to return the job unchanged when
// it is already in a post-creation state.
//
// Current lifecycle: jobs are created directly as OPEN (no draft step).
// If a draft-first flow is introduced later this method will enforce
// the OPEN transition.
func (s *JobService) Publish(ctx context.Context, jobID, callerUserID uint64) (*models.Job, error) {
	job, err := s.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}
	// Jobs start as OPEN; there is no draft step in the current DB schema.
	// Return the job as-is so the frontend's create→publish two-step still works.
	return job, nil
}

// UpdateJobParams holds the fields the creator may change after posting.
// Budget is absent — it is locked at creation and must never change.
type UpdateJobParams struct {
	Title               string
	Description         string
	RequiredSkills      []string
	ApplicationDeadline *time.Time
	DeliveryDeadline    time.Time
}

// Update edits the mutable metadata on a job. Only the creator may do this,
// and only while the job is still OPEN or REVIEWING_APPLICATIONS.
// Budget is unconditionally excluded from updates.
func (s *JobService) Update(ctx context.Context, jobID, callerUserID uint64, params UpdateJobParams) (*models.Job, error) {
	job, err := s.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}

	editable := map[models.JobStatus]bool{
		models.JobStatusOpen:                  true,
		models.JobStatusReviewingApplications: true,
	}
	if !editable[job.Status] {
		return nil, fmt.Errorf("%w: job can only be edited while OPEN or REVIEWING_APPLICATIONS", apperr.ErrInvalidState)
	}

	// Validate the incoming patch fields using the same rules as creation
	// (minus the budget check, which cannot change here).
	fields := map[string]string{}
	now := time.Now().UTC()

	if strings.TrimSpace(params.Title) == "" {
		fields["title"] = "required"
	} else if len([]rune(strings.TrimSpace(params.Title))) > 200 {
		fields["title"] = "must be 200 characters or fewer"
	}
	if strings.TrimSpace(params.Description) == "" {
		fields["description"] = "required"
	}
	if params.DeliveryDeadline.IsZero() {
		fields["delivery_deadline"] = "required"
	} else if !params.DeliveryDeadline.After(now) {
		fields["delivery_deadline"] = "must be a future date"
	}
	if params.ApplicationDeadline == nil {
		fields["application_deadline"] = "required"
	} else if !params.ApplicationDeadline.After(now) {
		fields["application_deadline"] = "must be a future date"
	} else if !params.ApplicationDeadline.Before(params.DeliveryDeadline) {
		fields["application_deadline"] = "must be before the delivery deadline"
	}
	if len(fields) > 0 {
		return nil, apperr.NewValidation(fields)
	}

	skills, err := json.Marshal(params.RequiredSkills)
	if err != nil {
		return nil, fmt.Errorf("marshal required_skills: %w", err)
	}

	if err := s.jobs.UpdateDetails(ctx, jobID, repositories.UpdateDetailsParams{
		Title:               strings.TrimSpace(params.Title),
		Description:         strings.TrimSpace(params.Description),
		RequiredSkills:      skills,
		ApplicationDeadline: params.ApplicationDeadline,
		DeliveryDeadline:    params.DeliveryDeadline,
	}); err != nil {
		return nil, fmt.Errorf("update job: %w", err)
	}

	return s.jobs.FindByID(ctx, jobID)
}

// Cancel transitions a job to CANCELLED. Only the creator may cancel.
// Only OPEN or REVIEWING_APPLICATIONS jobs may be cancelled.
func (s *JobService) Cancel(ctx context.Context, jobID, callerUserID uint64) (*models.Job, error) {
	job, err := s.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}

	cancellable := map[models.JobStatus]bool{
		models.JobStatusOpen:                  true,
		models.JobStatusReviewingApplications: true,
	}
	if !cancellable[job.Status] {
		return nil, fmt.Errorf("%w: job cannot be cancelled in its current state", apperr.ErrInvalidState)
	}

	if err := s.jobs.UpdateStatus(ctx, jobID, models.JobStatusCancelled); err != nil {
		return nil, err
	}
	return s.jobs.FindByID(ctx, jobID)
}

// ===========================================================================
// Validation helpers
// ===========================================================================

// validateCreateJob enforces business rules on the incoming job creation
// parameters. It does not touch the database.
func validateCreateJob(p CreateJobParams) error {
	fields := map[string]string{}

	if strings.TrimSpace(p.Title) == "" {
		fields["title"] = "required"
	} else if len([]rune(strings.TrimSpace(p.Title))) > 200 {
		fields["title"] = "must be 200 characters or fewer"
	}

	if strings.TrimSpace(p.Description) == "" {
		fields["description"] = "required"
	}

	if err := validateBudget(p.Budget); err != nil {
		fields["budget"] = err.Error()
	}

	now := time.Now().UTC()

	if p.DeliveryDeadline.IsZero() {
		fields["delivery_deadline"] = "required"
	} else if !p.DeliveryDeadline.After(now) {
		fields["delivery_deadline"] = "must be a future date"
	}

	// application_deadline is mandatory — once it passes, applications close.
	if p.ApplicationDeadline == nil {
		fields["application_deadline"] = "required"
	} else if !p.ApplicationDeadline.After(now) {
		fields["application_deadline"] = "must be a future date"
	} else if !p.ApplicationDeadline.Before(p.DeliveryDeadline) {
		fields["application_deadline"] = "must be before the delivery deadline"
	}

	if len(fields) > 0 {
		return apperr.NewValidation(fields)
	}
	return nil
}

// validateBudget ensures the budget string is a positive decimal value.
// Budget is stored as DECIMAL(36,18). We parse it with math/big to avoid
// floating-point issues and confirm it is strictly greater than zero.
//
// Frontend wallet-balance validation (via viem) should guard against
// obviously over-budget submissions before the user hits submit, but
// the backend does not have a blockchain client in the current codebase
// so on-chain balance verification is not performed here.
// Delete removes the job entirely if it belongs to the creator.
func (s *JobService) Delete(ctx context.Context, jobID, userID uint64) error {
	job, err := s.jobs.FindByID(ctx, jobID)
	if err != nil {
		return err
	}
	if job.CreatorUserID != userID {
		return apperr.ErrForbidden
	}

	return s.jobs.Delete(ctx, jobID)
}

func validateBudget(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return fmt.Errorf("required")
	}
	// big.Float parses decimal strings without floating-point loss.
	f, _, err := big.ParseFloat(trimmed, 10, 128, big.ToNearestEven)
	if err != nil {
		return fmt.Errorf("must be a valid decimal number")
	}
	if f.Sign() <= 0 {
		return fmt.Errorf("must be greater than 0")
	}
	return nil
}
