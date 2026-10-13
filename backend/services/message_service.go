package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

type MessageService struct {
	messages *repositories.MessageRepository
	jobs     *repositories.JobRepository
	notif    *repositories.NotificationRepository
}

func NewMessageService(
	messages *repositories.MessageRepository,
	jobs *repositories.JobRepository,
	notif *repositories.NotificationRepository,
) *MessageService {
	return &MessageService{
		messages: messages,
		jobs:     jobs,
		notif:    notif,
	}
}

func (s *MessageService) ListByJob(ctx context.Context, jobID, callerUserID, afterID uint64) ([]*models.JobMessage, error) {
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

	return s.messages.ListByJob(ctx, jobID, afterID)
}

func (s *MessageService) PostMessage(ctx context.Context, jobID, callerUserID uint64, body string) (*models.JobMessage, error) {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return nil, apperr.NewValidation(map[string]string{"body": "message cannot be empty"})
	}
	if len(trimmed) > 4000 {
		return nil, apperr.NewValidation(map[string]string{"body": "message too long (max 4000 characters)"})
	}

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

	role := "client"
	var recipientID uint64
	if isFreelancer {
		role = "freelancer"
		recipientID = job.CreatorUserID
	} else if job.SelectedFreelancerID != nil {
		recipientID = *job.SelectedFreelancerID
	}

	msg, err := s.messages.Create(ctx, repositories.CreateMessageParams{
		JobID:        jobID,
		SenderUserID: &callerUserID,
		SenderRole:   role,
		MessageType:  "message",
		Body:         trimmed,
	})
	if err != nil {
		return nil, err
	}

	if recipientID > 0 && s.notif != nil {
		senderDesc := "Client"
		if isFreelancer {
			senderDesc = "Freelancer"
		}
		_, _ = s.notif.Create(ctx, repositories.CreateNotificationParams{
			UserID:           recipientID,
			NotificationType: "job_message",
			Title:            fmt.Sprintf("New message on %s", job.Title),
			Message:          fmt.Sprintf("%s: %s", senderDesc, trimmed),
			RelatedJobID:     &jobID,
		})
	}

	return msg, nil
}
