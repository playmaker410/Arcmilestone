package repositories

import (
	"context"
	"database/sql"
	"fmt"

	"arcmilestone/models"
)

type EscrowEventRepository struct {
	db *sql.DB
}

func NewEscrowEventRepository(db *sql.DB) *EscrowEventRepository {
	return &EscrowEventRepository{db: db}
}

type RecordEscrowEventParams struct {
	JobID           uint64
	EventType       string
	Amount          *string
	TransactionHash string
	LogIndex        uint
	BlockNumber     uint64
}

func (r *EscrowEventRepository) Record(ctx context.Context, p RecordEscrowEventParams) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT IGNORE INTO escrow_events (
			job_id,
			event_type,
			amount,
			transaction_hash,
			log_index,
			block_number
		) VALUES (?, ?, ?, ?, ?, ?)`,
		p.JobID,
		p.EventType,
		p.Amount,
		p.TransactionHash,
		p.LogIndex,
		p.BlockNumber,
	)
	if err != nil {
		return fmt.Errorf("record escrow event: %w", err)
	}
	return nil
}

func (r *EscrowEventRepository) ListByUser(ctx context.Context, userID uint64, page, limit int) ([]*models.EscrowEvent, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 10
	}
	offset := (page - 1) * limit

	var total int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM escrow_events e
		JOIN jobs j ON j.id = e.job_id
		WHERE j.creator_user_id = ? OR j.selected_freelancer_id = ?`,
		userID, userID,
	).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count user escrow events: %w", err)
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT
			e.id,
			e.job_id,
			j.title,
			e.event_type,
			e.amount,
			e.transaction_hash,
			e.block_number,
			CASE WHEN j.creator_user_id = ? THEN 'client' ELSE 'freelancer' END AS role,
			e.created_at
		FROM escrow_events e
		JOIN jobs j ON j.id = e.job_id
		WHERE j.creator_user_id = ? OR j.selected_freelancer_id = ?
		ORDER BY e.created_at DESC, e.id DESC
		LIMIT ? OFFSET ?`,
		userID, userID, userID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list user escrow events: %w", err)
	}
	defer rows.Close()

	var events []*models.EscrowEvent
	for rows.Next() {
		ev := new(models.EscrowEvent)
		if err := rows.Scan(
			&ev.ID,
			&ev.JobID,
			&ev.JobTitle,
			&ev.EventType,
			&ev.Amount,
			&ev.TransactionHash,
			&ev.BlockNumber,
			&ev.Role,
			&ev.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		events = append(events, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if events == nil {
		events = []*models.EscrowEvent{}
	}

	return events, total, nil
}
