package models

import (
	"reflect"
	"testing"
)

// TestUserStructHasWalletAddress verifies that wallet_address is present in
// the User struct as the primary blockchain identity field.
func TestUserStructHasWalletAddress(t *testing.T) {
	userType := reflect.TypeOf(User{})
	field, ok := userType.FieldByName("WalletAddress")
	if !ok {
		t.Fatal("User struct is missing WalletAddress field")
	}
	if field.Type.Kind() != reflect.String {
		t.Errorf("WalletAddress must be a string; got %v", field.Type)
	}
	if tag := field.Tag.Get("json"); tag != "wallet_address" {
		t.Errorf("WalletAddress json tag = %q, want %q", tag, "wallet_address")
	}
}

// TestUserUsernameIsOptional verifies that username is a nullable pointer field.
// Username is not the authentication identity and must not be required for login.
func TestUserUsernameIsOptional(t *testing.T) {
	userType := reflect.TypeOf(User{})
	field, ok := userType.FieldByName("Username")
	if !ok {
		t.Fatal("User struct is missing Username field")
	}
	if field.Type.Kind() != reflect.Ptr {
		t.Errorf("Username must be *string so it can be NULL; got %v", field.Type)
	}
}

// TestUserHasNoPasswordField verifies that password-based authentication fields
// are absent from the User struct. ArcMilestone uses wallet-signature auth only.
func TestUserHasNoPasswordField(t *testing.T) {
	forbidden := []string{"Password", "PasswordHash", "PrivateKey", "SeedPhrase", "WalletNonce"}
	userType := reflect.TypeOf(User{})
	for i := range userType.NumField() {
		name := userType.Field(i).Name
		for _, bad := range forbidden {
			if name == bad {
				t.Errorf("User struct must not contain field %q; wallet-signature auth is used instead", bad)
			}
		}
	}
}


