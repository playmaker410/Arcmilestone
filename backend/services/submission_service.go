package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

// SubmissionService enforces submission business rules.
// One active submission per job; file contents are never stored in MySQL.
type SubmissionService struct {
	submissions *repositories.SubmissionRepository
	jobs        *repositories.JobRepository
	notif       *repositories.NotificationRepository
}

// NewSubmissionService constructs the service.
func NewSubmissionService(
	subs *repositories.SubmissionRepository,
	jobs *repositories.JobRepository,
	notif *repositories.NotificationRepository,
) *SubmissionService {
	return &SubmissionService{submissions: subs, jobs: jobs, notif: notif}
}

// CreateSubmissionParams holds the fields a freelancer submits.
type CreateSubmissionParams struct {
	SubmissionURL string
	Notes         string
}

// Submit creates the submission row for a job.
// Business rules:
//   - caller must be the selected freelancer
//   - job must be IN_PROGRESS
//   - only one submission per job (also enforced by DB UNIQUE constraint)
func (s *SubmissionService) Submit(ctx context.Context, jobID, callerUserID uint64, params CreateSubmissionParams) (*models.Submission, error) {
	if err := validateSubmission(params); err != nil {
		return nil, err
	}

	job, err := s.jobs.FindByID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	// Only the selected freelancer may submit.
	if job.SelectedFreelancerID == nil || *job.SelectedFreelancerID != callerUserID {
		return nil, fmt.Errorf("%w: only the selected freelancer may submit work", apperr.ErrForbidden)
	}

	// Job must be IN_PROGRESS.
	if job.Status != models.JobStatusInProgress {
		return nil, fmt.Errorf("%w: job must be in progress before work can be submitted", apperr.ErrInvalidState)
	}

	subID, err := s.submissions.Create(ctx, repositories.CreateSubmissionParams{
		JobID:            jobID,
		FreelancerUserID: callerUserID,
		SubmissionURL:    strings.TrimSpace(params.SubmissionURL),
		Notes:            strings.TrimSpace(params.Notes),
	})
	if err != nil {
		return nil, fmt.Errorf("create submission: %w", err)
	}

	// Notify the job creator.
	_, _ = s.notif.Create(ctx, repositories.CreateNotificationParams{
		UserID:           job.CreatorUserID,
		NotificationType: "work_submitted",
		Title:            "Work has been submitted",
		Message:          fmt.Sprintf("The freelancer has submitted work for your job: %s", job.Title),
		RelatedJobID:     &jobID,
	})

	return s.submissions.FindByID(ctx, subID)
}

// GetByJobID returns the submission for a job. Only the creator or selected
// freelancer may view it.
func (s *SubmissionService) GetByJobID(ctx context.Context, jobID, callerUserID uint64) (*models.Submission, error) {
	job, err := s.jobs.FindByID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	isCreator := job.CreatorUserID == callerUserID
	isFreelancer := job.SelectedFreelancerID != nil && *job.SelectedFreelancerID == callerUserID
	if !isCreator && !isFreelancer {
		return nil, apperr.ErrForbidden
	}

	sub, err := s.submissions.FindByJobID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return sub, nil
}

func validateSubmission(p CreateSubmissionParams) error {
	fields := map[string]string{}
	trimURL := strings.TrimSpace(p.SubmissionURL)
	if trimURL == "" {
		fields["submission_url"] = "required"
	} else if u, err := url.ParseRequestURI(trimURL); err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		fields["submission_url"] = "must be a valid http or https URL"
	}
	if strings.TrimSpace(p.Notes) == "" {
		fields["notes"] = "required"
	}
	if len(fields) > 0 {
		return apperr.NewValidation(fields)
	}
	return nil
}
