import { AlertTriangle, CheckCircle2, MessageSquare, PackageCheck, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { formatDate } from '../utils/format'

/**
 * Shorten a wallet address for clean presentation.
 */
function shorten(addr) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * In-job communication workspace for Client and Hired Freelancer.
 */
export default function JobDiscussion({
  jobId,
  currentUserId,
  currentWallet,
  clientWallet,
  freelancerWallet,
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const scrollRef = useRef(null)
  const pollTimerRef = useRef(null)

  const isClient = currentWallet && clientWallet && currentWallet.toLowerCase() === clientWallet.toLowerCase()
  const isFreelancer = currentWallet && freelancerWallet && currentWallet.toLowerCase() === freelancerWallet.toLowerCase()

  const fetchMessages = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true)
      const data = await api.getMessages(jobId)
      setMessages(data.messages || [])
      setError('')
    } catch (err) {
      if (isInitial) {
        setError(err.message || 'Failed to load discussion')
      }
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetchMessages(true)

    pollTimerRef.current = setInterval(() => {
      fetchMessages(false)
    }, 6000)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [fetchMessages])

  // Auto scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (e) => {
    if (e) e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || sending) return

    setSending(true)
    setError('')
    try {
      const newMsg = await api.sendMessage(jobId, trimmed)
      setMessages((prev) => [...prev, newMsg])
      setInput('')
    } catch (err) {
      setError(err.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <section className="card flex flex-col overflow-hidden" aria-label="Job Discussion">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-mint-50 text-mint-700">
            <MessageSquare className="size-4" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-950 sm:text-base">
              Job Workspace &amp; Instructions
            </h2>
            <p className="text-xs text-slate-500">
              Direct communication between client and assigned freelancer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-slate-500">
            <span className="inline-block size-2 rounded-full bg-mint-500 animate-pulse" />
            Live sync
          </span>
        </div>
      </div>

      {/* Messages Feed */}
      <div
        ref={scrollRef}
        className="flex max-h-[460px] min-h-[260px] flex-col gap-3.5 overflow-y-auto p-5 sm:p-6"
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-slate-400">
            Loading workspace history…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <MessageSquare className="size-6" />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-700">No messages yet</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
              Coordinate deliverable details, share revision feedback, and provide project instructions here.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe =
              (msg.sender_user_id && currentUserId && String(msg.sender_user_id) === String(currentUserId)) ||
              (msg.sender_wallet && currentWallet && msg.sender_wallet.toLowerCase() === currentWallet.toLowerCase())

            // Special card: Revision Request
            if (msg.message_type === 'revision_request') {
              return (
                <div
                  key={msg.id}
                  className="my-1 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950 shadow-xs"
                >
                  <div className="flex items-center gap-2 font-display font-bold text-amber-900">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                    <span>Client Requested Revisions</span>
                    <span className="ml-auto text-xs font-normal text-amber-700">
                      {formatDate(msg.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-amber-900 sm:text-sm">
                    {msg.body}
                  </p>
                </div>
              )
            }

            // Special card: Submission Notice
            if (msg.message_type === 'submission') {
              return (
                <div
                  key={msg.id}
                  className="my-1 rounded-xl border border-mint-200 bg-mint-50/70 p-4 text-sm text-mint-950 shadow-xs"
                >
                  <div className="flex items-center gap-2 font-display font-bold text-mint-900">
                    <PackageCheck className="size-4 shrink-0 text-mint-600" />
                    <span>Deliverable Update Submitted</span>
                    <span className="ml-auto text-xs font-normal text-mint-700">
                      {formatDate(msg.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-mint-900 sm:text-sm">
                    {msg.body}
                  </p>
                </div>
              )
            }

            // Standard Chat Bubble
            const isClientRole = msg.sender_role === 'client'
            const roleBadgeClass = isClientRole
              ? 'bg-slate-900 text-white'
              : 'bg-mint-100 text-mint-800 border border-mint-200'

            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleBadgeClass}`}>
                    {isClientRole ? 'Client' : 'Freelancer'}
                  </span>
                  <span className="font-semibold text-slate-700">
                    {msg.sender_username || shorten(msg.sender_wallet)}
                  </span>
                  <span>·</span>
                  <span>{formatDate(msg.created_at)}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap sm:text-sm ${
                    isMe
                      ? 'bg-ink-950 text-white rounded-tr-xs shadow-xs'
                      : 'bg-slate-100 text-slate-900 rounded-tl-xs'
                  }`}
                >
                  {msg.body}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Composer */}
      {(isClient || isFreelancer) && (
        <form onSubmit={handleSend} className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
          {error && (
            <p className="mb-2 text-xs font-semibold text-rose-600" role="alert">
              {error}
            </p>
          )}
          <div className="relative">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              placeholder="Send project instructions, questions, or revision details… (Shift+Enter for new line)"
              className="field-input w-full resize-none pr-20 text-xs sm:text-sm"
              maxLength={4000}
            />
            <div className="absolute right-2.5 bottom-2.5 flex items-center gap-2">
              <span className="text-[10px] text-slate-400 select-none">
                {input.length}/4000
              </span>
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-950 px-3 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="size-3" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}
