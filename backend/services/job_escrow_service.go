package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

// JobEscrowService handles recording on-chain escrow references in the DB.
type JobEscrowService struct {
	escrows *repositories.JobEscrowRepository
	jobs    *repositories.JobRepository
}

// NewJobEscrowService constructs the service.
func NewJobEscrowService(
	escrows *repositories.JobEscrowRepository,
	jobs *repositories.JobRepository,
) *JobEscrowService {
	return &JobEscrowService{escrows: escrows, jobs: jobs}
}

// RecordEscrowParams contains the fields the frontend sends after a funding
// transaction is confirmed on-chain.
type RecordEscrowParams struct {
	BlockchainJobID        string
	FundingTransactionHash string
}

// RecordEscrow saves the on-chain escrow reference for a job.
// Only the job creator may call this, and only once (the UNIQUE constraint
// on job_id prevents duplicates). Returns the created escrow record.
func (s *JobEscrowService) RecordEscrow(
	ctx context.Context,
	jobID uint64,
	callerUserID uint64,
	params RecordEscrowParams,
) (*models.JobEscrow, error) {
	// Validate inputs.
	if strings.TrimSpace(params.BlockchainJobID) == "" {
		return nil, apperr.NewValidation(map[string]string{
			"blockchain_job_id": "required",
		})
	}
	if strings.TrimSpace(params.FundingTransactionHash) == "" {
		return nil, apperr.NewValidation(map[string]string{
			"funding_transaction_hash": "required",
		})
	}

	// Load job to verify ownership.
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

	// Check no escrow already recorded (idempotency guard before DB hit).
	existing, err := s.escrows.FindByJobID(ctx, jobID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check existing escrow: %w", err)
	}
	if existing != nil {
		// Already recorded — return it so the frontend can proceed.
		return existing, nil
	}

	_, err = s.escrows.Create(ctx, repositories.CreateJobEscrowParams{
		JobID:                  jobID,
		ChainID:                5042002, // Arc Testnet chain ID
		ContractAddress:        os.Getenv("ARC_CONTRACT_ADDRESS"), // Fixed: Read from env
		BlockchainJobID:        strings.TrimSpace(params.BlockchainJobID),
		Amount:                 job.Budget,
		FundingTransactionHash: strings.TrimSpace(params.FundingTransactionHash),
	})
	if err != nil {
		return nil, fmt.Errorf("record escrow: %w", err)
	}

	_, _ = s.jobs.DB().ExecContext(ctx, `
		INSERT IGNORE INTO escrow_events (
			job_id, event_type, amount, transaction_hash, log_index, block_number
		) VALUES (?, 'funded', ?, ?, 0, 0)`,
		jobID, job.Budget, strings.TrimSpace(params.FundingTransactionHash),
	)

	return s.escrows.FindByJobID(ctx, jobID)
}

