package models

import (
	"encoding/json"
	"time"
)

// BlockchainEvent corresponds to an indexed, idempotent copy of a public Arc
// contract log. BlockNumber and BlockchainJobID remain strings because each can
// represent a Solidity uint256 value that would overflow a MySQL BIGINT.
type BlockchainEvent struct {
	ID              uint64          `json:"id"`
	ChainID         uint64          `json:"chain_id"`
	ContractAddress string          `json:"contract_address"`
	EventName       string          `json:"event_name"`
	BlockNumber     string          `json:"block_number"`
	TransactionHash string          `json:"transaction_hash"`
	LogIndex        uint64          `json:"log_index"`
	BlockHash       string          `json:"block_hash"`
	BlockTimestamp  *time.Time      `json:"block_timestamp"`
	BlockchainJobID *string         `json:"blockchain_job_id"`
	RelatedJobID    *uint64         `json:"related_job_id"`
	EventPayload    json.RawMessage `json:"event_payload"`
	ProcessedAt     *time.Time      `json:"processed_at"`
	CreatedAt       time.Time       `json:"created_at"`
}
