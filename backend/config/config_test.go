package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReadsDatabaseEnvironment(t *testing.T) {
	t.Setenv("MYSQL_DSN", "")
	t.Setenv("DB_HOST", "db.internal")
	t.Setenv("DB_PORT", "3307")
	t.Setenv("DB_USER", "app_user")
	t.Setenv("DB_NAME", "arcmilestone_test")
	t.Setenv("DB_SSL_MODE", "required")

	cfg := loadFromEnvironment()

	if cfg.Database.Host != "db.internal" || cfg.Database.Port != "3307" {
		t.Errorf("database host/port = %q/%q", cfg.Database.Host, cfg.Database.Port)
	}
	if cfg.Database.User != "app_user" || cfg.Database.Name != "arcmilestone_test" {
		t.Errorf("database user/name = %q/%q", cfg.Database.User, cfg.Database.Name)
	}
	if cfg.Database.SSLMode != "required" {
		t.Errorf("database SSL mode = %q, want %q", cfg.Database.SSLMode, "required")
	}
}

func TestLoadEnvFileUsesFileValuesWithoutOverwritingProcessValues(t *testing.T) {
	const fileOnlyKey = "ARCMILESTONE_CONFIG_FILE_ONLY"
	const processKey = "ARCMILESTONE_CONFIG_PROCESS_VALUE"

	previousValue, wasSet := os.LookupEnv(fileOnlyKey)
	if err := os.Unsetenv(fileOnlyKey); err != nil {
		t.Fatalf("Unsetenv() error = %v", err)
	}
	t.Cleanup(func() {
		if wasSet {
			_ = os.Setenv(fileOnlyKey, previousValue)
			return
		}
		_ = os.Unsetenv(fileOnlyKey)
	})
	t.Setenv(processKey, "from-process")

	path := filepath.Join(t.TempDir(), ".env")
	contents := fileOnlyKey + "=from-file\n" + processKey + "=from-file\n"
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	if err := loadEnvFile(path); err != nil {
		t.Fatalf("loadEnvFile() error = %v", err)
	}
	if value := os.Getenv(fileOnlyKey); value != "from-file" {
		t.Errorf("file-only value = %q, want %q", value, "from-file")
	}
	if value := os.Getenv(processKey); value != "from-process" {
		t.Errorf("process value = %q, want %q", value, "from-process")
	}
}
