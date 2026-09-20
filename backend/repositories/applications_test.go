package repositories

import (
	"reflect"
	"testing"
)

// TestCreateApplicationParamsHasNoProposedAmount verifies that
// CreateApplicationParams does not expose a ProposedAmount field.
// Freelancers apply for the job's fixed funded amount; they must not be able
// to submit a counter-amount through the repository layer.
func TestCreateApplicationParamsHasNoProposedAmount(t *testing.T) {
	paramsType := reflect.TypeOf(CreateApplicationParams{})
	for i := range paramsType.NumField() {
		if paramsType.Field(i).Name == "ProposedAmount" {
			t.Error("CreateApplicationParams must not contain ProposedAmount; the job's funded amount is the payment")
		}
	}
}

// TestCreateApplicationParamsRequiredFields verifies that the params struct
// contains the fields needed to record a v1 application.
func TestCreateApplicationParamsRequiredFields(t *testing.T) {
	required := []string{"JobID", "ApplicantUserID", "CoverLetter", "EstimatedDays"}
	paramsType := reflect.TypeOf(CreateApplicationParams{})
	names := make(map[string]bool, paramsType.NumField())
	for i := range paramsType.NumField() {
		names[paramsType.Field(i).Name] = true
	}
	for _, name := range required {
		if !names[name] {
			t.Errorf("CreateApplicationParams is missing required field %q", name)
		}
	}
}

// TestApplicationInsertSQLHasNoProposedAmount confirms that the INSERT
// statement in applicationColumns does not reference proposed_amount.
// This is a belt-and-suspenders check: if someone re-adds the column string
// the test will catch it before a live database rejects the query.
func TestApplicationInsertSQLHasNoProposedAmount(t *testing.T) {
	if contains(applicationColumns, "proposed_amount") {
		t.Error("applicationColumns must not include proposed_amount; the job's funded amount is used instead")
	}
}

// contains is a simple substring check used only in these tests to avoid
// importing the strings package just for one check.
func contains(s, sub string) bool {
	return len(s) >= len(sub) && func() bool {
		for i := range len(s) - len(sub) + 1 {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	}()
}
