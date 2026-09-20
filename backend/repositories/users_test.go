package repositories

import (
	"reflect"
	"testing"

	"arcmilestone/models"
)

// TestCreateUserParamsHasNoPasswordFields verifies that wallet creation params
// do not include any credential or secret fields. ArcMilestone uses wallet-
// signature authentication; passwords and key material must never be stored.
func TestCreateUserParamsHasNoPasswordFields(t *testing.T) {
	forbidden := []string{"Password", "PasswordHash", "PrivateKey", "SeedPhrase"}
	paramsType := reflect.TypeOf(CreateUserParams{})
	for i := range paramsType.NumField() {
		name := paramsType.Field(i).Name
		for _, bad := range forbidden {
			if name == bad {
				t.Errorf("CreateUserParams must not contain %q; wallet-signature auth is used instead", bad)
			}
		}
	}
}

// TestCreateUserParamsWalletAddressRequired verifies that WalletAddress is a
// non-pointer string — it is required and must not be nullable.
func TestCreateUserParamsWalletAddressRequired(t *testing.T) {
	paramsType := reflect.TypeOf(CreateUserParams{})
	field, ok := paramsType.FieldByName("WalletAddress")
	if !ok {
		t.Fatal("CreateUserParams is missing WalletAddress")
	}
	if field.Type.Kind() != reflect.String {
		t.Errorf("WalletAddress must be a non-pointer string (required); got %v", field.Type)
	}
}

// TestCreateUserParamsEmailIsOptional verifies that Email is a pointer so it
// can be omitted. Email is not the authentication identity.
func TestCreateUserParamsEmailIsOptional(t *testing.T) {
	paramsType := reflect.TypeOf(CreateUserParams{})
	field, ok := paramsType.FieldByName("Email")
	if !ok {
		t.Fatal("CreateUserParams is missing Email field")
	}
	if field.Type.Kind() != reflect.Ptr {
		t.Errorf("Email must be *string (optional); got %v", field.Type)
	}
}

// TestNormalizeWalletAddressLowercases verifies that wallet addresses are
// normalized to lowercase before any database operation. The UNIQUE constraint
// on wallet_address is case-sensitive (ascii_bin), so normalization must be
// consistent to prevent duplicate users from different address casings.
func TestNormalizeWalletAddressLowercases(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"0x71C4A6F2B8e90D3aE4217B6c9fD12A5e8C34091F", "0x71c4a6f2b8e90d3ae4217b6c9fd12a5e8c34091f"},
		{"0xABCDEF", "0xabcdef"},
		{"0xabcdef", "0xabcdef"},
		{"  0xABC  ", "0xabc"},
	}
	for _, tc := range tests {
		got := normalizeWalletAddress(tc.input)
		if got != tc.want {
			t.Errorf("normalizeWalletAddress(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

// TestDuplicateWalletAddressNormalization verifies that two different casings
// of the same wallet address normalize to identical strings. This is the
// application-level enforcement that backs the UNIQUE(wallet_address) constraint.
func TestDuplicateWalletAddressNormalization(t *testing.T) {
	addr1 := "0x71C4A6F2B8e90D3aE4217B6c9fD12A5e8C34091F"
	addr2 := "0x71c4a6f2b8e90d3ae4217b6c9fd12a5e8c34091f"
	if normalizeWalletAddress(addr1) != normalizeWalletAddress(addr2) {
		t.Error("same wallet address in different cases must normalize to the same string to prevent duplicate users")
	}
}

// TestUserModelWalletAddressUniquenessSemantics verifies the model field used
// as the unique identifier. The database UNIQUE constraint and the application
// normalization together guarantee one user per wallet address.
func TestUserModelWalletAddressUniquenessSemantics(t *testing.T) {
	userType := reflect.TypeOf(models.User{})
	field, ok := userType.FieldByName("WalletAddress")
	if !ok {
		t.Fatal("models.User is missing WalletAddress")
	}
	// Must be a required (non-pointer) string.
	if field.Type.Kind() != reflect.String {
		t.Errorf("WalletAddress must be a required non-pointer string; got %v", field.Type)
	}
}
