package services

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"golang.org/x/crypto/sha3"

	"arcmilestone/apperr"
	"arcmilestone/models"
	"arcmilestone/repositories"
)

const (
	// nonceExpiry is how long the frontend has to sign the challenge before it expires.
	nonceExpiry = 10 * time.Minute
	// tokenExpiry controls how long a session JWT remains valid.
	tokenExpiry = 24 * time.Hour
	// nonceByteLength is the entropy size of the random nonce value.
	nonceByteLength = 32
)

// WalletAuthService handles nonce generation, signature verification,
// user find-or-create, and session token issuance.
//
// The user's private key never enters this service. Only the public wallet
// address and the signature produced by the external wallet are received.
type WalletAuthService struct {
	users      *repositories.UserRepository
	nonces     *repositories.AuthNonceRepository
	authSecret string
}

// NewWalletAuthService constructs the service with the dependencies it needs.
func NewWalletAuthService(
	users *repositories.UserRepository,
	nonces *repositories.AuthNonceRepository,
	authSecret string,
) *WalletAuthService {
	return &WalletAuthService{
		users:      users,
		nonces:     nonces,
		authSecret: authSecret,
	}
}

// GenerateNonceResult is the response for a successful nonce request.
type GenerateNonceResult struct {
	// Nonce is the plaintext challenge the frontend must pass to the wallet for signing.
	Nonce string `json:"nonce"`
	// ExpiresAt tells the frontend when the challenge becomes invalid.
	ExpiresAt time.Time `json:"expires_at"`
}

// GenerateNonce creates a random plaintext challenge, stores only its SHA-256
// hash, and returns the plaintext so the frontend can send it to the wallet.
func (s *WalletAuthService) GenerateNonce(ctx context.Context, walletAddress string) (*GenerateNonceResult, error) {
	walletAddress = normalizeAddress(walletAddress)
	if !isValidEVMAddress(walletAddress) {
		return nil, fmt.Errorf("%w: wallet address must be a 42-character 0x-prefixed hex string", apperr.ErrInvalidInput)
	}

	// Find or create a user so the nonce can reference their internal ID.
	user, err := s.findOrCreateUser(ctx, walletAddress)
	if err != nil {
		return nil, fmt.Errorf("generate nonce: find or create user: %w", err)
	}

	// Generate cryptographically random plaintext nonce bytes.
	raw := make([]byte, nonceByteLength)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("generate nonce: random bytes: %w", err)
	}
	plaintext := hex.EncodeToString(raw)

	// Store only the hash of the nonce, never the plaintext.
	hash := sha256.Sum256([]byte(plaintext))
	nonceHash := hex.EncodeToString(hash[:])

	expiresAt := time.Now().UTC().Add(nonceExpiry)
	_, err = s.nonces.Create(ctx, repositories.CreateAuthNonceParams{
		UserID:    user.ID,
		NonceHash: nonceHash,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return nil, fmt.Errorf("generate nonce: store nonce: %w", err)
	}

	return &GenerateNonceResult{
		Nonce:     plaintext,
		ExpiresAt: expiresAt,
	}, nil
}

// VerifySignatureResult is the response for a successful signature verification.
type VerifySignatureResult struct {
	Token string       `json:"token"`
	User  *models.User `json:"user"`
}

// VerifySignature verifies an EIP-191 personal_sign signature, marks the nonce
// used, and returns a session token. It never stores the private key or the
// plaintext nonce beyond the duration of this call.
func (s *WalletAuthService) VerifySignature(ctx context.Context, walletAddress, nonce, signature string) (*VerifySignatureResult, error) {
	walletAddress = normalizeAddress(walletAddress)
	if !isValidEVMAddress(walletAddress) {
		return nil, fmt.Errorf("%w: wallet address must be a 42-character 0x-prefixed hex string", apperr.ErrInvalidInput)
	}

	// Locate the valid nonce by hash. FindValidByNonceHash already requires
	// used_at IS NULL and expires_at > UTC_TIMESTAMP(6), preventing replay and expiry bypass.
	hash := sha256.Sum256([]byte(nonce))
	nonceHash := hex.EncodeToString(hash[:])

	storedNonce, err := s.nonces.FindValidByNonceHash(ctx, nonceHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperr.ErrExpiredNonce
	}
	if err != nil {
		return nil, fmt.Errorf("verify signature: find nonce: %w", err)
	}

	// The nonce must belong to the user whose wallet signed it.
	user, err := s.users.FindByID(ctx, storedNonce.UserID)
	if err != nil {
		return nil, fmt.Errorf("verify signature: find user: %w", err)
	}
	if user.WalletAddress != walletAddress {
		return nil, apperr.ErrBadSignature
	}

	// Recover the signer from the EIP-191 personal_sign message and signature.
	recovered, err := recoverAddress(nonce, signature)
	if err != nil {
		return nil, apperr.ErrBadSignature
	}
	if recovered != walletAddress {
		return nil, apperr.ErrBadSignature
	}

	// Mark the nonce used immediately so it cannot be replayed.
	if err := s.nonces.MarkUsed(ctx, storedNonce.ID, time.Now().UTC()); err != nil {
		return nil, fmt.Errorf("verify signature: mark nonce used: %w", err)
	}

	// Issue a session token.
	token, err := s.issueToken(user.ID, user.WalletAddress)
	if err != nil {
		return nil, fmt.Errorf("verify signature: issue token: %w", err)
	}

	return &VerifySignatureResult{
		Token: token,
		User:  user,
	}, nil
}

