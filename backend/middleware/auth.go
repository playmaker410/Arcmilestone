package middleware

import (
	"context"
	"net/http"
	"strings"

	"arcmilestone/services"
	"arcmilestone/utils"
)

// contextKey is an unexported type for context keys in this package to avoid
// collisions with keys from other packages.
type contextKey int

const (
	contextKeyUserID        contextKey = iota
	contextKeyWalletAddress contextKey = iota
)

// NewAuthMiddleware returns middleware that validates the Bearer token in the
// Authorization header using WalletAuthService. On success it stores the userID
// and walletAddress in the request context. On failure it writes 401 and stops.
func NewAuthMiddleware(svc *services.WalletAuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			token, found := strings.CutPrefix(authHeader, "Bearer ")
			if !found || strings.TrimSpace(token) == "" {
				utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
				return
			}

			userID, walletAddress, err := svc.ValidateToken(token)
			if err != nil {
				utils.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
				return
			}

			ctx := context.WithValue(r.Context(), contextKeyUserID, userID)
			ctx = context.WithValue(ctx, contextKeyWalletAddress, walletAddress)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserIDFromContext extracts the authenticated user's ID from the context.
// Returns (0, false) if no user ID is present.
func UserIDFromContext(ctx context.Context) (uint64, bool) {
	id, ok := ctx.Value(contextKeyUserID).(uint64)
	return id, ok
}

// WalletAddressFromContext extracts the authenticated user's wallet address
// from the context. Returns ("", false) if not present.
func WalletAddressFromContext(ctx context.Context) (string, bool) {
	addr, ok := ctx.Value(contextKeyWalletAddress).(string)
	return addr, ok
}

// SetAuthContext stores userID and walletAddress in a context using the same
// private keys that UserIDFromContext and WalletAddressFromContext read from.
// This allows packages outside middleware to inject auth data (e.g. for
// optional-authentication paths in the router).
func SetAuthContext(ctx context.Context, userID uint64, walletAddress string) context.Context {
	ctx = context.WithValue(ctx, contextKeyUserID, userID)
	ctx = context.WithValue(ctx, contextKeyWalletAddress, walletAddress)
	return ctx
}
