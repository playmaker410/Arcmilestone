package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"arcmilestone/apperr"
	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// JobEscrowHandler handles escrow recording endpoints.
type JobEscrowHandler struct {
	svc *services.JobEscrowService
}

// NewJobEscrowHandler constructs the handler.
func NewJobEscrowHandler(svc *services.JobEscrowService) *JobEscrowHandler {
	return &JobEscrowHandler{svc: svc}
}

// RecordEscrow handles POST /api/jobs/{id}/escrow (protected).
//
// Called by the frontend immediately after createAndFundJobOpen confirms
// on-chain. Saves the blockchain_job_id and funding_transaction_hash so
// the backend can serve them without an RPC call.
//
// Request body:
//
//	{
//	  "blockchain_job_id":        "42",
//	  "funding_transaction_hash": "0xabc..."
//	}
//
// Returns the created (or already-existing) escrow record.
// Idempotent: calling it twice for the same job returns the first record.
func (h *JobEscrowHandler) RecordEscrow(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	jobID, err := parseUint64Param(r, "id")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid job id"})
		return
	}

	var req struct {
		BlockchainJobID        string `json:"blockchain_job_id"`
		FundingTransactionHash string `json:"funding_transaction_hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	escrow, err := h.svc.RecordEscrow(r.Context(), jobID, userID, services.RecordEscrowParams{
		BlockchainJobID:        req.BlockchainJobID,
		FundingTransactionHash: req.FundingTransactionHash,
	})
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, escrow)
}

// GetEscrow handles GET /api/jobs/{id}/escrow (public).
//
// Returns the escrow record for a job, or 404 if none has been recorded yet.
func (h *JobEscrowHandler) GetEscrow(w http.ResponseWriter, r *http.Request) {
	jobID, err := parseUint64Param(r, "id")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid job id"})
		return
	}

	escrow, err := h.svc.GetEscrow(r.Context(), jobID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}
	if escrow == nil {
		utils.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "no escrow recorded for this job"})
		return
	}

	utils.WriteJSON(w, http.StatusOK, escrow)
}

// SyncEscrow handles POST /api/jobs/{id}/sync_escrow (protected).
func (h *JobEscrowHandler) SyncEscrow(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	jobID, err := parseUint64Param(r, "id")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid job id"})
		return
	}

	var req struct {
		TransactionHash string `json:"transaction_hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if err := h.svc.SyncEscrow(r.Context(), jobID, userID, req.TransactionHash); err != nil {
		log.Printf("[sync_escrow] failed for job %d (tx %s): %v", jobID, req.TransactionHash, err)
		if errors.Is(err, apperr.ErrNotFound) || errors.Is(err, apperr.ErrForbidden) || errors.Is(err, apperr.ErrUnauthorized) {
			utils.WriteError(w, err)
			return
		}
		// Return 200 with pending_confirmation for blockchain RPC / indexing delay
		// so the frontend client does not crash when an on-chain transaction succeeded.
		utils.WriteJSON(w, http.StatusOK, map[string]string{
			"status":  "pending_confirmation",
			"warning": err.Error(),
		})
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
