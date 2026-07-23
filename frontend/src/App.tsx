import { useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean // true while tokens are still arriving
}

interface HealthStatus {
  status: string
  services: { ollama: boolean; qdrant: boolean }
}

const SUGGESTIONS = [
  { icon: '📄', text: 'What is a contract and what makes it legally binding?' },
  { icon: '🏠', text: 'What is the difference between a lease and a licence?' },
  { icon: '⚖️', text: 'What are the four elements of negligence?' },
  { icon: '🌍', text: 'What is a force majeure clause and when does it apply?' },
]

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Keep a ref to the active EventSource so we can close it if needed
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({ status: 'error', services: { ollama: false, qdrant: false } }),
      )
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  /**
   * sendMessage — the core of Phase 3.
   *
   * Instead of POST /chat (which waits for the full response), we now:
   * 1. Add the user message to the UI immediately
   * 2. Open an EventSource to GET /chat/stream?message=...
   * 3. On each 'message' event, append the token to the last assistant bubble
   * 4. On '[DONE]', close the EventSource and mark streaming complete
   *
   * The user sees tokens appearing one by one — no waiting.
   */
  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    // Close any previous stream (defensive)
    eventSourceRef.current?.close()

    // 1. Add user message and an empty assistant bubble (streaming: true)
    setMessages((prev) => [
      ...prev,
      { role: 'user', content },
      { role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    // 2. Open the SSE connection
    // EventSource URL goes through Vite proxy → backend /chat/stream
    const url = `/api/chat/stream?message=${encodeURIComponent(content)}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    // 3. Handle incoming tokens
    es.onmessage = (event: MessageEvent<string>) => {
      // Check for the [DONE] sentinel
      if (event.data === '[DONE]') {
        // Mark the assistant message as no longer streaming
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, streaming: false } : m,
          ),
        )
        es.close()
        eventSourceRef.current = null
        setLoading(false)
        return
      }

      // Parse the token from { "token": "A" }
      let token = ''
      try {
        const parsed = JSON.parse(event.data) as { token: string }
        token = parsed.token
      } catch {
        return
      }

      // Append token to the last message (the streaming assistant bubble)
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: last.content + token,
          }
        }
        return updated
      })
    }

    // 4. Handle errors (Ollama crashed mid-stream, network error, etc.)
    es.onerror = () => {
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? { ...m, content: m.content || '⚠️ Stream interrupted.', streaming: false }
            : m,
        ),
      )
      es.close()
      eventSourceRef.current = null
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const canSend = input.trim().length > 0 && !loading

  return (
    <div className="app-shell">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">⚖️</div>
          <div>
            <span className="navbar-title">Legal Research Assistant</span>
            <span className="navbar-phase">Phase 3 · Streaming</span>
          </div>
        </div>
        <div className="status-pills">
          {health && (
            <>
              <div className={`status-pill ${health.services.ollama ? 'online' : 'offline'}`}>
                <span className="dot" />
                Ollama
              </div>
              <div className={`status-pill ${health.services.qdrant ? 'online' : 'offline'}`}>
                <span className="dot" />
                Qdrant
              </div>
            </>
          )}
        </div>
      </nav>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="messages-pane">
        <div className="messages-inner">
          {messages.length === 0 ? (
            <EmptyState onSuggest={sendMessage} />
          ) : (
            <>
              <div className="session-divider">Today's session</div>
              {messages.map((msg, i) => (
                <MessageRow key={i} message={msg} />
              ))}
            </>
          )}

          {/* Show thinking dots only at the very start before any token arrives */}
          {loading && messages[messages.length - 1]?.content === '' && (
            <div style={{ marginLeft: 48 }}>
              <div className="thinking" style={{ padding: '4px 0' }}>
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input Area ─────────────────────────────────────────────────────── */}
      <div className="input-area">
        <div className="input-wrap">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask a legal question… (Enter to send)"
              className="input-textarea"
              disabled={loading}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!canSend}
              title="Send message"
            >
              {loading ? '⏳' : '↑'}
            </button>
          </div>
          <div className="input-footer">
            <span className="model-badge">llama3.2</span>
            <span className="dot-sep">·</span>
            <span>Streaming via SSE</span>
            <span className="dot-sep">·</span>
            <span>No data leaves your machine</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Message Row ────────────────────────────────────────────────────────────────
function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`message-row ${isUser ? 'user' : ''}`}>
      <div className={`avatar ${isUser ? 'user' : 'ai'}`}>
        {isUser ? 'You' : '⚖️'}
      </div>
      <div className={`bubble ${isUser ? 'user' : 'ai'}`}>
        {message.content}
        {/* Blinking cursor shown while streaming */}
        {message.streaming && message.content && (
          <span className="streaming-cursor">▍</span>
        )}
      </div>
    </div>
  )
}

// ── Empty State ────────────────────────────────────────────────────────────────
function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">⚖️</div>
      <div>
        <h1 className="empty-title">Legal Research Assistant</h1>
        <p className="empty-subtitle" style={{ marginTop: 8 }}>
          Ask any legal question in plain English. Powered by{' '}
          <strong>llama3.2</strong>, running 100% locally — your data never
          leaves your machine.
        </p>
      </div>
      <div className="suggestions-grid">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            className="suggestion-chip"
            onClick={() => onSuggest(s.text)}
          >
            <span style={{ marginRight: 6 }}>{s.icon}</span>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  )
}
