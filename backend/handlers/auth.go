package handlers

import (
	"encoding/json"
	"net/http"

	"arcmilestone/middleware"
	"arcmilestone/services"
	"arcmilestone/utils"
)

// AuthHandler handles wallet-based authentication endpoints.
type AuthHandler struct {
	svc     *services.WalletAuthService
	userSvc *services.UserService
}

// NewAuthHandler constructs an AuthHandler.
func NewAuthHandler(svc *services.WalletAuthService, userSvc *services.UserService) *AuthHandler {
	return &AuthHandler{svc: svc, userSvc: userSvc}
}

// RequestNonce handles POST /api/auth/nonce.
// Body: {"wallet_address":"0x..."}
// Returns: {"nonce":"...","expires_at":"..."}
func (h *AuthHandler) RequestNonce(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		WalletAddress string `json:"wallet_address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	result, err := h.svc.GenerateNonce(r.Context(), req.WalletAddress)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, result)
}

// VerifySignature handles POST /api/auth/verify.
// Body: {"wallet_address":"0x...","nonce":"...","signature":"0x..."}
// Returns: {"token":"...","user":{...}}
func (h *AuthHandler) VerifySignature(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		WalletAddress string `json:"wallet_address"`
		Nonce         string `json:"nonce"`
		Signature     string `json:"signature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	result, err := h.svc.VerifySignature(r.Context(), req.WalletAddress, req.Nonce, req.Signature)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, result)
}

// Me handles GET /api/auth/me (protected).
// Returns the currently authenticated user.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	user, err := h.userSvc.GetByID(r.Context(), userID)
	if err != nil {
		utils.WriteError(w, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, user)
}

// Logout handles POST /api/auth/logout (protected).
// Token invalidation is client-side for this token scheme; returns 204.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
