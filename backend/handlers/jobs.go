package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// JobHandler handles marketplace job endpoints.
type JobHandler struct {
	svc *services.JobService
}

// NewJobHandler constructs a JobHandler.
func NewJobHandler(svc *services.JobService) *JobHandler {
	return &JobHandler{svc: svc}
}

// Create handles POST /api/jobs (protected).
//
// Request body (all required):
//
//	{
//	  "title":                "string",
//	  "description":          "string",
//	  "required_skills":      ["string", ...],
//	  "budget":               "150.00",               // decimal string
//	  "application_deadline": "2026-12-01T00:00:00Z", // RFC3339, required
//	  "delivery_deadline":    "2027-01-15T00:00:00Z"  // RFC3339, required
//	}
//
// Budget is locked at creation and cannot be changed afterwards.
// application_deadline is mandatory — once it passes no new applications are accepted.
// The authenticated user from the request context is used as the creator.
func (h *JobHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	var req struct {
		Title               string   `json:"title"`
		Description         string   `json:"description"`
		RequiredSkills      []string `json:"required_skills"`
		Budget              string   `json:"budget"`
		ApplicationDeadline *string  `json:"application_deadline"`
		DeliveryDeadline    string   `json:"delivery_deadline"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	params := services.CreateJobParams{
		Title:          req.Title,
		Description:    req.Description,
		RequiredSkills: req.RequiredSkills,
		Budget:         req.Budget,
	}

	// delivery_deadline is required.
	if req.DeliveryDeadline == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "delivery_deadline is required"})
		return
	}
	t, err := time.Parse(time.RFC3339, req.DeliveryDeadline)
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "delivery_deadline must be an RFC3339 timestamp"})
		return
	}
	params.DeliveryDeadline = t

	// application_deadline is required.
	if req.ApplicationDeadline == nil || *req.ApplicationDeadline == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "application_deadline is required"})
		return
	}
	at, err := time.Parse(time.RFC3339, *req.ApplicationDeadline)
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "application_deadline must be an RFC3339 timestamp"})
		return
	}
	params.ApplicationDeadline = &at

	job, err := h.svc.Create(r.Context(), userID, params)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, job)
}

// Patch handles PATCH /api/jobs/{id} (protected).
//
// Allows the job creator to update title, description, required_skills,
// application_deadline, and delivery_deadline while the job is OPEN or
// REVIEWING_APPLICATIONS.
//
// Budget is unconditionally excluded — it cannot be changed after creation.
// This prevents a client from attracting applicants with a high budget and
// then silently reducing it before funding.
//
// Request body (all fields required — send the full current values for
// fields you do not intend to change):
//
//	{
//	  "title":                "string",
//	  "description":          "string",
//	  "required_skills":      ["string", ...],
//	  "application_deadline": "2026-12-01T00:00:00Z",
//	  "delivery_deadline":    "2027-01-15T00:00:00Z"
//	}
func (h *JobHandler) Patch(w http.ResponseWriter, r *http.Request) {
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
		Title               string   `json:"title"`
		Description         string   `json:"description"`
		RequiredSkills      []string `json:"required_skills"`
		ApplicationDeadline *string  `json:"application_deadline"`
		DeliveryDeadline    string   `json:"delivery_deadline"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	params := services.UpdateJobParams{
		Title:          req.Title,
		Description:    req.Description,
		RequiredSkills: req.RequiredSkills,
	}

	if req.DeliveryDeadline == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "delivery_deadline is required"})
		return
	}
	dt, err := time.Parse(time.RFC3339, req.DeliveryDeadline)
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "delivery_deadline must be an RFC3339 timestamp"})
		return
	}
	params.DeliveryDeadline = dt

	if req.ApplicationDeadline == nil || *req.ApplicationDeadline == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "application_deadline is required"})
		return
	}
	at, err := time.Parse(time.RFC3339, *req.ApplicationDeadline)
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "application_deadline must be an RFC3339 timestamp"})
		return
	}
	params.ApplicationDeadline = &at

	job, err := h.svc.Update(r.Context(), jobID, userID, params)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, job)
}

// List handles GET /api/jobs (public, optional auth).
//
// Query params:
//   - ?mine=true  lists the caller's jobs (requires auth)
//   - (no params) lists all OPEN jobs
func (h *JobHandler) List(w http.ResponseWriter, r *http.Request) {
	mine := r.URL.Query().Get("mine") == "true"

	if mine {
		userID, ok := middleware.UserIDFromContext(r.Context())
		if !ok {
			utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		jobs, err := h.svc.ListByCreator(r.Context(), userID)
		if err != nil {
			utils.WriteError(w, err)
			return
		}
		utils.WriteJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
		return
	}

	jobs, err := h.svc.ListOpen(r.Context())
	if err != nil {
		utils.WriteError(w, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
}

// GetByID handles GET /api/jobs/{id} (public).
func (h *JobHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	jobID, err := parseUint64Param(r, "id")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid job id"})
		return
	}

	job, err := h.svc.GetByID(r.Context(), jobID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, job)
}

// Publish handles POST /api/jobs/{id}/publish (protected).
//
// Jobs are created directly as OPEN, so calling publish on a freshly created
// job is a no-op that returns the job unchanged. This endpoint exists so the
// frontend's two-step create→publish flow continues to work without change.
func (h *JobHandler) Publish(w http.ResponseWriter, r *http.Request) {
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

	job, err := h.svc.Publish(r.Context(), jobID, userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, job)
}

// Cancel handles POST /api/jobs/{id}/cancel (protected).
func (h *JobHandler) Cancel(w http.ResponseWriter, r *http.Request) {
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

	job, err := h.svc.Cancel(r.Context(), jobID, userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, job)
}

// Delete handles DELETE /api/jobs/{id} (protected).
func (h *JobHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	if err := h.svc.Delete(r.Context(), jobID, userID); err != nil {
		utils.WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// parseUint64Param extracts a named URL path parameter and parses it as uint64.
func parseUint64Param(r *http.Request, name string) (uint64, error) {
	raw := strings.TrimSpace(r.PathValue(name))
	return strconv.ParseUint(raw, 10, 64)
}