// GetEscrow returns the escrow record for a job, or nil if none exists yet.
func (s *JobEscrowService) GetEscrow(ctx context.Context, jobID uint64) (*models.JobEscrow, error) {
	e, err := s.escrows.FindByJobID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (s *JobEscrowService) SyncEscrow(ctx context.Context, jobID uint64, callerUserID uint64, txHash string) error {
	if strings.TrimSpace(txHash) == "" {
		return apperr.NewValidation(map[string]string{"tx_hash": "required"})
	}

	escrow, err := s.escrows.FindByJobID(ctx, jobID)
	if errors.Is(err, sql.ErrNoRows) {
		return apperr.ErrNotFound
	}
	if err != nil {
		return err
	}

	job, err := s.jobs.FindByID(ctx, jobID)
	if err != nil {
		return err
	}

	// Only job creator or assigned freelancer can sync
	if job.CreatorUserID != callerUserID {
		if job.SelectedFreelancerID == nil || *job.SelectedFreelancerID != callerUserID {
			return apperr.ErrForbidden
		}
	}

	rpcURL := os.Getenv("ARC_RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://rpc.testnet.arc.network"
	}

	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		// Fallback to https://rpc.testnet.arc.network if configured RPC failed
		client, err = ethclient.Dial("https://rpc.testnet.arc.network")
		if err != nil {
			return fmt.Errorf("dial ethclient: %w", err)
		}
	}

	expectedChainIDStr := os.Getenv("ARC_CHAIN_ID")
	if expectedChainIDStr == "" {
		expectedChainIDStr = "5042002" // default to Arc Testnet
	}
	expectedChainID, _ := strconv.ParseUint(expectedChainIDStr, 10, 64)

	chainID, err := client.ChainID(ctx)
	if err != nil {
		return fmt.Errorf("get chain ID: %w", err)
	}
	if chainID.Uint64() != expectedChainID {
		return fmt.Errorf("chain ID mismatch: expected %d, got %d", expectedChainID, chainID.Uint64())
	}

	// Retry fetching receipt up to 3 times to account for RPC node propagation delay
	var receipt *types.Receipt
	for attempt := 0; attempt < 3; attempt++ {
		receipt, err = client.TransactionReceipt(ctx, common.HexToHash(txHash))
		if err == nil && receipt != nil {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(800 * time.Millisecond):
		}
	}
	if err != nil || receipt == nil {
		return fmt.Errorf("transaction receipt not yet available on RPC: %w", err)
	}

	if receipt.Status != types.ReceiptStatusSuccessful {
		return fmt.Errorf("transaction failed on-chain")
	}

	tx, _, err := client.TransactionByHash(ctx, common.HexToHash(txHash))
	if err != nil {
		return fmt.Errorf("get transaction: %w", err)
	}

	envContract := common.HexToAddress(os.Getenv("ARC_CONTRACT_ADDRESS"))
	var escrowContract common.Address
	if strings.TrimSpace(escrow.ContractAddress) != "" {
		escrowContract = common.HexToAddress(escrow.ContractAddress)
	}

	if tx.To() == nil {
		return fmt.Errorf("transaction has no recipient")
	}

	// Match against configured contract address or the job's recorded contract address
	isContractMatch := (os.Getenv("ARC_CONTRACT_ADDRESS") != "" && *tx.To() == envContract) ||
		(escrow.ContractAddress != "" && *tx.To() == escrowContract)

	if !isContractMatch {
		return fmt.Errorf("transaction not sent to arc contract (tx.To=%s, env=%s, escrow=%s)", tx.To().Hex(), os.Getenv("ARC_CONTRACT_ADDRESS"), escrow.ContractAddress)
	}

	topicAssigned := crypto.Keccak256Hash([]byte("FreelancerAssigned(uint256,address,address)"))
	topicSubmitted := crypto.Keccak256Hash([]byte("WorkSubmitted(uint256,address,bytes32)"))
	topicRevision := crypto.Keccak256Hash([]byte("RevisionRequested(uint256,address,uint256)"))
	topicReleased := crypto.Keccak256Hash([]byte("PaymentReleased(uint256,address,uint256)"))
	topicRefunded := crypto.Keccak256Hash([]byte("JobRefunded(uint256,address,uint256)"))

	// Determine expected state transition based on the log
	var nextEscrowStatus string
	var nextJobStatus models.JobStatus
	var foundTopic bool
	var matchedLogIndex uint

	cleanEscrowJobID := strings.TrimSpace(escrow.BlockchainJobID)
	escrowBigInt, _ := new(big.Int).SetString(cleanEscrowJobID, 10)

	for _, vLog := range receipt.Logs {
		if len(vLog.Topics) < 2 {
			continue
		}

		logBigInt := new(big.Int).SetBytes(vLog.Topics[1][:])
		logJobID := logBigInt.String()

		matchedID := (logJobID == cleanEscrowJobID) || (escrowBigInt != nil && logBigInt.Cmp(escrowBigInt) == 0)
		if !matchedID {
			continue
		}

		switch vLog.Topics[0] {
		case topicAssigned:
			nextEscrowStatus = "funded"
			nextJobStatus = models.JobStatusInProgress
			foundTopic = true
			matchedLogIndex = vLog.Index
		case topicSubmitted:
			nextEscrowStatus = "work_submitted"
			foundTopic = true
			matchedLogIndex = vLog.Index
		case topicRevision:
			nextEscrowStatus = "funded"
			foundTopic = true
			matchedLogIndex = vLog.Index
		case topicReleased:
			nextEscrowStatus = "completed"
			nextJobStatus = models.JobStatusCompleted
			foundTopic = true
			matchedLogIndex = vLog.Index
		case topicRefunded:
			nextEscrowStatus = "refunded"
			nextJobStatus = models.JobStatusCancelled
			foundTopic = true
			matchedLogIndex = vLog.Index
		}
	}

	if !foundTopic {
		return nil // No relevant topics found
	}

	return s.applyEscrowEvent(ctx, expectedChainID, escrow.JobID, txHash, matchedLogIndex, nextEscrowStatus, nextJobStatus)
}

