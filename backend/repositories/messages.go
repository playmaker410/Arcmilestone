package repositories

import (
	"context"
	"database/sql"
	"fmt"

	"arcmilestone/models"
)

type MessageRepository struct {
	db *sql.DB
}

func NewMessageRepository(db *sql.DB) *MessageRepository {
	return &MessageRepository{db: db}
}

type CreateMessageParams struct {
	JobID        uint64
	SenderUserID *uint64
	SenderRole   string
	MessageType  string
	Body         string
}

func (r *MessageRepository) Create(ctx context.Context, params CreateMessageParams) (*models.JobMessage, error) {
	msgType := params.MessageType
	if msgType == "" {
		msgType = "message"
	}
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO job_messages (
			job_id,
			sender_user_id,
			sender_role,
			message_type,
			body
		) VALUES (?, ?, ?, ?, ?)`,
		params.JobID,
		params.SenderUserID,
		params.SenderRole,
		msgType,
		params.Body,
	)
	if err != nil {
		return nil, fmt.Errorf("create job message: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("read created message ID: %w", err)
	}

	return r.FindByID(ctx, uint64(id))
}

func (r *MessageRepository) FindByID(ctx context.Context, id uint64) (*models.JobMessage, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT
			m.id,
			m.job_id,
			m.sender_user_id,
			m.sender_role,
			m.message_type,
			m.body,
			u.username,
			u.wallet_address,
			m.created_at
		FROM job_messages m
		LEFT JOIN users u ON u.id = m.sender_user_id
		WHERE m.id = ?`,
		id,
	)
	return scanJobMessage(row)
}

func (r *MessageRepository) ListByJob(ctx context.Context, jobID, afterID uint64) ([]*models.JobMessage, error) {
	var rows *sql.Rows
	var err error

	if afterID > 0 {
		rows, err = r.db.QueryContext(ctx, `
			SELECT
				m.id,
				m.job_id,
				m.sender_user_id,
				m.sender_role,
				m.message_type,
				m.body,
				u.username,
				u.wallet_address,
				m.created_at
			FROM job_messages m
			LEFT JOIN users u ON u.id = m.sender_user_id
			WHERE m.job_id = ? AND m.id > ?
			ORDER BY m.id ASC`,
			jobID, afterID,
		)
	} else {
		rows, err = r.db.QueryContext(ctx, `
			SELECT
				m.id,
				m.job_id,
				m.sender_user_id,
				m.sender_role,
				m.message_type,
				m.body,
				u.username,
				u.wallet_address,
				m.created_at
			FROM job_messages m
			LEFT JOIN users u ON u.id = m.sender_user_id
			WHERE m.job_id = ?
			ORDER BY m.id ASC`,
			jobID,
		)
	}

	if err != nil {
		return nil, fmt.Errorf("list job messages: %w", err)
	}
	defer rows.Close()

	var msgs []*models.JobMessage
	for rows.Next() {
		m, err := scanJobMessage(rows)
		if err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate job messages: %w", err)
	}
	if msgs == nil {
		msgs = []*models.JobMessage{}
	}
	return msgs, nil
}

func scanJobMessage(row rowScanner) (*models.JobMessage, error) {
	m := new(models.JobMessage)
	if err := row.Scan(
		&m.ID,
		&m.JobID,
		&m.SenderUserID,
		&m.SenderRole,
		&m.MessageType,
		&m.Body,
		&m.SenderUsername,
		&m.SenderWallet,
		&m.CreatedAt,
	); err != nil {
		return nil, err
	}
	return m, nil
}
