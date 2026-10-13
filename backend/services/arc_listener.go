package services

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"arcmilestone/models"
	"arcmilestone/repositories"
)

type ArcListener struct {
	client     *ethclient.Client
	contract   common.Address
	chainID    uint64
	escrowRepo *repositories.JobEscrowRepository
	jobRepo    *repositories.JobRepository
	eventRepo  *repositories.EscrowEventRepository
}

func NewArcListener(
	rpcURL, contractAddr string,
	escrowRepo *repositories.JobEscrowRepository,
	jobRepo *repositories.JobRepository,
	eventRepo *repositories.EscrowEventRepository,
) (*ArcListener, error) {
	if rpcURL == "" || contractAddr == "" {
		return nil, nil // Disabled if not configured
	}

	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		client, err = ethclient.Dial("https://rpc.testnet.arc.network")
		if err != nil {
			return nil, fmt.Errorf("dial ethclient: %w", err)
		}
	}

	chainID, err := client.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("get chain id: %w", err)
	}

	return &ArcListener{
		client:     client,
		contract:   common.HexToAddress(contractAddr),
		chainID:    chainID.Uint64(),
		escrowRepo: escrowRepo,
		jobRepo:    jobRepo,
		eventRepo:  eventRepo,
	}, nil
}

func (l *ArcListener) Start(ctx context.Context) {
	if l == nil {
		return
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	var lastBlock uint64
	header, err := l.client.HeaderByNumber(ctx, nil)
	if err == nil {
		lastBlock = header.Number.Uint64()
		if lastBlock > 1000 {
			lastBlock -= 1000
		} else {
			lastBlock = 0
		}
	} else {
		log.Printf("arc_listener: initial header fetch failed: %v", err)
	}

	topicJobCreated := crypto.Keccak256Hash([]byte("JobCreatedAndFundedOpen(uint256,address,uint256,uint256,bytes32)"))
	topicAssigned := crypto.Keccak256Hash([]byte("FreelancerAssigned(uint256,address,address)"))
	topicSubmitted := crypto.Keccak256Hash([]byte("WorkSubmitted(uint256,address,bytes32)"))
	topicReleased := crypto.Keccak256Hash([]byte("PaymentReleased(uint256,address,uint256)"))
	topicRefunded := crypto.Keccak256Hash([]byte("JobRefunded(uint256,address,uint256)"))
	topicRevision := crypto.Keccak256Hash([]byte("RevisionRequested(uint256,address,uint256)"))

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			header, err := l.client.HeaderByNumber(ctx, nil)
			if err != nil {
				log.Printf("arc_listener: fetch header: %v", err)
				continue
			}

			latestBlock := header.Number.Uint64()
			if latestBlock <= lastBlock {
				continue
			}

			fromBlock := lastBlock + 1
			toBlock := latestBlock
			if toBlock-fromBlock > 100 {
				toBlock = fromBlock + 100
			}

			query := ethereum.FilterQuery{
				FromBlock: new(big.Int).SetUint64(fromBlock),
				ToBlock:   new(big.Int).SetUint64(toBlock),
				Addresses: []common.Address{l.contract},
				Topics: [][]common.Hash{{
					topicJobCreated,
					topicAssigned,
					topicSubmitted,
					topicReleased,
					topicRefunded,
					topicRevision,
				}},
			}

			logs, err := l.client.FilterLogs(ctx, query)
			if err != nil {
				log.Printf("arc_listener: filter logs: %v", err)
				continue
			}

			for _, vLog := range logs {
				if len(vLog.Topics) == 0 {
					continue
				}
				switch vLog.Topics[0] {
				case topicJobCreated:
					l.processJobCreatedLog(ctx, vLog)
				case topicAssigned:
					l.processFreelancerAssignedLog(ctx, vLog)
				case topicSubmitted:
					l.processWorkSubmittedLog(ctx, vLog)
				case topicRevision:
					l.processRevisionRequestedLog(ctx, vLog)
				case topicReleased:
					l.processPaymentReleasedLog(ctx, vLog)
				case topicRefunded:
					l.processJobRefundedLog(ctx, vLog)
				}
			}
			lastBlock = toBlock
		}
	}
}

