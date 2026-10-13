package handlers

import (
	"encoding/json"
	"net/http"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// SubmissionHandler handles work submission endpoints.
type SubmissionHandler struct {
	svc *services.SubmissionService
}

// NewSubmissionHandler constructs a SubmissionHandler.
func NewSubmissionHandler(svc *services.SubmissionService) *SubmissionHandler {
	return &SubmissionHandler{svc: svc}
}

// Submit handles POST /api/jobs/{id}/submission (protected).
func (h *SubmissionHandler) Submit(w http.ResponseWriter, r *http.Request) {
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
		RepositoryURL string `json:"repository_url"`
		DemoURL       string `json:"demo_url"`
		SubmissionURL string `json:"submission_url"`
		Notes         string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	sub, err := h.svc.Submit(r.Context(), jobID, userID, services.CreateSubmissionParams{
		RepositoryURL: req.RepositoryURL,
		DemoURL:       req.DemoURL,
		SubmissionURL: req.SubmissionURL,
		Notes:         req.Notes,
	})
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, sub)
}

// RequestChanges handles POST /api/jobs/{id}/submission/request-changes (protected).
func (h *SubmissionHandler) RequestChanges(w http.ResponseWriter, r *http.Request) {
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
		Feedback string `json:"feedback"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if err := h.svc.RequestChanges(r.Context(), jobID, userID, req.Feedback); err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "message": "revision requested"})
}

// GetByJob handles GET /api/jobs/{id}/submission (protected).
func (h *SubmissionHandler) GetByJob(w http.ResponseWriter, r *http.Request) {
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

	sub, err := h.svc.GetByJobID(r.Context(), jobID, userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, sub)
}
