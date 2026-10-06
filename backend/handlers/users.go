package handlers

import (
	"encoding/json"
	"net/http"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// UserHandler handles authenticated user profile endpoints.
type UserHandler struct {
	svc *services.UserService
}

// NewUserHandler constructs a UserHandler.
func NewUserHandler(svc *services.UserService) *UserHandler {
	return &UserHandler{svc: svc}
}

// GetMe handles GET /api/users/me (protected).
//
// Returns the currently authenticated user's profile.
// The authenticated user ID comes from the request context.
func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(
			w,
			http.StatusUnauthorized,
			map[string]string{
				"error": "authentication required",
			},
		)
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
//
// Body:
//
//	{"username":"Joshua_Dev"}
//
// This endpoint is used after authentication when a new user needs
// to choose a username.
func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(
			w,
			http.StatusUnauthorized,
			map[string]string{
				"error": "authentication required",
			},
		)
		return
	}

	var req struct {
		Username string `json:"username"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(
			w,
			http.StatusBadRequest,
			map[string]string{
				"error": "invalid request body",
			},
		)
		return
	}

	user, err := h.svc.UpdateUsername(
		r.Context(),
		userID,
		req.Username,
	)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, user)
}

// CheckUsername handles GET /api/users/check-username?username=...
func (h *UserHandler) CheckUsername(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")

	if username == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "username query parameter is required"})
		return
	}

	available, err := h.svc.IsUsernameAvailable(r.Context(), username)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]bool{
		"available": available,
	})
}
