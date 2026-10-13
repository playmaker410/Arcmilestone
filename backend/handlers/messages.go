package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

type MessageHandler struct {
	svc *services.MessageService
}

func NewMessageHandler(svc *services.MessageService) *MessageHandler {
	return &MessageHandler{svc: svc}
}

// List handles GET /api/jobs/{id}/messages?after_id= (protected).
func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
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

	var afterID uint64
	if a := r.URL.Query().Get("after_id"); a != "" {
		if val, err := strconv.ParseUint(a, 10, 64); err == nil {
			afterID = val
		}
	}

	messages, err := h.svc.ListByJob(r.Context(), jobID, userID, afterID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"messages": messages})
}

// Post handles POST /api/jobs/{id}/messages (protected).
func (h *MessageHandler) Post(w http.ResponseWriter, r *http.Request) {
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
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	msg, err := h.svc.PostMessage(r.Context(), jobID, userID, req.Body)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, msg)
}
