package handlers

import (
	"encoding/json"
	"net/http"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// UserHandler handles user profile endpoints.
type UserHandler struct {
	svc *services.UserService
}

// NewUserHandler constructs a UserHandler.
func NewUserHandler(svc *services.UserService) *UserHandler {
	return &UserHandler{svc: svc}
}

// GetMe handles GET /api/users/me (protected).
// Returns the authenticated user's profile.
func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	user, err := h.svc.GetByID(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, user)
}

// UpdateMe handles PATCH /api/users/me (protected).
// Body: {"display_name":"...","email":"..."}
// Returns the updated user profile.
func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	var req struct {
		DisplayName *string `json:"display_name"`
		Email       *string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user, err := h.svc.UpdateProfile(r.Context(), userID, services.UpdateProfileParams{
		DisplayName: req.DisplayName,
		Email:       req.Email,
	})
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, user)
}
