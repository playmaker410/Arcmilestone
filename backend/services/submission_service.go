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
type SubmissionService struct {
	submissions *repositories.SubmissionRepository
	jobs        *repositories.JobRepository
	notif       *repositories.NotificationRepository
	messages    *repositories.MessageRepository
}

func NewSubmissionService(
	subs *repositories.SubmissionRepository,
	jobs *repositories.JobRepository,
	notif *repositories.NotificationRepository,
	messages *repositories.MessageRepository,
) *SubmissionService {
	return &SubmissionService{
		submissions: subs,
		jobs:        jobs,
		notif:       notif,
		messages:    messages,
	}
}

type CreateSubmissionParams struct {
	RepositoryURL string
	DemoURL       string
	SubmissionURL string
	Notes         string
}

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

	if job.SelectedFreelancerID == nil || *job.SelectedFreelancerID != callerUserID {
		return nil, fmt.Errorf("%w: only the selected freelancer may submit work", apperr.ErrForbidden)
	}

	if job.Status != models.JobStatusInProgress {
		return nil, fmt.Errorf("%w: job must be in progress before work can be submitted", apperr.ErrInvalidState)
	}

	repoURL := strings.TrimSpace(params.RepositoryURL)
	demoURL := strings.TrimSpace(params.DemoURL)
	subURL := strings.TrimSpace(params.SubmissionURL)
	if subURL == "" {
		if repoURL != "" {
			subURL = repoURL
		} else {
			subURL = demoURL
		}
	}

	var repoPtr *string
	if repoURL != "" {
		repoPtr = &repoURL
	}
	var demoPtr *string
	if demoURL != "" {
		demoPtr = &demoURL
	}
	notes := strings.TrimSpace(params.Notes)

	existing, err := s.submissions.FindByJobID(ctx, jobID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check existing submission: %w", err)
	}

	if existing != nil {
		// If resubmitting after a revision request
		if err := s.submissions.Resubmit(ctx, jobID, repoPtr, demoPtr, subURL, notes); err != nil {
			return nil, fmt.Errorf("resubmit work: %w", err)
		}

		if s.messages != nil {
			msgBody := fmt.Sprintf("Freelancer submitted updated deliverables (Revision #%d).\nNotes: %s", existing.RevisionCount+1, notes)
			if repoURL != "" {
				msgBody += "\nRepository: " + repoURL
			}
			if demoURL != "" {
				msgBody += "\nLive Demo: " + demoURL
			}
			_, _ = s.messages.Create(ctx, repositories.CreateMessageParams{
				JobID:        jobID,
				SenderUserID: &callerUserID,
				SenderRole:   "freelancer",
				MessageType:  "submission",
				Body:         msgBody,
			})
		}

		_, _ = s.notif.Create(ctx, repositories.CreateNotificationParams{
			UserID:           job.CreatorUserID,
			NotificationType: "work_submitted",
			Title:            "Updated work submitted",
			Message:          fmt.Sprintf("The freelancer has resubmitted revised work for: %s", job.Title),
			RelatedJobID:     &jobID,
		})

		return s.submissions.FindByJobID(ctx, jobID)
	}

	subID, err := s.submissions.Create(ctx, repositories.CreateSubmissionParams{
		JobID:            jobID,
		FreelancerUserID: callerUserID,
		RepositoryURL:    repoPtr,
		DemoURL:          demoPtr,
		SubmissionURL:    subURL,
		Notes:            notes,
	})
	if err != nil {
		return nil, fmt.Errorf("create submission: %w", err)
	}

	if s.messages != nil {
		msgBody := fmt.Sprintf("Freelancer submitted work deliverables.\nNotes: %s", notes)
		if repoURL != "" {
			msgBody += "\nRepository: " + repoURL
		}
		if demoURL != "" {
			msgBody += "\nLive Demo: " + demoURL
		}
		_, _ = s.messages.Create(ctx, repositories.CreateMessageParams{
			JobID:        jobID,
			SenderUserID: &callerUserID,
			SenderRole:   "freelancer",
			MessageType:  "submission",
			Body:         msgBody,
		})
	}

	_, _ = s.notif.Create(ctx, repositories.CreateNotificationParams{
		UserID:           job.CreatorUserID,
		NotificationType: "work_submitted",
		Title:            "Work has been submitted",
		Message:          fmt.Sprintf("The freelancer has submitted work for your job: %s", job.Title),
		RelatedJobID:     &jobID,
	})

	return s.submissions.FindByID(ctx, subID)
}

func (s *SubmissionService) RequestChanges(ctx context.Context, jobID, callerUserID uint64, feedback string) error {
	trimmedFeedback := strings.TrimSpace(feedback)
	if len(trimmedFeedback) < 15 {
		return apperr.NewValidation(map[string]string{
			"feedback": "please provide at least 15 characters describing what needs to be revised",
		})
	}

	job, err := s.jobs.FindByID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return apperr.ErrNotFound
	}
	if err != nil {
		return err
	}

	if job.CreatorUserID != callerUserID {
		return fmt.Errorf("%w: only the job creator may request changes", apperr.ErrForbidden)
	}

	sub, err := s.submissions.FindByJobID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return apperr.ErrNotFound
	}
	if err != nil {
		return err
	}

	if err := s.submissions.RequestChanges(ctx, jobID, trimmedFeedback); err != nil {
		return fmt.Errorf("request changes in DB: %w", err)
	}

	if s.messages != nil {
		_, _ = s.messages.Create(ctx, repositories.CreateMessageParams{
			JobID:        jobID,
			SenderUserID: &callerUserID,
			SenderRole:   "client",
			MessageType:  "revision_request",
			Body:         fmt.Sprintf("Client requested changes:\n\n%s", trimmedFeedback),
		})
	}

	if job.SelectedFreelancerID != nil {
		_, _ = s.notif.Create(ctx, repositories.CreateNotificationParams{
			UserID:           *job.SelectedFreelancerID,
			NotificationType: "revision_requested",
			Title:            "Revision requested",
			Message:          fmt.Sprintf("The client requested changes on job %s: %s", job.Title, trimmedFeedback),
			RelatedJobID:     &jobID,
		})
	}

	_ = sub
	return nil
}

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
	repo := strings.TrimSpace(p.RepositoryURL)
	demo := strings.TrimSpace(p.DemoURL)
	sub := strings.TrimSpace(p.SubmissionURL)

	if repo == "" && demo == "" && sub == "" {
		fields["repository_url"] = "provide a repository URL or demo URL"
	}
	if repo != "" {
		if u, err := url.ParseRequestURI(repo); err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			fields["repository_url"] = "must be a valid http or https URL"
		}
	}
	if demo != "" {
		if u, err := url.ParseRequestURI(demo); err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			fields["demo_url"] = "must be a valid http or https URL"
		}
	}
	if sub != "" {
		if u, err := url.ParseRequestURI(sub); err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			fields["submission_url"] = "must be a valid http or https URL"
		}
	}
	if len(strings.TrimSpace(p.Notes)) < 10 {
		fields["notes"] = "delivery notes must be at least 10 characters"
	}
	if len(fields) > 0 {
		return apperr.NewValidation(fields)
	}
	return nil
}
