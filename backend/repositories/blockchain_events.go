package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"arcmilestone/models"
)

// BlockchainEventRepository contains persistence operations for indexed Arc
// contract logs. This table is an idempotent copy of public blockchain activity.
// The Arc contract remains the authority for escrow and payment state.
// No blockchain calls are made here.
type BlockchainEventRepository struct {
	db *sql.DB
}

// CreateBlockchainEventParams contains all fields required to insert an event
// row. BlockNumber and BlockchainJobID are strings to preserve lossless
// representation of Solidity uint256 values that exceed MySQL BIGINT range.
// The database generates id and created_at.
type CreateBlockchainEventParams struct {
	ChainID         uint64
	ContractAddress string
	EventName       string
	BlockNumber     string // lossless base-10 string
	TransactionHash string
	LogIndex        uint64
	BlockHash       string
	BlockTimestamp  *time.Time // nullable: may not be available immediately
	BlockchainJobID *string    // nullable: lossless base-10 string
	RelatedJobID    *uint64    // nullable: links to the offchain jobs row
	EventPayload    []byte     // raw JSON
}

const blockchainEventColumns = `
	id,
	chain_id,
	contract_address,
	event_name,
	block_number,
	transaction_hash,
	log_index,
	block_hash,
	block_timestamp,
	blockchain_job_id,
	related_job_id,
	event_payload,
	processed_at,
	created_at`

// NewBlockchainEventRepository constructs a repository using an existing connection pool.
func NewBlockchainEventRepository(db *sql.DB) *BlockchainEventRepository {
	return &BlockchainEventRepository{db: db}
}

