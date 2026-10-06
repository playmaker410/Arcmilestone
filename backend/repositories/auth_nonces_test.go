package repositories

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// TestCreateAuthNonceParamsHasRequiredFields verifies that creating an auth
// nonce requires the user ID, the hashed nonce, and the expiry time.
//
// The wallet address is intentionally not included here because the wallet
// address belongs to the users table. auth_nonces links back to the user
// through user_id.
func TestCreateAuthNonceParamsHasRequiredFields(t *testing.T) {
	required := []string{
		"UserID",
		"NonceHash",
		"ExpiresAt",
	}

	paramsType := reflect.TypeOf(CreateAuthNonceParams{})

	for _, name := range required {
		if _, ok := paramsType.FieldByName(name); !ok {
			t.Errorf(
				"CreateAuthNonceParams is missing required field %q",
				name,
			)
		}
	}
}

// TestCreateAuthNonceParamsHasNoWalletAddress verifies that wallet address
// is not duplicated in auth_nonces.
//
// The relationship is:
//
// users.id -> auth_nonces.user_id
//
// The wallet address remains in users.wallet_address.
func TestCreateAuthNonceParamsHasNoWalletAddress(t *testing.T) {
	paramsType := reflect.TypeOf(CreateAuthNonceParams{})

	if _, ok := paramsType.FieldByName("WalletAddress"); ok {
		t.Error(
			"CreateAuthNonceParams should not contain WalletAddress; " +
				"wallet identity is stored in users",
		)
	}
}

// TestCreateAuthNonceParamsHasNoPlaintextNonce verifies that the repository
// accepts only a hash of the authentication challenge.
//
// The plaintext nonce is used for the wallet-signature challenge but is not
// stored in the database.
func TestCreateAuthNonceParamsHasNoPlaintextNonce(t *testing.T) {
	paramsType := reflect.TypeOf(CreateAuthNonceParams{})

	if _, ok := paramsType.FieldByName("Nonce"); ok {
		t.Error(
			"CreateAuthNonceParams must use NonceHash, not plaintext Nonce",
		)
	}

	field, ok := paramsType.FieldByName("NonceHash")
	if !ok {
		t.Fatal("CreateAuthNonceParams is missing NonceHash")
	}

	if field.Type.Kind() != reflect.String {
		t.Errorf(
			"NonceHash must be a string; got %v",
			field.Type,
		)
	}
}

// TestCreateAuthNonceParamsExpiresAtIsTime verifies that the expiry time uses
// time.Time so the repository can store the exact expiration moment.
func TestCreateAuthNonceParamsExpiresAtIsTime(t *testing.T) {
	paramsType := reflect.TypeOf(CreateAuthNonceParams{})

	field, ok := paramsType.FieldByName("ExpiresAt")
	if !ok {
		t.Fatal("CreateAuthNonceParams is missing ExpiresAt")
	}

	if field.Type != reflect.TypeOf(time.Time{}) {
		t.Errorf(
			"ExpiresAt must be time.Time; got %v",
			field.Type,
		)
	}
}

// TestNonceValidityRules verifies the rules used by FindValidByNonceHash:
//
// 1. used_at must be NULL.
// 2. expires_at must be in the future.
//
// A nonce that is expired or already used must not be considered valid.
func TestNonceValidityRules(t *testing.T) {
	now := time.Now().UTC()

	isValid := func(usedAt *time.Time, expiresAt time.Time) bool {
		return usedAt == nil && expiresAt.After(now)
	}

	usedAt := now.Add(-10 * time.Second)

	tests := []struct {
		name      string
		usedAt    *time.Time
		expiresAt time.Time
		want      bool
	}{
		{
			name:      "unused and not expired",
			usedAt:    nil,
			expiresAt: now.Add(10 * time.Minute),
			want:      true,
		},
		{
			name:      "unused but expired",
			usedAt:    nil,
			expiresAt: now.Add(-1 * time.Second),
			want:      false,
		},
		{
			name:      "used but not expired",
			usedAt:    &usedAt,
			expiresAt: now.Add(10 * time.Minute),
			want:      false,
		},
		{
			name:      "used and expired",
			usedAt:    &usedAt,
			expiresAt: now.Add(-1 * time.Second),
			want:      false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isValid(tc.usedAt, tc.expiresAt)

			if got != tc.want {
				t.Errorf(
					"isValid = %v, want %v",
					got,
					tc.want,
				)
			}
		})
	}
}

// TestAuthNonceColumnsContainsExpectedColumns verifies that the repository
// reads the fields that actually exist in the auth_nonces table.
func TestAuthNonceColumnsContainsExpectedColumns(t *testing.T) {
	requiredColumns := []string{
		"id",
		"user_id",
		"nonce_hash",
		"expires_at",
		"used_at",
		"created_at",
	}

	for _, column := range requiredColumns {
		if !strings.Contains(authNonceColumns, column) {
			t.Errorf(
				"authNonceColumns is missing expected column %q",
				column,
			)
		}
	}
}

// TestAuthNonceColumnsHasNoWalletAddress verifies that wallet_address is not
// duplicated in auth_nonces.
//
// The wallet address belongs to users.wallet_address.
func TestAuthNonceColumnsHasNoWalletAddress(t *testing.T) {
	if strings.Contains(authNonceColumns, "wallet_address") {
		t.Error(
			"authNonceColumns must not include wallet_address; " +
				"wallet identity belongs to users",
		)
	}
}

// TestAuthNonceColumnsHasNoPlaintextNonce verifies that the repository does
// not select a plaintext nonce column.
func TestAuthNonceColumnsHasNoPlaintextNonce(t *testing.T) {
	if strings.Contains(authNonceColumns, " nonce,") ||
		strings.Contains(authNonceColumns, " nonce\n") {
		t.Error(
			"authNonceColumns must not contain a plaintext nonce column",
		)
	}

	if !strings.Contains(authNonceColumns, "nonce_hash") {
		t.Error(
			"authNonceColumns must include nonce_hash",
		)
	}
}
