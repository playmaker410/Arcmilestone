package handlers

import (
	"net/http"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// NotificationHandler handles user notification endpoints.
type NotificationHandler struct {
	svc *services.NotificationService
}

// NewNotificationHandler constructs a NotificationHandler.
func NewNotificationHandler(svc *services.NotificationService) *NotificationHandler {
	return &NotificationHandler{svc: svc}
}

// List handles GET /api/notifications (protected).
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	notifs, err := h.svc.ListAll(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"notifications": notifs})
}

// ListUnread handles GET /api/notifications/unread (protected).
func (h *NotificationHandler) ListUnread(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	notifs, err := h.svc.ListUnread(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"notifications": notifs})
}

// MarkRead handles PATCH /api/notifications/{id}/read (protected).
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	notifID, err := parseUint64Param(r, "id")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid notification id"})
		return
	}

	if err := h.svc.MarkRead(r.Context(), notifID, userID); err != nil {
		utils.WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