// Create inserts a new blockchain event row and returns the database-generated ID.
// The UNIQUE(chain_id, transaction_hash, log_index) constraint prevents the same
// log from being inserted twice; a duplicate insert surfaces as a driver error
// that the caller should treat as an idempotent no-op.
func (r *BlockchainEventRepository) Create(ctx context.Context, params CreateBlockchainEventParams) (uint64, error) {
	result, err := r.db.ExecContext(ctx, `
		INSERT INTO blockchain_events (
			chain_id,
			contract_address,
			event_name,
			block_number,
			transaction_hash,
			log_index,
			block_hash,
			block_timestamp,
			blockchain_job_id,
			related_job_id,
			event_payload
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		params.ChainID,
		params.ContractAddress,
		params.EventName,
		params.BlockNumber,
		params.TransactionHash,
		params.LogIndex,
		params.BlockHash,
		params.BlockTimestamp,
		params.BlockchainJobID,
		params.RelatedJobID,
		params.EventPayload,
	)
	if err != nil {
		return 0, fmt.Errorf("create blockchain event: %w", err)
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("read created blockchain event ID: %w", err)
	}
	if lastID < 0 {
		return 0, fmt.Errorf("read created blockchain event ID: database returned a negative ID")
	}

	return uint64(lastID), nil
}

// FindByLog returns the event identified by the unique (chain_id, transaction_hash,
// log_index) triple. This corresponds to the UNIQUE constraint
// uq_blockchain_events_chain_transaction_log and is the primary idempotency check.
// A missing row returns a wrapped sql.ErrNoRows.
func (r *BlockchainEventRepository) FindByLog(ctx context.Context, chainID uint64, transactionHash string, logIndex uint64) (*models.BlockchainEvent, error) {
	event, err := scanBlockchainEvent(r.db.QueryRowContext(ctx,
		"SELECT "+blockchainEventColumns+`
		FROM blockchain_events
		WHERE chain_id = ?
		  AND transaction_hash = ?
		  AND log_index = ?`,
		chainID,
		transactionHash,
		logIndex,
	))
	if err != nil {
		return nil, fmt.Errorf("find blockchain event by log: %w", err)
	}

	return event, nil
}

// FindByBlockchainJobID returns all events associated with a given onchain job
// ID across any contract address, ordered by block number ascending then log
// index ascending. BlockchainJobID is compared as a string to preserve the
// full lossless uint256 value.
func (r *BlockchainEventRepository) FindByBlockchainJobID(ctx context.Context, chainID uint64, blockchainJobID string) ([]*models.BlockchainEvent, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+blockchainEventColumns+`
		FROM blockchain_events
		WHERE chain_id = ?
		  AND blockchain_job_id = ?
		ORDER BY block_number ASC, log_index ASC`,
		chainID,
		blockchainJobID,
	)
	if err != nil {
		return nil, fmt.Errorf("find blockchain events by job ID: %w", err)
	}
	defer rows.Close()

	return collectBlockchainEvents(rows)
}

// ListByContract returns all events emitted by a given contract address on a
// given chain, ordered by block number ascending then log index ascending.
func (r *BlockchainEventRepository) ListByContract(ctx context.Context, chainID uint64, contractAddress string) ([]*models.BlockchainEvent, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+blockchainEventColumns+`
		FROM blockchain_events
		WHERE chain_id = ?
		  AND contract_address = ?
		ORDER BY block_number ASC, log_index ASC`,
		chainID,
		contractAddress,
	)
	if err != nil {
		return nil, fmt.Errorf("list blockchain events by contract: %w", err)
	}
	defer rows.Close()

	return collectBlockchainEvents(rows)
}

// blockNumberWidth is the fixed width used when left-padding block number
// strings for lexicographic comparison. VARCHAR(78) matches the maximum decimal
// digit count of a Solidity uint256, so padding to 78 characters guarantees
// that lexicographic order equals numeric order without any integer cast.
const blockNumberWidth = 78

// ListAfterBlock returns all events on a given chain with a block_number
// strictly greater than afterBlock. Comparison and ordering are performed by
// left-padding both sides with '0' to blockNumberWidth characters so that
// lexicographic order equals numeric order. This avoids CAST(… AS UNSIGNED),
// which silently truncates values larger than MySQL BIGINT UNSIGNED (~1.8e19)
// and cannot represent the full Solidity uint256 range.
//
// Both afterBlock and stored block_number values must be canonical base-10
// decimal strings without leading zeros for the padding to produce correct
// results. Results are ordered by block number ascending then log index ascending.
func (r *BlockchainEventRepository) ListAfterBlock(ctx context.Context, chainID uint64, afterBlock string) ([]*models.BlockchainEvent, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+blockchainEventColumns+`
		FROM blockchain_events
		WHERE chain_id = ?
		  AND LPAD(block_number, ?, '0') > LPAD(?, ?, '0')
		ORDER BY LPAD(block_number, ?, '0') ASC, log_index ASC`,
		chainID,
		blockNumberWidth, afterBlock, blockNumberWidth,
		blockNumberWidth,
	)
	if err != nil {
		return nil, fmt.Errorf("list blockchain events after block: %w", err)
	}
	defer rows.Close()

	return collectBlockchainEvents(rows)
}

// MarkProcessed sets processed_at to the given time on a single event. This
// signals that downstream handling (e.g. updating the jobs table) has
// completed. The update is idempotent: if processed_at is already set, the
// call succeeds without overwriting the original timestamp.
func (r *BlockchainEventRepository) MarkProcessed(ctx context.Context, id uint64, processedAt time.Time) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE blockchain_events
		SET processed_at = ?
		WHERE id = ?
		  AND processed_at IS NULL`,
		processedAt.UTC(),
		id,
	)
	if err != nil {
		return fmt.Errorf("mark blockchain event processed: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("mark blockchain event processed: check affected rows: %w", err)
	}
	if affected > 0 {
		return nil
	}

	// Distinguish "row does not exist" from "already processed".
	var existingID uint64
	err = r.db.QueryRowContext(ctx,
		"SELECT id FROM blockchain_events WHERE id = ?", id,
	).Scan(&existingID)
	if err != nil {
		return fmt.Errorf("mark blockchain event processed: %w", sql.ErrNoRows)
	}

	// Row exists but was already processed — not an error.
	return nil
}

func collectBlockchainEvents(rows *sql.Rows) ([]*models.BlockchainEvent, error) {
	events := make([]*models.BlockchainEvent, 0)
	for rows.Next() {
		event, err := scanBlockchainEvent(rows)
		if err != nil {
			return nil, fmt.Errorf("scan blockchain event row: %w", err)
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate blockchain event rows: %w", err)
	}

	return events, nil
}

func scanBlockchainEvent(row rowScanner) (*models.BlockchainEvent, error) {
	e := new(models.BlockchainEvent)
	if err := row.Scan(
		&e.ID,
		&e.ChainID,
		&e.ContractAddress,
		&e.EventName,
		&e.BlockNumber,
		&e.TransactionHash,
		&e.LogIndex,
		&e.BlockHash,
		&e.BlockTimestamp,
		&e.BlockchainJobID,
		&e.RelatedJobID,
		&e.EventPayload,
		&e.ProcessedAt,
		&e.CreatedAt,
	); err != nil {
		return nil, err
	}

	return e, nil
}
