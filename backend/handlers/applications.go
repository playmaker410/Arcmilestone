package handlers

import (
	"encoding/json"
	"net/http"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// ApplicationHandler handles job application endpoints.
type ApplicationHandler struct {
	svc *services.ApplicationService
}

// NewApplicationHandler constructs an ApplicationHandler.
func NewApplicationHandler(svc *services.ApplicationService) *ApplicationHandler {
	return &ApplicationHandler{svc: svc}
}

// Apply handles POST /api/jobs/{id}/applications (protected).
func (h *ApplicationHandler) Apply(w http.ResponseWriter, r *http.Request) {
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
		CoverLetter   string  `json:"cover_letter"`
		EstimatedDays uint32  `json:"estimated_days"`
		PortfolioURL  *string `json:"portfolio_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	app, err := h.svc.Apply(r.Context(), jobID, userID, services.CreateApplicationParams{
		CoverLetter:   req.CoverLetter,
		EstimatedDays: req.EstimatedDays,
		PortfolioURL:  req.PortfolioURL,
	})
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, app)
}

// ListByJob handles GET /api/jobs/{id}/applications (protected, job creator only).
func (h *ApplicationHandler) ListByJob(w http.ResponseWriter, r *http.Request) {
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

	apps, err := h.svc.ListByJob(r.Context(), jobID, userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"applications": apps})
}

// ListMine handles GET /api/applications/me (protected).
func (h *ApplicationHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	apps, err := h.svc.ListMine(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"applications": apps})
}

// Accept handles POST /api/jobs/{id}/applications/{applicationId}/accept (protected).
func (h *ApplicationHandler) Accept(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	applicationID, err := parseUint64Param(r, "applicationId")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application id"})
		return
	}

	app, err := h.svc.Accept(r.Context(), applicationID, userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, app)
}

// Reject handles POST /api/jobs/{id}/applications/{applicationId}/reject (protected).
func (h *ApplicationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	applicationID, err := parseUint64Param(r, "applicationId")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application id"})
		return
	}

	app, err := h.svc.Reject(r.Context(), applicationID, userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, app)
}

// Withdraw handles POST /api/applications/{id}/withdraw (protected).
func (h *ApplicationHandler) Withdraw(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	applicationID, err := parseUint64Param(r, "id")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid application id"})
		return
	}

	app, err := h.svc.Withdraw(r.Context(), applicationID, userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, app)
}