// ValidateToken parses and verifies a session token and returns the user ID
// and wallet address it carries if the signature is valid and the token has
// not expired.
func (s *WalletAuthService) ValidateToken(token string) (userID uint64, walletAddress string, err error) {
	userID, walletAddress, err = parseToken(token, s.authSecret)
	if err != nil {
		return 0, "", apperr.ErrUnauthorized
	}
	return userID, walletAddress, nil
}

// ===========================================================================
// INTERNAL HELPERS
// ===========================================================================

// findOrCreateUser returns an existing user for the wallet address or creates
// one if this is the first login from this address.
func (s *WalletAuthService) findOrCreateUser(ctx context.Context, walletAddress string) (*models.User, error) {
	user, err := s.users.FindByWalletAddress(ctx, walletAddress)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// First time this wallet has connected — create an account.
	id, err := s.users.Create(ctx, repositories.CreateUserParams{
		WalletAddress: walletAddress,
	})
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	return s.users.FindByID(ctx, id)
}

// recoverAddress reconstructs the wallet address that signed the EIP-191
// personal_sign message containing nonce.
func recoverAddress(nonce, hexSig string) (string, error) {
	// Build the EIP-191 prefixed message: "\x19Ethereum Signed Message:\n" + len + message
	message := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(nonce), nonce)
	msgHash := keccak256([]byte(message))

	// Decode signature bytes.
	hexSig = strings.TrimPrefix(hexSig, "0x")
	sigBytes, err := hex.DecodeString(hexSig)
	if err != nil || len(sigBytes) != 65 {
		return "", fmt.Errorf("invalid signature encoding")
	}

	// Ethereum's v byte is 27 or 28; normalize to 0 or 1 for secp256k1.
	v := sigBytes[64]

	if v >= 27 {
		v -= 27
	}
	if v != 0 && v != 1 {
		return "", fmt.Errorf("invalid signature v value")
	}

	// Reconstruct the compact signature [V || R || S] expected by secp256k1.
	compactSig := make([]byte, 65)
	copy(compactSig[1:], sigBytes[:64])
	compactSig[0] = v + 27 // secp256k1 library compact format uses 27/28

	// Recover the public key.
	pubKey, _, err := ecdsa.RecoverCompact(compactSig, msgHash)
	if err != nil {
		return "", fmt.Errorf("recover public key: %w", err)
	}

	// Derive the Ethereum address: keccak256(pubkey[1:])[12:]
	uncompressed := pubKey.SerializeUncompressed() // 65 bytes: 0x04 || X || Y
	addrHash := keccak256(uncompressed[1:])        // hash of X||Y
	addr := "0x" + hex.EncodeToString(addrHash[12:])
	return strings.ToLower(addr), nil
}

// keccak256 returns the Keccak-256 hash of data.
func keccak256(data []byte) []byte {
	h := sha3.NewLegacyKeccak256()
	h.Write(data)
	return h.Sum(nil)
}

// isValidEVMAddress returns true for a 42-character lowercase 0x-prefixed hex string.
func isValidEVMAddress(addr string) bool {
	if len(addr) != 42 || !strings.HasPrefix(addr, "0x") {
		return false
	}
	_, err := hex.DecodeString(addr[2:])
	return err == nil
}

func normalizeAddress(addr string) string {
	return strings.ToLower(strings.TrimSpace(addr))
}

// ===========================================================================
// MINIMAL JWT-STYLE TOKEN (HMAC-SHA512, no external library)
// ===========================================================================
// Format: base64url(header) + "." + base64url(payload) + "." + base64url(sig)
// Payload: [8-byte userID LE] + [8-byte expiresAt unix LE] + [walletAddress bytes]
// This is intentionally simple — not RFC 7519 JWT — but secure for the PoC.

func (s *WalletAuthService) issueToken(userID uint64, walletAddress string) (string, error) {
	if s.authSecret == "" {
		return "", fmt.Errorf("AUTH_SECRET is not set; cannot issue session tokens")
	}
	payload := buildTokenPayload(userID, walletAddress, time.Now().UTC().Add(tokenExpiry))
	sig := signPayload(payload, s.authSecret)
	token := base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
	return token, nil
}

func parseToken(token, secret string) (uint64, string, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return 0, "", fmt.Errorf("malformed token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || len(payload) < 17 { // 8+8+1 minimum
		return 0, "", fmt.Errorf("malformed token payload")
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return 0, "", fmt.Errorf("malformed token signature")
	}
	expected := signPayload(payload, secret)
	if !hmac.Equal(sig, expected) {
		return 0, "", fmt.Errorf("invalid token signature")
	}

	userID := binary.LittleEndian.Uint64(payload[0:8])
	expiresAt := int64(binary.LittleEndian.Uint64(payload[8:16]))
	if time.Now().UTC().Unix() > expiresAt {
		return 0, "", fmt.Errorf("token expired")
	}
	walletAddress := string(payload[16:])
	return userID, walletAddress, nil
}

func buildTokenPayload(userID uint64, walletAddress string, expiresAt time.Time) []byte {
	b := make([]byte, 16+len(walletAddress))
	binary.LittleEndian.PutUint64(b[0:8], userID)
	binary.LittleEndian.PutUint64(b[8:16], uint64(expiresAt.Unix()))
	copy(b[16:], walletAddress)
	return b
}

func signPayload(payload []byte, secret string) []byte {
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(payload)
	return mac.Sum(nil)
}
