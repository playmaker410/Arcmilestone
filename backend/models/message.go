package models

import "time"

// JobMessage is one entry in a job's private workspace thread between the
// client and the selected freelancer. System events (submissions, revision
// requests) are stored in the same thread so both sides see one timeline.
type JobMessage struct {
	ID             uint64    `json:"id"`
	JobID          uint64    `json:"job_id"`
	SenderUserID   *uint64   `json:"sender_user_id"`
	SenderRole     string    `json:"sender_role"`  // client | freelancer | system
	MessageType    string    `json:"message_type"` // message | revision_request | submission | system
	Body           string    `json:"body"`
	SenderUsername *string   `json:"sender_username"`
	SenderWallet   *string   `json:"sender_wallet"`
	CreatedAt      time.Time `json:"created_at"`
}

// EscrowEvent is an indexed on-chain escrow event shown on the Transactions page.
type EscrowEvent struct {
	ID              uint64    `json:"id"`
	JobID           uint64    `json:"job_id"`
	JobTitle        string    `json:"job_title"`
	EventType       string    `json:"event_type"`
	Amount          *string   `json:"amount"`
	TransactionHash string    `json:"transaction_hash"`
	BlockNumber     uint64    `json:"block_number"`
	Role            string    `json:"role"`
	CreatedAt       time.Time `json:"created_at"`
}

// Pagination describes a page of results.
type Pagination struct {
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

// NewPagination builds pagination metadata.
func NewPagination(page, limit, total int) Pagination {
	pages := 0
	if limit > 0 {
		pages = (total + limit - 1) / limit
	}
	return Pagination{Page: page, Limit: limit, Total: total, TotalPages: pages}
}