func (l *ArcListener) processJobCreatedLog(ctx context.Context, vLog types.Log) {
	if len(vLog.Topics) < 3 || len(vLog.Data) < 96 {
		return
	}

	blockchainJobID := new(big.Int).SetBytes(vLog.Topics[1][:]).String()
	amountWei := new(big.Int).SetBytes(vLog.Data[0:32])
	amountFloat := new(big.Float).SetPrec(256).SetInt(amountWei)
	amountFloat = amountFloat.Quo(amountFloat, big.NewFloat(1e18))
	amount := amountFloat.Text('f', 18)
	metadataHash := common.BytesToHash(vLog.Data[64:96])

	jobs, err := l.jobRepo.ListOpen(ctx)
	if err != nil {
		log.Printf("arc_listener: list open jobs: %v", err)
		return
	}

	var matchedJobID uint64
	for _, job := range jobs {
		_, err := l.escrowRepo.FindByJobID(ctx, job.ID)
		if err == nil {
			continue
		}
		
		idStr := strconv.FormatUint(job.ID, 10)
		hash := crypto.Keccak256Hash([]byte(idStr))
		if hash == metadataHash {
			matchedJobID = job.ID
			break
		}
	}

	if matchedJobID == 0 {
		log.Printf("arc_listener: no DB job found for metadataHash %s", metadataHash.Hex())
		return
	}

	params := repositories.CreateJobEscrowParams{
		JobID:                  matchedJobID,
		ChainID:                l.chainID,
		ContractAddress:        l.contract.Hex(),
		BlockchainJobID:        blockchainJobID,
		Amount:                 amount,
		FundingTransactionHash: vLog.TxHash.Hex(),
	}

	_, err = l.escrowRepo.Create(ctx, params)
	if err != nil {
		log.Printf("arc_listener: failed to create escrow for job %d: %v", matchedJobID, err)
	} else {
		log.Printf("arc_listener: created escrow for job %d, tx %s", matchedJobID, vLog.TxHash.Hex())
		if l.eventRepo != nil {
			_ = l.eventRepo.Record(ctx, repositories.RecordEscrowEventParams{
				JobID:           matchedJobID,
				EventType:       "funded",
				Amount:          &amount,
				TransactionHash: vLog.TxHash.Hex(),
				LogIndex:        vLog.Index,
				BlockNumber:     vLog.BlockNumber,
			})
		}
	}
}

func (l *ArcListener) getJobByBlockchainID(ctx context.Context, vLog types.Log) (*models.JobEscrow, error) {
	if len(vLog.Topics) < 2 {
		return nil, fmt.Errorf("missing jobId topic")
	}
	blockchainJobID := new(big.Int).SetBytes(vLog.Topics[1][:]).String()
	return l.escrowRepo.FindByBlockchainID(ctx, l.chainID, l.contract.Hex(), blockchainJobID)
}

func (l *ArcListener) processFreelancerAssignedLog(ctx context.Context, vLog types.Log) {
	escrow, err := l.getJobByBlockchainID(ctx, vLog)
	if err != nil {
		log.Printf("arc_listener: processFreelancerAssignedLog: %v", err)
		return
	}
	_ = l.escrowRepo.UpdateStatus(ctx, escrow.JobID, "funded")
	_ = l.jobRepo.UpdateStatus(ctx, escrow.JobID, models.JobStatusInProgress)
	if l.eventRepo != nil {
		_ = l.eventRepo.Record(ctx, repositories.RecordEscrowEventParams{
			JobID:           escrow.JobID,
			EventType:       "freelancer_assigned",
			TransactionHash: vLog.TxHash.Hex(),
			LogIndex:        vLog.Index,
			BlockNumber:     vLog.BlockNumber,
		})
	}
	log.Printf("arc_listener: updated job %d to funded/in_progress", escrow.JobID)
}

