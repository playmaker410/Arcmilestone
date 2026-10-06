// Package routes is the central place where HTTP endpoints are registered.
package routes

import (
	"database/sql"
	"net/http"
	"strings"

	"arcmilestone/handlers"
	"arcmilestone/middleware"
	"arcmilestone/services"
)

// New builds the API router with all services wired up.
func New(
	_ *sql.DB,
	authSvc *services.WalletAuthService,
	userSvc *services.UserService,
	jobSvc *services.JobService,
	appSvc *services.ApplicationService,
	subSvc *services.SubmissionService,
	notifSvc *services.NotificationService,
	escrowSvc *services.JobEscrowService,
	frontendURL string,
) http.Handler {
	mux := http.NewServeMux()

	// Middleware constructors
	auth := middleware.NewAuthMiddleware(authSvc)
	optAuth := newOptionalAuthMiddleware(authSvc)

	// Handlers
	authHandler := handlers.NewAuthHandler(authSvc, userSvc)
	userHandler := handlers.NewUserHandler(userSvc)
	jobHandler := handlers.NewJobHandler(jobSvc)
	appHandler := handlers.NewApplicationHandler(appSvc)
	subHandler := handlers.NewSubmissionHandler(subSvc)
	notifHandler := handlers.NewNotificationHandler(notifSvc)
	escrowHandler := handlers.NewJobEscrowHandler(escrowSvc)

	// -----------------------------------------------------------------------
	// Auth routes
	// -----------------------------------------------------------------------
	mux.HandleFunc("POST /api/auth/nonce", authHandler.RequestNonce)
	mux.HandleFunc("POST /api/auth/verify", authHandler.VerifySignature)
	mux.Handle("GET /api/auth/me", auth(http.HandlerFunc(authHandler.Me)))
	mux.Handle("POST /api/auth/logout", auth(http.HandlerFunc(authHandler.Logout)))

	// -----------------------------------------------------------------------
	// User routes
	// -----------------------------------------------------------------------
	mux.Handle("GET /api/users/me", auth(http.HandlerFunc(userHandler.GetMe)))
	mux.Handle("PATCH /api/users/me", auth(http.HandlerFunc(userHandler.UpdateMe)))
	mux.HandleFunc("GET /api/users/check-username", userHandler.CheckUsername)

	// -----------------------------------------------------------------------
	// Job routes
	// -----------------------------------------------------------------------
	mux.Handle("POST /api/jobs", auth(http.HandlerFunc(jobHandler.Create)))
	// GET /api/jobs is public but accepts optional auth for ?mine=true.
	mux.Handle("GET /api/jobs", optAuth(http.HandlerFunc(jobHandler.List)))
	mux.HandleFunc("GET /api/jobs/{id}", jobHandler.GetByID)
	mux.Handle("PATCH /api/jobs/{id}", auth(http.HandlerFunc(jobHandler.Patch)))
	mux.Handle("DELETE /api/jobs/{id}", auth(http.HandlerFunc(jobHandler.Delete)))
	mux.Handle("POST /api/jobs/{id}/publish", auth(http.HandlerFunc(jobHandler.Publish)))
	mux.Handle("POST /api/jobs/{id}/cancel", auth(http.HandlerFunc(jobHandler.Cancel)))

	// -----------------------------------------------------------------------
	// Application routes
	// -----------------------------------------------------------------------
	mux.Handle("POST /api/jobs/{id}/applications", auth(http.HandlerFunc(appHandler.Apply)))
	mux.Handle("GET /api/jobs/{id}/applications", auth(http.HandlerFunc(appHandler.ListByJob)))
	mux.Handle("POST /api/jobs/{id}/applications/{applicationId}/accept", auth(http.HandlerFunc(appHandler.Accept)))
	mux.Handle("POST /api/jobs/{id}/applications/{applicationId}/reject", auth(http.HandlerFunc(appHandler.Reject)))
	mux.Handle("GET /api/applications/me", auth(http.HandlerFunc(appHandler.ListMine)))
	mux.Handle("POST /api/applications/{id}/withdraw", auth(http.HandlerFunc(appHandler.Withdraw)))

	// -----------------------------------------------------------------------
	// Submission routes
	// -----------------------------------------------------------------------
	mux.Handle("POST /api/jobs/{id}/submission", auth(http.HandlerFunc(subHandler.Submit)))
	mux.Handle("GET /api/jobs/{id}/submission", auth(http.HandlerFunc(subHandler.GetByJob)))

	// -----------------------------------------------------------------------
	// Escrow routes
	// POST records the on-chain escrow reference after createAndFundJobOpen confirms.
	// GET returns the stored reference (public — needed by JobDetails to show tx hash).
	// -----------------------------------------------------------------------
	mux.Handle("POST /api/jobs/{id}/escrow", auth(http.HandlerFunc(escrowHandler.RecordEscrow)))
	mux.HandleFunc("GET /api/jobs/{id}/escrow", escrowHandler.GetEscrow)

	// -----------------------------------------------------------------------
	// Notification routes
	// -----------------------------------------------------------------------
	mux.Handle("GET /api/notifications", auth(http.HandlerFunc(notifHandler.List)))
	mux.Handle("GET /api/notifications/unread", auth(http.HandlerFunc(notifHandler.ListUnread)))
	mux.Handle("PATCH /api/notifications/{id}/read", auth(http.HandlerFunc(notifHandler.MarkRead)))

	// -----------------------------------------------------------------------
	// Health
	// -----------------------------------------------------------------------
	mux.HandleFunc("GET /api/health", handlers.Health)

	// Apply global middleware: CORS then Logging.
	corsMiddleware := middleware.NewCORSMiddleware(frontendURL)
	return corsMiddleware(middleware.Logging(mux))
}

// newOptionalAuthMiddleware returns middleware that tries to validate the Bearer
// token. On success it stores userID and walletAddress in the context. On
// failure (missing or invalid token) it still calls next without rejecting.
func newOptionalAuthMiddleware(svc *services.WalletAuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			token, found := strings.CutPrefix(authHeader, "Bearer ")
			if found && strings.TrimSpace(token) != "" {
				if userID, walletAddress, err := svc.ValidateToken(token); err == nil {
					ctx := middleware.SetAuthContext(r.Context(), userID, walletAddress)
					r = r.WithContext(ctx)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
