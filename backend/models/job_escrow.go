package models

import "time"

// JobEscrow mirrors one row in the job_escrows table.
// It is an offchain index of the on-chain escrow — the blockchain
// remains authoritative for the actual funds.
type JobEscrow struct {
	ID                     uint64    `json:"id"`
	JobID                  uint64    `json:"job_id"`
	ChainID                uint64    `json:"chain_id"`
	ContractAddress        string    `json:"contract_address"`
	BlockchainJobID        string    `json:"blockchain_job_id"`
	Amount                 string    `json:"amount"`
	FundingTransactionHash string    `json:"funding_transaction_hash"`
	Status                 string    `json:"status"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}
