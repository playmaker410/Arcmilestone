package repositories

import (
	"reflect"
	"testing"

	"arcmilestone/models"
)

// TestCreateUserParamsHasNoCredentials verifies that creating a user
// does not require or accept passwords, private keys, or seed phrases.
//
// ArcMilestone uses wallet-signature authentication instead of passwords.
func TestCreateUserParamsHasNoCredentials(t *testing.T) {
	forbidden := []string{
		"Password",
		"PasswordHash",
		"PrivateKey",
		"SeedPhrase",
	}

	paramsType := reflect.TypeOf(CreateUserParams{})

	for i := 0; i < paramsType.NumField(); i++ {
		fieldName := paramsType.Field(i).Name

		for _, forbiddenName := range forbidden {
			if fieldName == forbiddenName {
				t.Errorf(
					"CreateUserParams must not contain %q",
					forbiddenName,
				)
			}
		}
	}
}

// TestCreateUserParamsRequiresWalletAddress verifies that WalletAddress
// exists and is a required string.
//
// Username is intentionally not part of CreateUserParams because a new user
// chooses a username later from the dashboard.
func TestCreateUserParamsRequiresWalletAddress(t *testing.T) {
	paramsType := reflect.TypeOf(CreateUserParams{})

	field, ok := paramsType.FieldByName("WalletAddress")
	if !ok {
		t.Fatal("CreateUserParams is missing WalletAddress")
	}

	if field.Type.Kind() != reflect.String {
		t.Errorf(
			"WalletAddress must be a non-pointer string; got %v",
			field.Type,
		)
	}
}

// TestCreateUserParamsDoesNotContainUsername verifies that username is not
// required when the wallet account is first created.
//
// The intended flow is:
// wallet connects -> user is created -> username is chosen later.
func TestCreateUserParamsDoesNotContainUsername(t *testing.T) {
	paramsType := reflect.TypeOf(CreateUserParams{})

	if _, ok := paramsType.FieldByName("Username"); ok {
		t.Error(
			"CreateUserParams should not contain Username; " +
				"username is set later from the dashboard",
		)
	}
}

// TestUpdateUsernameParamsRequiresUsername verifies that username is the
// field accepted when updating a user's username.
func TestUpdateUsernameParamsRequiresUsername(t *testing.T) {
	paramsType := reflect.TypeOf(UpdateUsernameParams{})

	field, ok := paramsType.FieldByName("Username")
	if !ok {
		t.Fatal("UpdateUsernameParams is missing Username")
	}

	if field.Type.Kind() != reflect.String {
		t.Errorf(
			"Username must be a string; got %v",
			field.Type,
		)
	}
}

// TestNormalizeWalletAddress verifies that wallet addresses are normalized
// consistently before they are stored or searched.
func TestNormalizeWalletAddress(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "uppercase address",
			input: "0xABCDEF",
			want:  "0xabcdef",
		},
		{
			name:  "already lowercase",
			input: "0xabcdef",
			want:  "0xabcdef",
		},
		{
			name:  "address with spaces",
			input: "  0xABCDEF  ",
			want:  "0xabcdef",
		},
		{
			name:  "mixed case address",
			input: "0x71C4A6F2B8e90D3aE4217B6c9fD12A5e8C34091F",
			want:  "0x71c4a6f2b8e90d3ae4217b6c9fd12a5e8c34091f",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeWalletAddress(tt.input)

			if got != tt.want {
				t.Errorf(
					"normalizeWalletAddress(%q) = %q, want %q",
					tt.input,
					got,
					tt.want,
				)
			}
		})
	}
}

// TestSameWalletAddressNormalizesTheSame verifies that the same wallet
// address written with different casing produces the same stored/search value.
func TestSameWalletAddressNormalizesTheSame(t *testing.T) {
	addr1 := "0x71C4A6F2B8e90D3aE4217B6c9fD12A5e8C34091F"
	addr2 := "0x71c4a6f2b8e90d3ae4217b6c9fd12a5e8c34091f"

	got1 := normalizeWalletAddress(addr1)
	got2 := normalizeWalletAddress(addr2)

	if got1 != got2 {
		t.Errorf(
			"same wallet address should normalize to the same value: %q != %q",
			got1,
			got2,
		)
	}
}

// TestUserModelHasWalletAddress verifies that the User model contains the
// wallet address used as the user's wallet identity.
func TestUserModelHasWalletAddress(t *testing.T) {
	userType := reflect.TypeOf(models.User{})

	field, ok := userType.FieldByName("WalletAddress")
	if !ok {
		t.Fatal("models.User is missing WalletAddress")
	}

	if field.Type.Kind() != reflect.String {
		t.Errorf(
			"WalletAddress must be a non-pointer string; got %v",
			field.Type,
		)
	}
}
