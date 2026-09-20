package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

// JobService handles marketplace job business logic.
// Escrow/payment state remains authoritative on the Arc contract.
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

// CreateJobParams holds the request fields for a new job.
type CreateJobParams struct {
	HiringMethod        string
	Title               string
	Description         string
	RequiredSkills      []string
	Budget              string
	ApplicationDeadline *time.Time
	DeliveryDeadline    time.Time
	ReferenceURL        *string
	// For direct-hire: the intended freelancer wallet.
	FreelancerWallet *string
}

func (s *JobService) Create(ctx context.Context, creatorUserID uint64, params CreateJobParams) (*models.Job, error) {
	if err := validateCreateJob(params); err != nil {
		return nil, err
	}

	method := models.HiringMethod(params.HiringMethod)
	status := models.MarketplaceStatusDraft

	skills, err := json.Marshal(params.RequiredSkills)
	if err != nil {
		return nil, fmt.Errorf("marshal required_skills: %w", err)
	}

	jobID, err := s.jobs.Create(ctx, repositories.CreateJobParams{
		CreatorUserID:       creatorUserID,
		HiringMethod:        method,
		Title:               strings.TrimSpace(params.Title),
		Description:         strings.TrimSpace(params.Description),
		RequiredSkills:      skills,
		Budget:              params.Budget,
		ApplicationDeadline: params.ApplicationDeadline,
		DeliveryDeadline:    params.DeliveryDeadline,
		ReferenceURL:        params.ReferenceURL,
		MarketplaceStatus:   status,
	})
	if err != nil {
		return nil, fmt.Errorf("create job: %w", err)
	}

	// For direct-hire, record the freelancer wallet immediately if provided.
	if method == models.HiringMethodDirect && params.FreelancerWallet != nil {
		wallet := strings.ToLower(strings.TrimSpace(*params.FreelancerWallet))
		if !isValidEVMAddress(wallet) {
			return nil, apperr.NewValidation(map[string]string{"freelancer_wallet": "must be a valid EVM address"})
		}
		freelancer, ferr := s.users.FindByWalletAddress(ctx, wallet)
		if errors.Is(ferr, sql.ErrNoRows) {
			return nil, apperr.ErrNotFound
		}
		if ferr != nil {
			return nil, ferr
		}
		if ferr = s.jobs.SelectFreelancer(ctx, jobID, freelancer.ID, wallet); ferr != nil {
			return nil, ferr
		}
	}

	return s.jobs.FindByID(ctx, jobID)
}

// ListOpen returns all jobs currently accepting applications.
func (s *JobService) ListOpen(ctx context.Context) ([]*models.Job, error) {
	return s.jobs.ListOpen(ctx)
}

// ListByCreator returns jobs posted by the given user.
func (s *JobService) ListByCreator(ctx context.Context, userID uint64) ([]*models.Job, error) {
	return s.jobs.ListByCreator(ctx, userID)
}

// GetByID returns a single job. Returns ErrNotFound if absent.
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

// UpdateJobParams holds editable marketplace fields.
type UpdateJobParams struct {
	Title               string
	Description         string
	RequiredSkills      []string
	Budget              string
	ApplicationDeadline *time.Time
	DeliveryDeadline    time.Time
	ReferenceURL        *string
}

// Update edits a job's marketplace fields. Only the creator may update.
func (s *JobService) Update(ctx context.Context, jobID, callerUserID uint64, params UpdateJobParams) (*models.Job, error) {
	job, err := s.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}
	// Only draft and open jobs may be edited.
	if job.MarketplaceStatus != models.MarketplaceStatusDraft &&
		job.MarketplaceStatus != models.MarketplaceStatusOpen {
		return nil, fmt.Errorf("%w: only draft or open jobs may be edited", apperr.ErrInvalidState)
	}

	if err := validateUpdateJob(params); err != nil {
		return nil, err
	}

	skills, err := json.Marshal(params.RequiredSkills)
	if err != nil {
		return nil, fmt.Errorf("marshal required_skills: %w", err)
	}

	err = s.jobs.Update(ctx, jobID, repositories.UpdateJobParams{
		Title:               strings.TrimSpace(params.Title),
		Description:         strings.TrimSpace(params.Description),
		RequiredSkills:      skills,
		Budget:              params.Budget,
		ApplicationDeadline: params.ApplicationDeadline,
		DeliveryDeadline:    params.DeliveryDeadline,
		ReferenceURL:        params.ReferenceURL,
	})
	if err != nil {
		return nil, fmt.Errorf("update job: %w", err)
	}

	return s.jobs.FindByID(ctx, jobID)
}

