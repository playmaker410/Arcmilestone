// Package apperr defines typed application errors that services return and
// handlers map to HTTP status codes. Keeping error semantics here avoids
// scattering status-code decisions across the service layer.
package apperr

import "errors"

// Sentinel errors that handlers compare with errors.Is / errors.As.
var (
	ErrNotFound       = errors.New("not found")
	ErrUnauthorized   = errors.New("unauthorized")
	ErrForbidden      = errors.New("forbidden")
	ErrConflict       = errors.New("conflict")
	ErrInvalidInput   = errors.New("invalid input")
	ErrExpiredNonce   = errors.New("nonce expired or already used")
	ErrBadSignature   = errors.New("signature verification failed")
	ErrInvalidState   = errors.New("invalid state transition")
	ErrDeadlinePassed = errors.New("deadline has passed")
)

// ValidationError wraps one or more field-level messages so handlers can
// render a structured JSON error body without exposing internal details.
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string { return "validation failed" }

// NewValidation returns a ValidationError with the supplied field→message pairs.
func NewValidation(fields map[string]string) *ValidationError {
	return &ValidationError{Fields: fields}
}
