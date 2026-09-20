// Package utils contains small helpers shared across API packages.
package utils

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"arcmilestone/apperr"
)

// errorBody is the standard JSON error envelope.
type errorBody struct {
	Error  string            `json:"error"`
	Fields map[string]string `json:"fields,omitempty"`
}

// WriteJSON writes an HTTP status code and a JSON response body.
func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// WriteError maps an application error to an appropriate HTTP status and writes
// a safe JSON error body. Internal/unexpected errors are logged server-side and
// returned to the client as a generic 500 without internal detail.
func WriteError(w http.ResponseWriter, err error) {
	var ve *apperr.ValidationError
	switch {
	case errors.As(err, &ve):
		WriteJSON(w, http.StatusUnprocessableEntity, errorBody{
			Error:  "validation failed",
			Fields: ve.Fields,
		})
	case errors.Is(err, apperr.ErrNotFound):
		WriteJSON(w, http.StatusNotFound, errorBody{Error: "not found"})
	case errors.Is(err, apperr.ErrUnauthorized):
		WriteJSON(w, http.StatusUnauthorized, errorBody{Error: "authentication required"})
	case errors.Is(err, apperr.ErrForbidden):
		WriteJSON(w, http.StatusForbidden, errorBody{Error: "forbidden"})
	case errors.Is(err, apperr.ErrConflict):
		WriteJSON(w, http.StatusConflict, errorBody{Error: "conflict"})
	case errors.Is(err, apperr.ErrExpiredNonce):
		WriteJSON(w, http.StatusUnauthorized, errorBody{Error: "nonce expired or already used"})
	case errors.Is(err, apperr.ErrBadSignature):
		WriteJSON(w, http.StatusUnauthorized, errorBody{Error: "signature verification failed"})
	case errors.Is(err, apperr.ErrInvalidInput):
		WriteJSON(w, http.StatusBadRequest, errorBody{Error: err.Error()})
	case errors.Is(err, apperr.ErrInvalidState):
		WriteJSON(w, http.StatusConflict, errorBody{Error: err.Error()})
	case errors.Is(err, apperr.ErrDeadlinePassed):
		WriteJSON(w, http.StatusConflict, errorBody{Error: err.Error()})
	default:
		log.Printf("internal error: %v", err)
		WriteJSON(w, http.StatusInternalServerError, errorBody{Error: "internal server error"})
	}
}