// Publish transitions a job from draft to open so it accepts applications.
func (s *JobService) Publish(ctx context.Context, jobID, callerUserID uint64) (*models.Job, error) {
	job, err := s.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}
	if job.MarketplaceStatus != models.MarketplaceStatusDraft {
		return nil, fmt.Errorf("%w: only draft jobs may be published", apperr.ErrInvalidState)
	}
	if err := s.jobs.UpdateMarketplaceStatus(ctx, jobID, models.MarketplaceStatusOpen); err != nil {
		return nil, err
	}
	return s.jobs.FindByID(ctx, jobID)
}

// Cancel transitions a job to cancelled. Only the creator may cancel.
func (s *JobService) Cancel(ctx context.Context, jobID, callerUserID uint64) (*models.Job, error) {
	job, err := s.GetByID(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}
	cancellable := map[models.MarketplaceStatus]bool{
		models.MarketplaceStatusDraft:                 true,
		models.MarketplaceStatusOpen:                  true,
		models.MarketplaceStatusReviewingApplications: true,
	}
	if !cancellable[job.MarketplaceStatus] {
		return nil, fmt.Errorf("%w: job cannot be cancelled in its current state", apperr.ErrInvalidState)
	}
	if err := s.jobs.UpdateMarketplaceStatus(ctx, jobID, models.MarketplaceStatusCancelled); err != nil {
		return nil, err
	}
	return s.jobs.FindByID(ctx, jobID)
}

// ===========================================================================
// Validation helpers
// ===========================================================================

func validateCreateJob(p CreateJobParams) error {
	fields := map[string]string{}
	if strings.TrimSpace(p.Title) == "" {
		fields["title"] = "required"
	} else if len(p.Title) > 200 {
		fields["title"] = "must be 200 characters or fewer"
	}
	if strings.TrimSpace(p.Description) == "" {
		fields["description"] = "required"
	}
	if p.HiringMethod != "open" && p.HiringMethod != "direct" {
		fields["hiring_method"] = "must be 'open' or 'direct'"
	}
	if strings.TrimSpace(p.Budget) == "" {
		fields["budget"] = "required"
	}
	if p.DeliveryDeadline.IsZero() || p.DeliveryDeadline.Before(time.Now()) {
		fields["delivery_deadline"] = "must be a future date"
	}
	if p.ApplicationDeadline != nil && !p.ApplicationDeadline.After(time.Now()) {
		fields["application_deadline"] = "must be a future date"
	}
	if p.ApplicationDeadline != nil && !p.ApplicationDeadline.Before(p.DeliveryDeadline) {
		fields["application_deadline"] = "must be before the delivery deadline"
	}
	if len(fields) > 0 {
		return apperr.NewValidation(fields)
	}
	return nil
}

func validateUpdateJob(p UpdateJobParams) error {
	fields := map[string]string{}
	if strings.TrimSpace(p.Title) == "" {
		fields["title"] = "required"
	} else if len(p.Title) > 200 {
		fields["title"] = "must be 200 characters or fewer"
	}
	if strings.TrimSpace(p.Description) == "" {
		fields["description"] = "required"
	}
	if strings.TrimSpace(p.Budget) == "" {
		fields["budget"] = "required"
	}
	if p.DeliveryDeadline.IsZero() {
		fields["delivery_deadline"] = "required"
	}
	if len(fields) > 0 {
		return apperr.NewValidation(fields)
	}
	return nil
}
