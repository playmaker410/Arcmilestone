package handlers

import (
	"net/http"

	"arcmilestone/middleware"
	"arcmilestone/models"
	"arcmilestone/repositories"
	"arcmilestone/utils"
)

type TransactionHandler struct {
	repo *repositories.EscrowEventRepository
}

func NewTransactionHandler(repo *repositories.EscrowEventRepository) *TransactionHandler {
	return &TransactionHandler{repo: repo}
}

// List handles GET /api/transactions (protected).
func (h *TransactionHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	page, limit := parsePagination(r)
	events, total, err := h.repo.ListByUser(r.Context(), userID, page, limit)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	pagination := models.NewPagination(page, limit, total)
	utils.WriteJSON(w, http.StatusOK, map[string]any{
		"transactions": events,
		"pagination":   pagination,
	})
}
