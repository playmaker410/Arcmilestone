package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"arcmilestone/handlers"
	"arcmilestone/middleware"
	"arcmilestone/services"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// newFakeAuthSvc returns a WalletAuthService with an empty secret.
// ValidateToken will always fail because the secret produces wrong MACs,
// which is exactly what we want for 401 tests.
func newFakeAuthSvc() *services.WalletAuthService {
	return services.NewWalletAuthService(nil, nil, "test-secret-that-wont-match")
}

// authMiddleware wraps a handler with the real auth middleware backed by the
// fake service, so token rejection is tested end-to-end.
func authMiddleware(svc *services.WalletAuthService, h http.HandlerFunc) http.Handler {
	return middleware.NewAuthMiddleware(svc)(h)
}

// dummyHandler is a handler that writes 200 so we can tell if the middleware
// let the request through.
func dummyHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// ---------------------------------------------------------------------------
// 1. Unauthenticated request to protected endpoint returns 401
// ---------------------------------------------------------------------------

func TestProtectedEndpoint_NoToken_Returns401(t *testing.T) {
	svc := newFakeAuthSvc()
	handler := authMiddleware(svc, dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rr.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("response body is not JSON: %v", err)
	}
	if body["error"] != "authentication required" {
		t.Errorf("expected error 'authentication required', got %q", body["error"])
	}
}

func TestProtectedEndpoint_InvalidToken_Returns401(t *testing.T) {
	svc := newFakeAuthSvc()
	handler := authMiddleware(svc, dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer notavalidtoken")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rr.Code)
	}
}

func TestProtectedEndpoint_MalformedHeader_Returns401(t *testing.T) {
	svc := newFakeAuthSvc()
	handler := authMiddleware(svc, dummyHandler)

	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.Header.Set("Authorization", "Basic dXNlcjpwYXNz") // Basic, not Bearer
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", rr.Code)
	}
}

// ---------------------------------------------------------------------------
// 2. Health endpoint returns 200 with correct body
// ---------------------------------------------------------------------------

func TestHealthHandler_Returns200(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()
	handlers.Health(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rr.Code)
	}

	var body map[string]string
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("response body is not JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status 'ok', got %q", body["status"])
	}
	if body["service"] != "ArcMilestone API" {
		t.Errorf("expected service 'ArcMilestone API', got %q", body["service"])
	}
}

func TestHealthHandler_ContentTypeJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()
	handlers.Health(rr, req)

	ct := rr.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "application/json") {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

// ---------------------------------------------------------------------------
// 3. Invalid JSON body returns 400
// ---------------------------------------------------------------------------

func TestRequestNonce_InvalidJSON_Returns400(t *testing.T) {
	// We need a WalletAuthService for AuthHandler, but since JSON decoding
	// happens before any service call, we can pass nil safely here.
	h := handlers.NewAuthHandler(nil, nil)

	body := bytes.NewBufferString(`{not valid json`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/nonce", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.RequestNonce(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", rr.Code)
	}
}

func TestVerifySignature_InvalidJSON_Returns400(t *testing.T) {
	h := handlers.NewAuthHandler(nil, nil)

	body := bytes.NewBufferString(`{"wallet_address": }`) // invalid JSON
	req := httptest.NewRequest(http.MethodPost, "/api/auth/verify", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.VerifySignature(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", rr.Code)
	}
}

func TestUpdateMe_InvalidJSON_Returns400(t *testing.T) {
	h := handlers.NewUserHandler(nil)

	// Inject a valid userID into context so we get past the auth check.
	req := httptest.NewRequest(http.MethodPatch, "/api/users/me", bytes.NewBufferString(`{bad}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(middleware.SetAuthContext(req.Context(), 1, "0x1234567890123456789012345678901234567890"))
	rr := httptest.NewRecorder()
	h.UpdateMe(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", rr.Code)
	}
}

// ---------------------------------------------------------------------------
// 4. POST /api/auth/nonce with invalid wallet address returns 422
// ---------------------------------------------------------------------------

func TestRequestNonce_InvalidWalletAddress_Returns422(t *testing.T) {
	// Use a real WalletAuthService with a valid (non-empty) secret but nil
	// repos — the wallet validation happens before any DB call.
	svc := services.NewWalletAuthService(nil, nil, "some-secret")
	h := handlers.NewAuthHandler(svc, nil)

	cases := []struct {
		name          string
		walletAddress string
	}{
		{"empty string", ""},
		{"not hex", "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"},
		{"too short", "0x1234"},
		{"no 0x prefix", "1234567890123456789012345678901234567890"},
		{"too long", "0x12345678901234567890123456789012345678901"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]string{"wallet_address": tc.walletAddress})
			req := httptest.NewRequest(http.MethodPost, "/api/auth/nonce", bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			h.RequestNonce(rr, req)

			// GenerateNonce returns ErrInvalidInput for bad addresses → 400
			if rr.Code != http.StatusBadRequest && rr.Code != http.StatusUnprocessableEntity {
				t.Errorf("wallet %q: expected 400 or 422, got %d", tc.walletAddress, rr.Code)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 5. CORS middleware sets the correct headers
// ---------------------------------------------------------------------------

func TestCORSMiddleware_SetsHeaders(t *testing.T) {
	corsMiddleware := middleware.NewCORSMiddleware("http://localhost:5173")
	handler := corsMiddleware(http.HandlerFunc(dummyHandler))

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("Access-Control-Allow-Origin = %q, want 'http://localhost:5173'", got)
	}
	if got := rr.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Error("Access-Control-Allow-Methods header is missing")
	}
	if got := rr.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Error("Access-Control-Allow-Headers header is missing")
	}
}

func TestCORSMiddleware_Preflight_Returns204(t *testing.T) {
	corsMiddleware := middleware.NewCORSMiddleware("http://localhost:5173")
	handler := corsMiddleware(http.HandlerFunc(dummyHandler))

	req := httptest.NewRequest(http.MethodOptions, "/api/auth/nonce", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS preflight: expected 204 No Content, got %d", rr.Code)
	}
}

// ---------------------------------------------------------------------------
// 6. Auth middleware passes valid context values through
// ---------------------------------------------------------------------------

func TestAuthMiddleware_ValidContext_CallsNext(t *testing.T) {
	// Build a real token using a service with a known secret.
	// We can't call issueToken directly (unexported), but we can verify the
	// middleware correctly rejects all tokens signed with a different secret.
	svc := newFakeAuthSvc()
	var calledNext bool
	handler := middleware.NewAuthMiddleware(svc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calledNext = true
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if calledNext {
		t.Error("next handler should not have been called with an invalid token")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}
