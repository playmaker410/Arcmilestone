/**
 * UsernameSetupModal
 *
 * Full-screen overlay that appears immediately after wallet authentication
 * for any user whose `username` field is still null in the database.
 *
 * WHY FULL-SCREEN?
 *   The username is a core identity requirement on ArcMilestone — every other
 *   user on the marketplace will see it. Making it a blocking full-screen
 *   step (rather than a dismissible toast/banner) prevents users from
 *   skipping it and then confusing others with wallet-address-only identities.
 *
 * VALIDATION RULES (front-end mirror of what the backend should enforce):
 *   • 3 – 20 characters long
 *   • Only letters (a-z, A-Z), digits (0-9), and underscores (_)
 *   • Cannot be a reserved system keyword (see RESERVED_USERNAMES below)
 *
 * AVAILABILITY CHECK:
 *   A debounced GET /api/users/check-username?username=<value> request fires
 *   300 ms after the user stops typing, so the "available" / "taken" hint
 *   appears in real time without hammering the server.
 *
 *   BACKEND REQUIRED — see api.js checkUsername for the contract.
 *   If the endpoint does not exist yet, the check silently skips and the user
 *   can still submit; the PATCH /api/users/me call will fail if the name is
 *   taken, and that error is surfaced inline.
 *
 * DATABASE AUTHORITY NOTE:
 *   The frontend check is a UX convenience only. The backend MUST enforce a
 *   UNIQUE constraint on users.username to handle the edge case where two
 *   users claim the same name at the same moment.
 */

import { AtSign, CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import Logo from './Logo'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum and maximum allowed username length (inclusive). */
const MIN_LENGTH = 3
const MAX_LENGTH = 20

/**
 * Names that are reserved for platform use.
 * A user must not be able to impersonate platform authorities.
 */
const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'arcmilestone',
  'arc',
  'system',
  'moderator',
  'mod',
  'staff',
  'official',
  'root',
  'superuser',
  'null',
  'undefined',
])

/** Regex: letters, digits, underscores only. */
const VALID_PATTERN = /^[a-zA-Z0-9_]+$/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates a username string and returns an error message string if it
 * fails, or an empty string if it is valid.
 *
 * @param {string} value - The raw input value to check.
 * @returns {string} Error description, or '' when valid.
 */
