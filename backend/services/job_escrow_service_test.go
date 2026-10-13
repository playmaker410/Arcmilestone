package services

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"arcmilestone/models"
	"arcmilestone/repositories"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestApplyEscrowEvent_TerminalTransitionsRejected(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	escrowsRepo := repositories.NewJobEscrowRepository(db)
	jobsRepo := repositories.NewJobRepository(db)
	svc := NewJobEscrowService(escrowsRepo, jobsRepo)

	ctx := context.Background()
	jobID := uint64(1)
	expectedChainID := uint64(5042002)
	txHash := "0xabc"
	logIndex := uint(0)

	cases := []struct {
		name          string
		currentEscrow string
		nextEscrow    string
	}{
		{"completed to refunded", "completed", "refunded"},
		{"refunded to completed", "refunded", "completed"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mock.ExpectBegin()
			mock.ExpectQuery("SELECT status FROM jobs WHERE id = \\? FOR UPDATE").
				WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("IN_PROGRESS"))
			mock.ExpectQuery("SELECT status FROM job_escrows WHERE job_id = \\? FOR UPDATE").
				WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow(tc.currentEscrow))
			
			// Replay protection insert succeeds
			mock.ExpectExec("INSERT IGNORE INTO processed_events \\(chain_id, transaction_hash, log_index\\) VALUES \\(\\?, \\?, \\?\\)").
				WithArgs(expectedChainID, txHash, logIndex).
				WillReturnResult(sqlmock.NewResult(1, 1))
			
			mock.ExpectRollback()

			err := svc.applyEscrowEvent(ctx, expectedChainID, jobID, txHash, logIndex, tc.nextEscrow, models.JobStatusCancelled)
			if err == nil || !strings.Contains(err.Error(), "invalid state transition: cannot move from terminal state") {
				t.Errorf("expected terminal state rejection, got %v", err)
			}
			
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("there were unfulfilled expectations: %s", err)
			}
		})
	}
}

func TestApplyEscrowEvent_BackwardTransitionRejected(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	escrowsRepo := repositories.NewJobEscrowRepository(db)
	jobsRepo := repositories.NewJobRepository(db)
	svc := NewJobEscrowService(escrowsRepo, jobsRepo)

	ctx := context.Background()
	jobID := uint64(1)

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT status FROM jobs WHERE id = \\? FOR UPDATE").
		WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("IN_PROGRESS"))
	mock.ExpectQuery("SELECT status FROM job_escrows WHERE job_id = \\? FOR UPDATE").
		WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("work_submitted"))
	
	// Replay protection insert succeeds
	mock.ExpectExec("INSERT IGNORE INTO processed_events \\(chain_id, transaction_hash, log_index\\) VALUES \\(\\?, \\?, \\?\\)").
		WithArgs(uint64(5042002), "0xabc", uint(0)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	mock.ExpectRollback()

	err = svc.applyEscrowEvent(ctx, 5042002, jobID, "0xabc", 0, "funded", models.JobStatusInProgress)
	if err == nil || !strings.Contains(err.Error(), "invalid state transition") {
		t.Errorf("expected backward state rejection, got %v", err)
	}
}

func TestApplyEscrowEvent_IdempotentReplaySafe(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	escrowsRepo := repositories.NewJobEscrowRepository(db)
	jobsRepo := repositories.NewJobRepository(db)
	svc := NewJobEscrowService(escrowsRepo, jobsRepo)

	ctx := context.Background()
	jobID := uint64(1)

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT status FROM jobs WHERE id = \\? FOR UPDATE").
		WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("COMPLETED"))
	mock.ExpectQuery("SELECT status FROM job_escrows WHERE job_id = \\? FOR UPDATE").
		WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("completed"))
	
	// Replay protection catches it (RowsAffected = 0)
	mock.ExpectExec("INSERT IGNORE INTO processed_events \\(chain_id, transaction_hash, log_index\\) VALUES \\(\\?, \\?, \\?\\)").
		WithArgs(uint64(5042002), "0xabc", uint(0)).
		WillReturnResult(sqlmock.NewResult(0, 0)) // 0 rows affected
	
	mock.ExpectRollback()

	err = svc.applyEscrowEvent(ctx, 5042002, jobID, "0xabc", 0, "completed", models.JobStatusCompleted)
	if err != nil {
		t.Errorf("expected success for idempotent replay, got %v", err)
	}
}

func TestApplyEscrowEvent_FailedUpdateRollsBack(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	escrowsRepo := repositories.NewJobEscrowRepository(db)
	jobsRepo := repositories.NewJobRepository(db)
	svc := NewJobEscrowService(escrowsRepo, jobsRepo)

	ctx := context.Background()
	jobID := uint64(1)

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT status FROM jobs WHERE id = \\? FOR UPDATE").
		WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("IN_PROGRESS"))
	mock.ExpectQuery("SELECT status FROM job_escrows WHERE job_id = \\? FOR UPDATE").
		WithArgs(jobID).WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("funded"))
	
	mock.ExpectExec("INSERT IGNORE INTO processed_events \\(chain_id, transaction_hash, log_index\\) VALUES \\(\\?, \\?, \\?\\)").
		WithArgs(uint64(5042002), "0xabc", uint(0)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	
	// Escrow update succeeds
	mock.ExpectExec("UPDATE job_escrows SET status = \\?, updated_at = NOW\\(\\) WHERE job_id = \\?").
		WithArgs("completed", jobID).
		WillReturnResult(sqlmock.NewResult(1, 1))

	// Job update fails
	mock.ExpectExec("UPDATE jobs SET status = \\? WHERE id = \\?").
		WithArgs(models.JobStatusCompleted, jobID).
		WillReturnError(fmt.Errorf("db error"))

	mock.ExpectRollback()

	err = svc.applyEscrowEvent(ctx, 5042002, jobID, "0xabc", 0, "completed", models.JobStatusCompleted)
	if err == nil || !strings.Contains(err.Error(), "update job: db error") {
		t.Errorf("expected error from failed update, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unfulfilled expectations: %s", err)
	}
}
