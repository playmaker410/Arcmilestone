// Package config loads application settings from environment variables.
package config

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// DatabaseConfig contains the connection settings required by the MySQL layer.
// Passwords come only from environment variables and are never logged.
type DatabaseConfig struct {
	// DSN keeps compatibility with the original MYSQL_DSN setting. When it is
	// empty, the database package builds a DSN from the individual DB_* values.
	DSN      string
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

// Config contains the settings needed by the API now and by planned services.
// Secrets are read from the environment and must never be hardcoded here.
type Config struct {
	Port               string
	Database           DatabaseConfig
	FrontendURL        string
	ArcRPCURL          string
	ArcContractAddress string
	AuthSecret         string
}

// Load reads an optional local .env file and then reads process environment
// variables. Explicitly exported variables always take precedence over .env.
func Load() (Config, error) {
	if err := loadEnvFile(".env"); err != nil {
		return Config{}, err
	}

	return loadFromEnvironment(), nil
}

// loadFromEnvironment keeps the mapping from environment variables to Config
// separate from file loading so it is easy to test without a real .env file.
func loadFromEnvironment() Config {
	return Config{
		Port: valueOrDefault("PORT", "8080"),
		Database: DatabaseConfig{
			DSN:      os.Getenv("MYSQL_DSN"),
			Host:     valueOrDefault("DB_HOST", "127.0.0.1"),
			Port:     valueOrDefault("DB_PORT", "3306"),
			User:     os.Getenv("DB_USER"),
			Password: os.Getenv("DB_PASSWORD"),
			Name:     valueOrDefault("DB_NAME", "arcmilestone"),
			SSLMode:  valueOrDefault("DB_SSL_MODE", "disable"),
		},
		FrontendURL:        valueOrDefault("FRONTEND_URL", "http://localhost:5173"),
		ArcRPCURL:          os.Getenv("ARC_RPC_URL"),
		ArcContractAddress: os.Getenv("ARC_CONTRACT_ADDRESS"),
		AuthSecret:         os.Getenv("AUTH_SECRET"),
	}
}

// loadEnvFile supports the small KEY=value format used by .env.example. It is
// intentionally optional: deployment environments can supply variables directly.
func loadEnvFile(path string) error {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for lineNumber := 1; scanner.Scan(); lineNumber++ {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}

		key, value, found := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !found || key == "" {
			return fmt.Errorf("read %s: invalid entry on line %d", path, lineNumber)
		}

		value, err = unquoteEnvValue(strings.TrimSpace(value))
		if err != nil {
			return fmt.Errorf("read %s: invalid quoted value on line %d", path, lineNumber)
		}

		// Do not replace values deliberately supplied by the shell, container, or
		// deployment platform. This makes .env a local convenience only.
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("read %s: invalid variable name on line %d", path, lineNumber)
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}

	return nil
}

func unquoteEnvValue(value string) (string, error) {
	if len(value) < 2 {
		return value, nil
	}

	if value[0] == '\'' && value[len(value)-1] == '\'' {
		return value[1 : len(value)-1], nil
	}
	if value[0] == '"' {
		return strconv.Unquote(value)
	}

	return value, nil
}

func valueOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}

	return fallback
}
