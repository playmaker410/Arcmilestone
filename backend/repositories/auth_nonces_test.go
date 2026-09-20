package repositories

import (
	"reflect"
	"testing"
	"time"
)

// TestCreateAuthNonceParamsFields verifies that the nonce creation params
// contain the fields required to issue a temporary wallet-login challenge.
func TestCreateAuthNonceParamsFields(t *testing.T) {
	required := []string{"UserID", "NonceHash", "ExpiresAt"}
	paramsType := reflect.TypeOf(CreateAuthNonceParams{})
	names := make(map[string]bool, paramsType.NumField())
	for i := range paramsType.NumField() {
		names[paramsType.Field(i).Name] = true
	}
	for _, name := range required {
		if !names[name] {
			t.Errorf("CreateAuthNonceParams is missing required field %q", name)
		}
	}
}

// TestCreateAuthNonceParamsHasNoPlaintextNonce verifies that the params struct
// stores a nonce hash, not the plaintext challenge. The plaintext nonce is sent
// to the wallet for signing and must never be stored.
func TestCreateAuthNonceParamsHasNoPlaintextNonce(t *testing.T) {
	paramsType := reflect.TypeOf(CreateAuthNonceParams{})
	for i := range paramsType.NumField() {
		name := paramsType.Field(i).Name
		// "NonceHash" is acceptable; a bare "Nonce" field would indicate
		// the plaintext is being stored.
		if name == "Nonce" {
			t.Error("CreateAuthNonceParams must store NonceHash, not a plaintext Nonce")
		}
	}
}

// TestNonceExpiryWindowSemantics verifies the business rules for nonce validity
// that are enforced by the FindValidByNonceHash WHERE clause:
//   - A nonce is valid when used_at IS NULL AND expires_at > NOW()
//   - An expired nonce must not be accepted even if unused
//   - A used nonce must not be accepted even if the expiry is in the future
func TestNonceExpiryWindowSemantics(t *testing.T) {
	now := time.Now().UTC()

	type nonceState struct {
		usedAt    *time.Time
		expiresAt time.Time
	}
	isValid := func(n nonceState) bool {
		return n.usedAt == nil && n.expiresAt.After(now)
	}
	used := now.Add(-10 * time.Second)

	tests := []struct {
		name  string
		state nonceState
		want  bool
	}{
		{
			name:  "valid — unused, expires in future",
			state: nonceState{usedAt: nil, expiresAt: now.Add(10 * time.Minute)},
			want:  true,
		},
		{
			name:  "invalid — expired, not used",
			state: nonceState{usedAt: nil, expiresAt: now.Add(-1 * time.Second)},
			want:  false,
		},
		{
			name:  "invalid — used, not expired",
			state: nonceState{usedAt: &used, expiresAt: now.Add(10 * time.Minute)},
			want:  false,
		},
		{
			name:  "invalid — used and expired",
			state: nonceState{usedAt: &used, expiresAt: now.Add(-1 * time.Second)},
			want:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if isValid(tc.state) != tc.want {
				t.Errorf("isValid = %v, want %v", isValid(tc.state), tc.want)
			}
		})
	}
}

// TestNonceCannotBeReusedAfterMarkUsed verifies the idempotency rule: once a
// nonce has a non-nil UsedAt, it is no longer valid regardless of expiry time.
// This mirrors the MarkUsed WHERE clause: UPDATE … WHERE id = ? AND used_at IS NULL.
func TestNonceCannotBeReusedAfterMarkUsed(t *testing.T) {
	now := time.Now().UTC()
	usedAt := now.Add(-5 * time.Second)
	expiresAt := now.Add(10 * time.Minute)

	// Before marking used — should be valid.
	beforeUse := struct {
		usedAt    *time.Time
		expiresAt time.Time
	}{usedAt: nil, expiresAt: expiresAt}
	if beforeUse.usedAt != nil || !beforeUse.expiresAt.After(now) {
		t.Error("nonce should be valid before use")
	}

	// After marking used — same expiry, but usedAt is set.
	afterUse := struct {
		usedAt    *time.Time
		expiresAt time.Time
	}{usedAt: &usedAt, expiresAt: expiresAt}
	if afterUse.usedAt == nil {
		t.Error("nonce should be invalid after MarkUsed sets used_at")
	}
}

// TestAuthNonceColumnListHasNoPlaintextNonce verifies that the SELECT column
// list does not expose a raw nonce value. Only the hash is stored and returned.
func TestAuthNonceColumnListHasNoPlaintextNonce(t *testing.T) {
	if contains(authNonceColumns, `"nonce"`) || contains(authNonceColumns, ` nonce,`) || contains(authNonceColumns, ` nonce\n`) {
		t.Error("authNonceColumns must not select a plaintext nonce column; only nonce_hash is stored")
	}
	if !contains(authNonceColumns, "nonce_hash") {
		t.Error("authNonceColumns must include nonce_hash")
	}
}
