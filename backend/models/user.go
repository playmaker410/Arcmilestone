package models

import "time"

// User corresponds to one row in the users table. Wallet addresses are public
// identifiers only; wallet private keys and recovery phrases never belong here.
type User struct {
	ID            uint64    `json:"id"`
	Username      *string   `json:"username"`
	WalletAddress string    `json:"wallet_address"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
