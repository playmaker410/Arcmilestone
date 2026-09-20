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
func (h *JobHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	var req struct {
		HiringMethod        string   `json:"hiring_method"`
		Title               string   `json:"title"`
		Description         string   `json:"description"`
		RequiredSkills      []string `json:"required_skills"`
		Budget              string   `json:"budget"`
		ApplicationDeadline *string  `json:"application_deadline"`
		DeliveryDeadline    string   `json:"delivery_deadline"`
		ReferenceURL        *string  `json:"reference_url"`
		FreelancerWallet    *string  `json:"freelancer_wallet"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	params := services.CreateJobParams{
		HiringMethod:     req.HiringMethod,
		Title:            req.Title,
		Description:      req.Description,
		RequiredSkills:   req.RequiredSkills,
		Budget:           req.Budget,
		ReferenceURL:     req.ReferenceURL,
		FreelancerWallet: req.FreelancerWallet,
	}

	if req.DeliveryDeadline != "" {
		t, err := time.Parse(time.RFC3339, req.DeliveryDeadline)
		if err != nil {
			utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "delivery_deadline must be RFC3339"})
			return
		}
		params.DeliveryDeadline = t
	}

	if req.ApplicationDeadline != nil {
		t, err := time.Parse(time.RFC3339, *req.ApplicationDeadline)
		if err != nil {
			utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "application_deadline must be RFC3339"})
			return
		}
		params.ApplicationDeadline = &t
	}

	job, err := h.svc.Create(r.Context(), userID, params)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, job)
}

// List handles GET /api/jobs (public, optional auth).
// Query params: ?mine=true to list the caller's jobs (requires auth).
func (h *JobHandler) List(w http.ResponseWriter, r *http.Request) {
	// Attempt optional authentication: extract token but don't reject on failure.
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

// Update handles PATCH /api/jobs/{id} (protected).
func (h *JobHandler) Update(w http.ResponseWriter, r *http.Request) {
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
		Budget              string   `json:"budget"`
		ApplicationDeadline *string  `json:"application_deadline"`
		DeliveryDeadline    string   `json:"delivery_deadline"`
		ReferenceURL        *string  `json:"reference_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	params := services.UpdateJobParams{
		Title:          req.Title,
		Description:    req.Description,
		RequiredSkills: req.RequiredSkills,
		Budget:         req.Budget,
		ReferenceURL:   req.ReferenceURL,
	}

	if req.DeliveryDeadline != "" {
		t, err := time.Parse(time.RFC3339, req.DeliveryDeadline)
		if err != nil {
			utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "delivery_deadline must be RFC3339"})
			return
		}
		params.DeliveryDeadline = t
	}

	if req.ApplicationDeadline != nil {
		t, err := time.Parse(time.RFC3339, *req.ApplicationDeadline)
		if err != nil {
			utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "application_deadline must be RFC3339"})
			return
		}
		params.ApplicationDeadline = &t
	}

	job, err := h.svc.Update(r.Context(), jobID, userID, params)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, job)
}

// Publish handles POST /api/jobs/{id}/publish (protected).
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

// parseUint64Param extracts a named URL path parameter and parses it as uint64.
func parseUint64Param(r *http.Request, name string) (uint64, error) {
	raw := strings.TrimSpace(r.PathValue(name))
	return strconv.ParseUint(raw, 10, 64)
}
