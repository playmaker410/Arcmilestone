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

	"arcmilestone/repositories"
)

type ArcListener struct {
	client     *ethclient.Client
	contract   common.Address
	chainID    uint64
	escrowRepo *repositories.JobEscrowRepository
	jobRepo    *repositories.JobRepository
}

func NewArcListener(rpcURL, contractAddr string, escrowRepo *repositories.JobEscrowRepository, jobRepo *repositories.JobRepository) (*ArcListener, error) {
	if rpcURL == "" || contractAddr == "" {
		return nil, nil // Disabled if not configured
	}

	client, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dial ethclient: %w", err)
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
		// Scan back 1000 blocks on startup to catch missed events while offline
		if lastBlock > 1000 {
			lastBlock -= 1000
		} else {
			lastBlock = 0
		}
	} else {
		log.Printf("arc_listener: initial header fetch failed: %v", err)
	}

	eventSig := []byte("JobCreatedAndFundedOpen(uint256,address,uint256,uint256,bytes32)")
	topic0 := crypto.Keccak256Hash(eventSig)

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

			// Do not query more than 100 blocks at once to avoid RPC limits.
			// Advance in chunks to ensure no blocks are skipped.
			fromBlock := lastBlock + 1
			toBlock := latestBlock
			if toBlock-fromBlock > 100 {
				toBlock = fromBlock + 100
			}

			query := ethereum.FilterQuery{
				FromBlock: new(big.Int).SetUint64(fromBlock),
				ToBlock:   new(big.Int).SetUint64(toBlock),
				Addresses: []common.Address{l.contract},
				Topics:    [][]common.Hash{{topic0}},
			}

			logs, err := l.client.FilterLogs(ctx, query)
			if err != nil {
				log.Printf("arc_listener: filter logs: %v", err)
				continue
			}

			for _, vLog := range logs {
				l.processJobCreatedLog(ctx, vLog)
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
	amount := new(big.Int).SetBytes(vLog.Data[0:32]).String()
	metadataHash := common.BytesToHash(vLog.Data[64:96])

	// Find the matching DB job by hashing IDs of unfunded jobs
	jobs, err := l.jobRepo.ListOpen(ctx)
	if err != nil {
		log.Printf("arc_listener: list open jobs: %v", err)
		return
	}

	var matchedJobID uint64
	for _, job := range jobs {
		// Only consider jobs without an escrow record.
		_, err := l.escrowRepo.FindByJobID(ctx, job.ID)
		if err == nil {
			continue // Escrow exists
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
	}
}
