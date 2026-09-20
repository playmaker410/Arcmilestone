// Package main starts the ArcMilestone HTTP API.
//
// Keeping the executable in cmd/api separates application startup from the
// reusable packages that contain handlers, routes, and future business logic.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"arcmilestone/config"
	"arcmilestone/database"
	"arcmilestone/repositories"
	"arcmilestone/routes"
	"arcmilestone/services"
)

func main() {
	// =====================================================
	// STEP 1: LOAD APPLICATION CONFIGURATION
	// =====================================================
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("configuration startup failed: %v", err)
	}

	// =====================================================
	// STEP 2: CONNECT TO MYSQL
	// =====================================================
	startupContext, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	db, err := database.Open(startupContext, cfg.Database)
	cancelStartup()
	if err != nil {
		log.Fatalf("database startup failed: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("close MySQL connection pool: %v", err)
			return
		}
		log.Print("MySQL connection pool closed")
	}()

	// =====================================================
	// STEP 3: BUILD REPOSITORIES
	// =====================================================
	userRepo := repositories.NewUserRepository(db)
	nonceRepo := repositories.NewAuthNonceRepository(db)
	jobRepo := repositories.NewJobRepository(db)
	appRepo := repositories.NewApplicationRepository(db)
	subRepo := repositories.NewSubmissionRepository(db)
	notifRepo := repositories.NewNotificationRepository(db)

	// =====================================================
	// STEP 4: BUILD SERVICES
	// =====================================================
	authSvc := services.NewWalletAuthService(userRepo, nonceRepo, cfg.AuthSecret)
	userSvc := services.NewUserService(userRepo)
	jobSvc := services.NewJobService(jobRepo, userRepo, notifRepo)
	appSvc := services.NewApplicationService(appRepo, jobRepo, userRepo, notifRepo)
	subSvc := services.NewSubmissionService(subRepo, jobRepo, notifRepo)
	notifSvc := services.NewNotificationService(notifRepo)

	// =====================================================
	// STEP 5: BUILD THE HTTP SERVER
	// =====================================================
	handler := routes.New(db, authSvc, userSvc, jobSvc, appSvc, subSvc, notifSvc, cfg.FrontendURL)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("ArcMilestone API listening on %s", server.Addr)
		err := server.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
			return
		}
		serverErrors <- nil
	}()

	// =====================================================
	// STEP 6: WAIT FOR A STOP SIGNAL
	// =====================================================
	shutdownSignal, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-serverErrors:
		if err != nil {
			log.Fatalf("HTTP server failed: %v", err)
		}
		return
	case <-shutdownSignal.Done():
		log.Print("shutdown signal received")
	}

	// =====================================================
	// STEP 7: SHUT DOWN GRACEFULLY
	// =====================================================
	shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
		return
	}

	if err := <-serverErrors; err != nil {
		log.Printf("HTTP server stopped with an error: %v", err)
		return
	}

	log.Print("ArcMilestone API stopped cleanly")
}
