// Package database owns database connection setup and lifecycle management.
package database

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"strings"
	"time"

	"arcmilestone/config"

	"github.com/go-sql-driver/mysql"
)

const (
	maxOpenConnections = 10
	maxIdleConnections = 5
	connectionMaxLife  = 30 * time.Minute
	connectionMaxIdle  = 5 * time.Minute
	pingTimeout        = 5 * time.Second
)

// Open creates a configured MySQL connection pool and verifies it before the
// API starts. sql.Open alone does not contact MySQL, so PingContext is required
// to fail startup early when the database is unavailable.
func Open(ctx context.Context, cfg config.DatabaseConfig) (*sql.DB, error) {
	dsn, err := BuildDSN(cfg)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("open MySQL connection pool: %w", err)
	}

	// These modest defaults suit local development and a small API. They avoid
	// unbounded connections while keeping a few connections ready for requests.
	db.SetMaxOpenConns(maxOpenConnections)
	db.SetMaxIdleConns(maxIdleConnections)
	db.SetConnMaxLifetime(connectionMaxLife)
	db.SetConnMaxIdleTime(connectionMaxIdle)

	pingContext, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()

	if err := db.PingContext(pingContext); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping MySQL database: %w", err)
	}

	return db, nil
}

// BuildDSN returns a driver-safe MySQL data source name without logging it.
// MYSQL_DSN is accepted as an optional compatibility override; otherwise the
// DSN is assembled from the individual DB_* environment variables.
func BuildDSN(cfg config.DatabaseConfig) (string, error) {
	if cfg.DSN != "" {
		driverConfig, err := mysql.ParseDSN(cfg.DSN)
		if err != nil {
			return "", fmt.Errorf("MYSQL_DSN is invalid")
		}

		driverConfig.ParseTime = true
		driverConfig.Loc = time.UTC
		return driverConfig.FormatDSN(), nil
	}

	missing := make([]string, 0, 3)
	if cfg.Host == "" {
		missing = append(missing, "DB_HOST")
	}
	if cfg.User == "" {
		missing = append(missing, "DB_USER")
	}
	if cfg.Name == "" {
		missing = append(missing, "DB_NAME")
	}
	if len(missing) > 0 {
		return "", fmt.Errorf(
			"database configuration is incomplete: set %s in the environment or backend/.env (or set MYSQL_DSN)",
			strings.Join(missing, ", "),
		)
	}

	tlsMode, err := mysqlTLSMode(cfg.SSLMode)
	if err != nil {
		return "", err
	}

	driverConfig := mysql.NewConfig()
	driverConfig.User = cfg.User
	driverConfig.Passwd = cfg.Password
	driverConfig.Net = "tcp"
	driverConfig.Addr = net.JoinHostPort(cfg.Host, cfg.Port)
	driverConfig.DBName = cfg.Name
	driverConfig.ParseTime = true
	driverConfig.Loc = time.UTC
	driverConfig.TLSConfig = tlsMode

	return driverConfig.FormatDSN(), nil
}

func mysqlTLSMode(mode string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", "disable", "disabled":
		return "false", nil
	case "preferred":
		return "preferred", nil
	case "require", "required":
		return "true", nil
	default:
		return "", fmt.Errorf("unsupported DB_SSL_MODE %q; use disable, preferred, or required", mode)
	}
}
