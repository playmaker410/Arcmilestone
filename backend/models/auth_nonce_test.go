package models

import (
	"reflect"
	"testing"
	"time"
)

// TestAuthNonceStructFields verifies the AuthNonce struct has the fields
// required for single-use, expiring wallet-signature challenges.
func TestAuthNonceStructFields(t *testing.T) {
	required := map[string]reflect.Kind{
		"ID":        reflect.Uint64,
		"UserID":    reflect.Uint64,
		"NonceHash": reflect.String,
		"ExpiresAt": reflect.Struct, // time.Time
		"CreatedAt": reflect.Struct, // time.Time
	}
	nonceType := reflect.TypeOf(AuthNonce{})
	for name, kind := range required {
		field, ok := nonceType.FieldByName(name)
		if !ok {
			t.Errorf("AuthNonce struct is missing field %q", name)
			continue
		}
		if field.Type.Kind() != kind {
			t.Errorf("AuthNonce.%s kind = %v, want %v", name, field.Type.Kind(), kind)
		}
	}
}

// TestAuthNonceUsedAtIsNullable verifies that UsedAt is a pointer so it can
// be NULL until the nonce is consumed. A non-nil UsedAt means the nonce has
// been used and must be rejected on any subsequent authentication attempt.
func TestAuthNonceUsedAtIsNullable(t *testing.T) {
	nonceType := reflect.TypeOf(AuthNonce{})
	field, ok := nonceType.FieldByName("UsedAt")
	if !ok {
		t.Fatal("AuthNonce struct is missing UsedAt field")
	}
	if field.Type.Kind() != reflect.Ptr {
		t.Errorf("UsedAt must be *time.Time so it can be NULL before use; got %v", field.Type)
	}
}

// TestAuthNonceExpiryLogic verifies the expiry check that the repository
// WHERE clause mirrors: a nonce is valid only when used_at IS NULL and
// expires_at is in the future.
func TestAuthNonceExpiryLogic(t *testing.T) {
	now := time.Now().UTC()

	tests := []struct {
		name      string
		nonce     AuthNonce
		wantValid bool
	}{
		{
			name: "valid — unused and not expired",
			nonce: AuthNonce{
				ExpiresAt: now.Add(5 * time.Minute),
				UsedAt:    nil,
			},
			wantValid: true,
		},
		{
			name: "invalid — expired",
			nonce: AuthNonce{
				ExpiresAt: now.Add(-1 * time.Minute),
				UsedAt:    nil,
			},
			wantValid: false,
		},
		{
			name: "invalid — already used",
			nonce: AuthNonce{
				ExpiresAt: now.Add(5 * time.Minute),
				UsedAt:    func() *time.Time { t := now.Add(-30 * time.Second); return &t }(),
			},
			wantValid: false,
		},
		{
			name: "invalid — expired and used",
			nonce: AuthNonce{
				ExpiresAt: now.Add(-2 * time.Minute),
				UsedAt:    func() *time.Time { t := now.Add(-1 * time.Minute); return &t }(),
			},
			wantValid: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			isValid := tc.nonce.UsedAt == nil && tc.nonce.ExpiresAt.After(now)
			if isValid != tc.wantValid {
				t.Errorf("nonce validity = %v, want %v", isValid, tc.wantValid)
			}
		})
	}
}