function validate(value) {
  if (!value) return '' // empty = no error yet, just waiting for input
  if (value.length < MIN_LENGTH) return `Must be at least ${MIN_LENGTH} characters.`
  if (value.length > MAX_LENGTH) return `Cannot exceed ${MAX_LENGTH} characters.`
  if (!VALID_PATTERN.test(value)) return 'Only letters, numbers, and underscores are allowed.'
  if (RESERVED_USERNAMES.has(value.toLowerCase())) return 'That username is reserved.'
  return ''
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * @param {object}   props
 * @param {Function} props.onComplete  - Called with the confirmed username
 *                                       string after a successful PATCH.
 */
export default function UsernameSetupModal({ onComplete }) {
  // ---- form state --------------------------------------------------------
  const [value, setValue] = useState('')
  const [validationError, setValidationError] = useState('')

  // ---- availability check state ------------------------------------------
  /**
   * availabilityStatus can be:
   *   'idle'       — no check running or queued
   *   'checking'   — debounce timer fired, request in-flight
   *   'available'  — last check returned { available: true }
   *   'taken'      — last check returned { available: false }
   *   'error'      — check request failed (network / backend not ready)
   */
  const [availabilityStatus, setAvailabilityStatus] = useState('idle')

  // ---- submission state --------------------------------------------------
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Ref to hold the debounce timer so we can clear it on each keystroke
  const debounceTimer = useRef(null)

  // ---- availability check (debounced) ------------------------------------

  const runAvailabilityCheck = useCallback(async (username) => {
    setAvailabilityStatus('checking')
    try {
      const result = await api.checkUsername(username)
      setAvailabilityStatus(result.available ? 'available' : 'taken')
    } catch {
      setAvailabilityStatus('error')
    }
  }, [])



  /**
   * Whenever `value` changes:
   *   1. Run synchronous validation immediately (instant feedback).
   *   2. If it passes validation, schedule an availability check after 300 ms.
   *   3. Any pending timer is cancelled first to debounce rapid keystrokes.
   */
  useEffect(() => {
    // Always reset availability when the user edits the field
    setAvailabilityStatus('idle')

    const error = validate(value)
    setValidationError(error)

    // Don't bother checking availability if the value is empty or invalid
    if (!value || error) return

    // Debounce: cancel any previously-queued check
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    // Schedule a new check 300 ms from now
    debounceTimer.current = setTimeout(() => {
      runAvailabilityCheck(value)
    }, 300)

    // Clean up the timer when the component unmounts or value changes again
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [value, runAvailabilityCheck])

  // ---- submission --------------------------------------------------------

  /**
   * Handles the "Continue" button click / form submit.
   * Re-validates locally, then calls api.setUsername.
   * On success, delegates to onComplete so AppContext can update the user.
   */
  const handleSubmit = async (event) => {
    event.preventDefault()

    const error = validate(value)
    if (error) { setValidationError(error); return }
    if (availabilityStatus === 'taken') return

    setSubmitting(true)
    setSubmitError('')

    try {
      // Calls PATCH /api/users/me
      await api.setUsername(value.trim())

      // Hand control back to the parent (AppContext) with the confirmed name
      onComplete(value.trim())
    } catch (err) {
      setSubmitError(err.message || 'Could not save username. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- derived UI flags --------------------------------------------------

  /** Is the field value in a valid state to submit? */
  const canSubmit =
    value.length >= MIN_LENGTH &&
    !validationError &&
    availabilityStatus !== 'taken' &&
    !submitting

  // ---- render ------------------------------------------------------------

  return (
    /*
     * Full-screen backdrop — intentionally not dismissible.
     * The user must choose a username before accessing the dashboard.
     * z-50 puts it above the DashboardLayout sidebar and main content.
     */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="username-modal-title"
    >
      {/* Card */}
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white shadow-float">

        {/* ── Top brand band ────────────────────────────────────────────── */}
        <div className="bg-ink-950 px-7 py-6">
          {/* Logo placed here so the brand is immediately visible */}
          <Logo inverse />
          <p className="mt-4 text-xs font-bold tracking-[0.14em] text-mint-400 uppercase">
            Profile setup
          </p>
          <h1
            id="username-modal-title"
            className="mt-1 font-display text-2xl font-bold leading-tight text-white"
          >
            Choose your username
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Your username is unique across ArcMilestone and visible to every
            other user on the marketplace.
          </p>
        </div>

        {/* ── Form body ─────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate className="px-7 py-7">

          {/* Username input */}
          <label
            htmlFor="username-input"
            className="mb-2 block text-sm font-bold text-slate-800"
          >
            Username
          </label>

          {/*
           * Input wrapper — the @ prefix icon lives inside the same rounded
           * container as the text field to match the field-input style.
           */}
          <div className="relative">
            {/* @ prefix icon */}
            <span
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5"
              aria-hidden="true"
            >
              <AtSign className="size-4 text-slate-400" />
            </span>

            {/* Actual input */}
            <input
              id="username-input"
              type="text"
              autoComplete="username"
              autoFocus
              spellCheck={false}
              maxLength={MAX_LENGTH}
              value={value}
              onChange={(e) => {
                // Strip spaces immediately — usernames cannot contain spaces
                setValue(e.target.value.replace(/\s/g, ''))
              }}
              /*
               * field-input is the project's shared input class from index.css.
               * field-input-error adds the red border variant.
               */
              className={`field-input pl-9 pr-10 ${validationError || availabilityStatus === 'taken'
                ? 'field-input-error'
                : availabilityStatus === 'available'
                  ? 'border-mint-500 focus:border-mint-500 focus:ring-mint-500/10'
                  : ''
                }`}
              aria-describedby="username-hint username-feedback"
              aria-invalid={!!(validationError || availabilityStatus === 'taken')}
            />

            {/* Right-side status icon (spinner / check / cross) */}
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5">
              {availabilityStatus === 'checking' && (
                <LoaderCircle
                  className="size-4 animate-spin text-slate-400"
                  aria-label="Checking availability…"
                />
              )}
              {availabilityStatus === 'available' && (
                <CheckCircle2
                  className="size-4 text-mint-500"
                  aria-label="Username available"
                />
              )}
              {availabilityStatus === 'taken' && (
                <XCircle
                  className="size-4 text-rose-500"
                  aria-label="Username taken"
                />
              )}
            </span>
          </div>

          {/* ── Format hint ─────────────────────────────────────────────── */}
          <p
            id="username-hint"
            className="mt-2 text-xs leading-5 text-slate-500"
          >
            {MIN_LENGTH}–{MAX_LENGTH} characters · letters, numbers, underscores
          </p>

          {/* ── Inline feedback line (validation error OR availability) ─── */}
          <p
            id="username-feedback"
            aria-live="polite"
            className={`mt-1.5 min-h-[1.25rem] text-xs font-semibold transition-colors ${validationError || availabilityStatus === 'taken'
              ? 'text-rose-600'
              : availabilityStatus === 'available'
                ? 'text-mint-600'
                : availabilityStatus === 'error'
                  ? 'text-amber-600'
                  : 'text-transparent'
              }`}
          >
            {/* Prioritise hard validation errors over availability hints */}
            {validationError ||
              (availabilityStatus === 'taken' && '✕  This username is already taken.') ||
              (availabilityStatus === 'available' && '✓  Username available') ||
              (availabilityStatus === 'error' &&
                'Availability check unavailable — you can still continue.') ||
              '\u00A0' /* non-breaking space keeps the line height reserved */}
          </p>

          {/* ── Submit error (backend failure) ──────────────────────────── */}
          {submitError && (
            <div
              className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700"
              role="alert"
            >
              {submitError}
            </div>
          )}

          {/* ── Submit button ───────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary mt-6 w-full"
          >
            {submitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Continue to Dashboard'
            )}
          </button>

          {/* ── Examples row ────────────────────────────────────────────── */}
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Examples of valid usernames
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {['joshua', 'joshua01', 'arc_dev', 'playmaker410'].map((example) => (
                <button
                  key={example}
                  type="button"
                  /*
                   * Clicking an example fills the input — a gentle nudge for
                   * users unsure of what format is expected.
                   */
                  onClick={() => setValue(example)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono font-semibold text-slate-600 transition hover:border-mint-400 hover:bg-mint-50 hover:text-mint-700"
                >
                  @{example}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
