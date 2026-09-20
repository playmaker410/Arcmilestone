package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

// ApplicationService enforces application business rules on top of the
// repository layer. No proposed amount is involved — the job's funded escrow
// amount is the final payment.
type ApplicationService struct {
	applications *repositories.ApplicationRepository
	jobs         *repositories.JobRepository
	users        *repositories.UserRepository
	notif        *repositories.NotificationRepository
}

// NewApplicationService constructs the service.
func NewApplicationService(
	apps *repositories.ApplicationRepository,
	jobs *repositories.JobRepository,
	users *repositories.UserRepository,
	notif *repositories.NotificationRepository,
) *ApplicationService {
	return &ApplicationService{applications: apps, jobs: jobs, users: users, notif: notif}
}

// CreateApplicationParams holds the fields a freelancer submits.
type CreateApplicationParams struct {
	CoverLetter   string
	EstimatedDays uint32
	PortfolioURL  *string
}

// Apply submits an application from applicantUserID to jobID.
// Business rules enforced:
//   - job must be open for applications
//   - application deadline must not have passed
//   - job creator cannot apply to their own job
//   - same user cannot apply twice (also backed by DB UNIQUE constraint)
func (s *ApplicationService) Apply(ctx context.Context, jobID, applicantUserID uint64, params CreateApplicationParams) (*models.Application, error) {
	if err := validateApplication(params); err != nil {
		return nil, err
	}

	job, err := s.jobs.FindByID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	// Only open or reviewing-applications jobs accept new applications.
	if job.MarketplaceStatus != models.MarketplaceStatusOpen &&
		job.MarketplaceStatus != models.MarketplaceStatusReviewingApplications {
		return nil, fmt.Errorf("%w: this job is not accepting applications", apperr.ErrInvalidState)
	}

	// Application deadline must not have passed.
	if job.ApplicationDeadline != nil && time.Now().UTC().After(*job.ApplicationDeadline) {
		return nil, apperr.ErrDeadlinePassed
	}

	// Creator cannot apply to their own job.
	if job.CreatorUserID == applicantUserID {
		return nil, fmt.Errorf("%w: job creator cannot apply to their own job", apperr.ErrForbidden)
	}

	// Duplicate-application check before the DB UNIQUE constraint fires.
	_, err = s.applications.FindByJobAndApplicant(ctx, jobID, applicantUserID)
	if err == nil {
		return nil, fmt.Errorf("%w: you have already applied to this job", apperr.ErrConflict)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	appID, err := s.applications.Create(ctx, repositories.CreateApplicationParams{
		JobID:           jobID,
		ApplicantUserID: applicantUserID,
		CoverLetter:     strings.TrimSpace(params.CoverLetter),
		EstimatedDays:   params.EstimatedDays,
		PortfolioURL:    params.PortfolioURL,
	})
	if err != nil {
		return nil, fmt.Errorf("create application: %w", err)
	}

	// Move job to reviewing_applications when the first application arrives.
	if job.MarketplaceStatus == models.MarketplaceStatusOpen {
		_ = s.jobs.UpdateMarketplaceStatus(ctx, jobID, models.MarketplaceStatusReviewingApplications)
	}

	// Notify the job creator.
	_, _ = s.notif.Create(ctx, repositories.CreateNotificationParams{
		UserID:           job.CreatorUserID,
		NotificationType: "new_application",
		Title:            "New application received",
		Message:          fmt.Sprintf("A new application has been submitted for your job: %s", job.Title),
		RelatedJobID:     &jobID,
	})

	return s.applications.FindByID(ctx, appID)
}

// ListByJob returns all applications for a job. Only the creator may list them.
func (s *ApplicationService) ListByJob(ctx context.Context, jobID, callerUserID uint64) ([]*models.Application, error) {
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
	return s.applications.ListByJob(ctx, jobID)
}

// ListMine returns all applications submitted by the calling user.
func (s *ApplicationService) ListMine(ctx context.Context, userID uint64) ([]*models.Application, error) {
	return s.applications.ListByApplicant(ctx, userID)
}

// Accept selects the applicant as the freelancer for the job.
// Only the job creator may accept. Only pending applications may be accepted.
func (s *ApplicationService) Accept(ctx context.Context, applicationID, callerUserID uint64) (*models.Application, error) {
	app, err := s.applications.FindByID(ctx, applicationID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	job, err := s.jobs.FindByID(ctx, app.JobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}
	if app.Status != models.ApplicationStatusPending {
		return nil, fmt.Errorf("%w: only pending applications may be accepted", apperr.ErrInvalidState)
	}

	// Accept this application.
	if err := s.applications.UpdateStatus(ctx, applicationID, models.ApplicationStatusAccepted); err != nil {
		return nil, err
	}

	// Reject all other pending applications for the same job.
	all, listErr := s.applications.ListByJob(ctx, app.JobID)
	if listErr == nil {
		for _, other := range all {
			if other.ID != applicationID && other.Status == models.ApplicationStatusPending {
				_ = s.applications.UpdateStatus(ctx, other.ID, models.ApplicationStatusRejected)
			}
		}
	}

	// Record the selected freelancer on the job using a lookup for wallet address.
	// We need the applicant's wallet — look up the user record.
	// The wallet is stored on the user row; we use FindByID via the users repo.
	// For now, SelectFreelancer requires the wallet string — pass empty and let
	// the service layer caller supply it, OR we require users repo here.
	// To keep this service focused we store freelancer_user_id and leave wallet
	// update to a user-lookup helper. We inject what we need.
	freelancer, userErr := s.users.FindByID(ctx, app.ApplicantUserID)
	if userErr != nil {
		return nil, userErr
	}
	if err := s.jobs.SelectFreelancer(ctx, app.JobID, app.ApplicantUserID, freelancer.WalletAddress); err != nil {
		return nil, err
	}

	// Move job to awaiting_funding.
	_ = s.jobs.UpdateMarketplaceStatus(ctx, app.JobID, models.MarketplaceStatusAwaitingFunding)

	// Notify the selected freelancer.
	jobID := app.JobID
	_, _ = s.notif.Create(ctx, repositories.CreateNotificationParams{
		UserID:           app.ApplicantUserID,
		NotificationType: "application_accepted",
		Title:            "Your application was accepted",
		Message:          fmt.Sprintf("Your application for '%s' has been accepted. The client will fund the escrow shortly.", job.Title),
		RelatedJobID:     &jobID,
	})

	return s.applications.FindByID(ctx, applicationID)
}

// Reject rejects a pending application. Only the job creator may reject it.
func (s *ApplicationService) Reject(ctx context.Context, applicationID, callerUserID uint64) (*models.Application, error) {
	app, err := s.applications.FindByID(ctx, applicationID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	job, err := s.jobs.FindByID(ctx, app.JobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if job.CreatorUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}
	if app.Status != models.ApplicationStatusPending {
		return nil, fmt.Errorf("%w: only pending applications may be rejected", apperr.ErrInvalidState)
	}
	if err := s.applications.UpdateStatus(ctx, applicationID, models.ApplicationStatusRejected); err != nil {
		return nil, err
	}
	return s.applications.FindByID(ctx, applicationID)
}

// Withdraw withdraws a pending application. Only the applicant may withdraw.
func (s *ApplicationService) Withdraw(ctx context.Context, applicationID, callerUserID uint64) (*models.Application, error) {
	app, err := s.applications.FindByID(ctx, applicationID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if app.ApplicantUserID != callerUserID {
		return nil, apperr.ErrForbidden
	}
	if app.Status != models.ApplicationStatusPending {
		return nil, fmt.Errorf("%w: only pending applications may be withdrawn", apperr.ErrInvalidState)
	}
	if err := s.applications.UpdateStatus(ctx, applicationID, models.ApplicationStatusWithdrawn); err != nil {
		return nil, err
	}
	return s.applications.FindByID(ctx, applicationID)
}

func validateApplication(p CreateApplicationParams) error {
	fields := map[string]string{}
	if strings.TrimSpace(p.CoverLetter) == "" {
		fields["cover_letter"] = "required"
	}
	if p.EstimatedDays < 1 {
		fields["estimated_days"] = "must be at least 1"
	}
	if len(fields) > 0 {
		return apperr.NewValidation(fields)
	}
	return nil
}