func (l *ArcListener) processWorkSubmittedLog(ctx context.Context, vLog types.Log) {
	escrow, err := l.getJobByBlockchainID(ctx, vLog)
	if err != nil {
		log.Printf("arc_listener: processWorkSubmittedLog: %v", err)
		return
	}
	_ = l.escrowRepo.UpdateStatus(ctx, escrow.JobID, "work_submitted")
	if l.eventRepo != nil {
		_ = l.eventRepo.Record(ctx, repositories.RecordEscrowEventParams{
			JobID:           escrow.JobID,
			EventType:       "work_submitted",
			TransactionHash: vLog.TxHash.Hex(),
			LogIndex:        vLog.Index,
			BlockNumber:     vLog.BlockNumber,
		})
	}
	log.Printf("arc_listener: updated job %d to work_submitted", escrow.JobID)
}

func (l *ArcListener) processRevisionRequestedLog(ctx context.Context, vLog types.Log) {
	escrow, err := l.getJobByBlockchainID(ctx, vLog)
	if err != nil {
		log.Printf("arc_listener: processRevisionRequestedLog: %v", err)
		return
	}
	_ = l.escrowRepo.UpdateStatus(ctx, escrow.JobID, "funded")
	_ = l.jobRepo.UpdateStatus(ctx, escrow.JobID, models.JobStatusInProgress)
	if l.eventRepo != nil {
		_ = l.eventRepo.Record(ctx, repositories.RecordEscrowEventParams{
			JobID:           escrow.JobID,
			EventType:       "revision_requested",
			TransactionHash: vLog.TxHash.Hex(),
			LogIndex:        vLog.Index,
			BlockNumber:     vLog.BlockNumber,
		})
	}
	log.Printf("arc_listener: updated job %d to funded (revision requested)", escrow.JobID)
}

func (l *ArcListener) processPaymentReleasedLog(ctx context.Context, vLog types.Log) {
	escrow, err := l.getJobByBlockchainID(ctx, vLog)
	if err != nil {
		log.Printf("arc_listener: processPaymentReleasedLog: %v", err)
		return
	}
	_ = l.escrowRepo.UpdateStatus(ctx, escrow.JobID, "completed")
	_ = l.jobRepo.UpdateStatus(ctx, escrow.JobID, models.JobStatusCompleted)

	var amountPtr *string
	if len(vLog.Data) >= 32 {
		amountWei := new(big.Int).SetBytes(vLog.Data[0:32])
		amountFloat := new(big.Float).SetPrec(256).SetInt(amountWei)
		amountFloat = amountFloat.Quo(amountFloat, big.NewFloat(1e18))
		amt := amountFloat.Text('f', 18)
		amountPtr = &amt
	}

	if l.eventRepo != nil {
		_ = l.eventRepo.Record(ctx, repositories.RecordEscrowEventParams{
			JobID:           escrow.JobID,
			EventType:       "payment_released",
			Amount:          amountPtr,
			TransactionHash: vLog.TxHash.Hex(),
			LogIndex:        vLog.Index,
			BlockNumber:     vLog.BlockNumber,
		})
	}
	log.Printf("arc_listener: updated job %d to completed", escrow.JobID)
}

func (l *ArcListener) processJobRefundedLog(ctx context.Context, vLog types.Log) {
	escrow, err := l.getJobByBlockchainID(ctx, vLog)
	if err != nil {
		log.Printf("arc_listener: processJobRefundedLog: %v", err)
		return
	}
	_ = l.escrowRepo.UpdateStatus(ctx, escrow.JobID, "refunded")
	_ = l.jobRepo.UpdateStatus(ctx, escrow.JobID, models.JobStatusCancelled)

	var amountPtr *string
	if len(vLog.Data) >= 32 {
		amountWei := new(big.Int).SetBytes(vLog.Data[0:32])
		amountFloat := new(big.Float).SetPrec(256).SetInt(amountWei)
		amountFloat = amountFloat.Quo(amountFloat, big.NewFloat(1e18))
		amt := amountFloat.Text('f', 18)
		amountPtr = &amt
	}

	if l.eventRepo != nil {
		_ = l.eventRepo.Record(ctx, repositories.RecordEscrowEventParams{
			JobID:           escrow.JobID,
			EventType:       "refunded",
			Amount:          amountPtr,
			TransactionHash: vLog.TxHash.Hex(),
			LogIndex:        vLog.Index,
			BlockNumber:     vLog.BlockNumber,
		})
	}
	log.Printf("arc_listener: updated job %d to refunded/cancelled", escrow.JobID)
}