func (s *JobEscrowService) applyEscrowEvent(ctx context.Context, expectedChainID uint64, jobID uint64, txHash string, logIndex uint, nextEscrowStatus string, nextJobStatus models.JobStatus) error {
	// Make database updates atomic and validate state transitions
	txDb, err := s.jobs.DB().BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer txDb.Rollback() // Rollback if not committed

	// Re-fetch current state within the transaction to prevent concurrent overrides
	var currentJobStatus string
	err = txDb.QueryRowContext(ctx, "SELECT status FROM jobs WHERE id = ? FOR UPDATE", jobID).Scan(&currentJobStatus)
	if err != nil {
		return fmt.Errorf("fetch job for update: %w", err)
	}

	var currentEscrowStatus string
	err = txDb.QueryRowContext(ctx, "SELECT status FROM job_escrows WHERE job_id = ? FOR UPDATE", jobID).Scan(&currentEscrowStatus)
	if err != nil {
		return fmt.Errorf("fetch escrow for update: %w", err)
	}

	// Ensure event replay protection
	result, err := txDb.ExecContext(ctx, "INSERT IGNORE INTO processed_events (chain_id, transaction_hash, log_index) VALUES (?, ?, ?)", expectedChainID, txHash, logIndex)
	if err != nil {
		return fmt.Errorf("record processed event: %w", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return nil // Event already processed, safe idempotency
	}

	// Validate transitions
	if currentEscrowStatus == nextEscrowStatus {
		return nil // Idempotent success (though replay protection should catch this first, it's good defense in depth)
	}

	if currentEscrowStatus == "completed" || currentEscrowStatus == "refunded" {
		return fmt.Errorf("invalid state transition: cannot move from terminal state %s to %s", currentEscrowStatus, nextEscrowStatus)
	}

	// Helper to define chronological state order
	stateRank := map[string]int{
		"awaiting_freelancer": 1,
		"funded":              2,
		"work_submitted":      3,
		"completed":           4,
		"refunded":            4,
	}

	currentRank := stateRank[currentEscrowStatus]
	nextRank := stateRank[nextEscrowStatus]

	if nextRank <= currentRank {
		return fmt.Errorf("invalid state transition: cannot move from %s to %s", currentEscrowStatus, nextEscrowStatus)
	}

	// Execute updates
	_, err = txDb.ExecContext(ctx, "UPDATE job_escrows SET status = ?, updated_at = NOW() WHERE job_id = ?", nextEscrowStatus, jobID)
	if err != nil {
		return fmt.Errorf("update job escrow: %w", err)
	}

	if nextJobStatus != "" {
		_, err = txDb.ExecContext(ctx, "UPDATE jobs SET status = ? WHERE id = ?", nextJobStatus, jobID)
		if err != nil {
			return fmt.Errorf("update job: %w", err)
		}
	}

	_, _ = txDb.ExecContext(ctx, `
		INSERT IGNORE INTO escrow_events (
			job_id, event_type, amount, transaction_hash, log_index, block_number
		) VALUES (?, ?, (SELECT budget FROM jobs WHERE id = ?), ?, ?, 0)`,
		jobID, nextEscrowStatus, jobID, txHash, logIndex,
	)

	if err := txDb.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}
