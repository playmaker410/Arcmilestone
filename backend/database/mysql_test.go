package database

import (
	"testing"
	"time"

	"arcmilestone/config"

	"github.com/go-sql-driver/mysql"
)

func TestBuildDSNFromDatabaseConfig(t *testing.T) {
	dsn, err := BuildDSN(config.DatabaseConfig{
		Host:    "127.0.0.1",
		Port:    "3306",
		User:    "app_user",
		Name:    "arcmilestone",
		SSLMode: "required",
	})
	if err != nil {
		t.Fatalf("BuildDSN() error = %v", err)
	}

	parsed, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("mysql.ParseDSN() error = %v", err)
	}

	if parsed.Addr != "127.0.0.1:3306" {
		t.Errorf("Addr = %q, want %q", parsed.Addr, "127.0.0.1:3306")
	}
	if parsed.User != "app_user" {
		t.Errorf("User = %q, want %q", parsed.User, "app_user")
	}
	if parsed.DBName != "arcmilestone" {
		t.Errorf("DBName = %q, want %q", parsed.DBName, "arcmilestone")
	}
	if !parsed.ParseTime || parsed.Loc != time.UTC {
		t.Errorf("ParseTime/Loc = %t/%v, want true/UTC", parsed.ParseTime, parsed.Loc)
	}
	if parsed.TLSConfig != "true" {
		t.Errorf("TLSConfig = %q, want %q", parsed.TLSConfig, "true")
	}
}

func TestBuildDSNRejectsIncompleteOrUnsupportedConfiguration(t *testing.T) {
	tests := []struct {
		name string
		cfg  config.DatabaseConfig
	}{
		{
			name: "missing host",
			cfg: config.DatabaseConfig{
				User: "app_user",
				Name: "arcmilestone",
			},
		},
		{
			name: "unsupported TLS mode",
			cfg: config.DatabaseConfig{
				Host:    "127.0.0.1",
				Port:    "3306",
				User:    "app_user",
				Name:    "arcmilestone",
				SSLMode: "verify-ca",
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := BuildDSN(test.cfg); err == nil {
				t.Fatal("BuildDSN() error = nil, want configuration error")
			}
		})
	}
}
