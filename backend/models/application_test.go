package models

import (
	"reflect"
	"testing"
)

// TestApplicationStructHasNoProposedAmount verifies that the Application struct
// does not contain a ProposedAmount field. The job's funded escrow amount is the
// final payment for v1; freelancers apply for the fixed amount and do not propose
// a counter-amount.
func TestApplicationStructHasNoProposedAmount(t *testing.T) {
	appType := reflect.TypeOf(Application{})
	for i := range appType.NumField() {
		field := appType.Field(i)
		if field.Name == "ProposedAmount" {
			t.Errorf("Application struct must not contain ProposedAmount field; found at index %d", i)
		}
		if tag := field.Tag.Get("json"); tag == "proposed_amount" {
			t.Errorf("Application struct must not have a json:\"proposed_amount\" tag; found on field %s", field.Name)
		}
	}
}

// TestApplicationStructHasRequiredFields verifies that the Application struct
// contains the fields that define v1 application data.
func TestApplicationStructHasRequiredFields(t *testing.T) {
	required := []string{"ID", "JobID", "ApplicantUserID", "CoverLetter", "EstimatedDays", "Status", "CreatedAt", "UpdatedAt"}
	appType := reflect.TypeOf(Application{})
	fieldNames := make(map[string]bool, appType.NumField())
	for i := range appType.NumField() {
		fieldNames[appType.Field(i).Name] = true
	}
	for _, name := range required {
		if !fieldNames[name] {
			t.Errorf("Application struct is missing required field %q", name)
		}
	}
}

// TestApplicationPortfolioURLIsOptional verifies that PortfolioURL is a pointer
// so it can be NULL in the database — the field is optional for freelancers.
func TestApplicationPortfolioURLIsOptional(t *testing.T) {
	appType := reflect.TypeOf(Application{})
	field, ok := appType.FieldByName("PortfolioURL")
	if !ok {
		t.Fatal("Application struct is missing PortfolioURL field")
	}
	if field.Type.Kind() != reflect.Ptr {
		t.Errorf("PortfolioURL must be a pointer (*string) to allow NULL; got %v", field.Type)
	}
}
