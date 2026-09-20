package models

import "time"

// AuthNonce corresponds to a hashed, expiring wallet-signature challenge.
type AuthNonce struct {
	ID        uint64     `json:"id"`
	UserID    uint64     `json:"user_id"`
	NonceHash string     `json:"nonce_hash"`
	ExpiresAt time.Time  `json:"expires_at"`
	UsedAt    *time.Time `json:"used_at"`
	CreatedAt time.Time  `json:"created_at"`
}
