import { useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface HealthStatus {
  status: string
  services: { ollama: boolean; qdrant: boolean }
}

interface DocumentMeta {
  id: string
  filename: string
  originalName: string
  mimetype: string
  size: number
  status: 'uploaded' | 'parsing' | 'parsed' | 'chunked' | 'embedding' | 'indexed' | 'failed'
  uploadedAt: string
}

const SUGGESTIONS = [
  { icon: '📄', text: 'What is a contract and what makes it legally binding?' },
  { icon: '🏠', text: 'What is the difference between a lease and a licence?' },
  { icon: '⚖️', text: 'What are the four elements of negligence?' },
  { icon: '🌍', text: 'What is a force majeure clause and when does it apply?' },
]

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  
  // Document state
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Fetch health check & documents on mount
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() =>
        setHealth({ status: 'error', services: { ollama: false, qdrant: false } }),
      )

    fetchDocuments()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]

    // Validate size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('File size exceeds 50MB limit.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    setUploading(true)
    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json()
        alert(errData.message || 'Upload failed.')
      } else {
        await fetchDocuments()
      }
    } catch (err) {
      console.error('File upload error:', err)
      alert('Error uploading document.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to remove this document?')) return
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    eventSourceRef.current?.close()

    setMessages((prev) => [
      ...prev,
      { role: 'user', content },
      { role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    const url = `/api/chat/stream?message=${encodeURIComponent(content)}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (event: MessageEvent<string>) => {
      if (event.data === '[DONE]') {
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

      let token = ''
      try {
        const parsed = JSON.parse(event.data) as { token: string }
        token = parsed.token
      } catch {
        return
      }

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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
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
            <span className="navbar-phase">Phase 4 · Documents</span>
          </div>

          <button
            className={`btn-sidebar-toggle ${sidebarOpen ? 'active' : ''}`}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Documents Drawer"
          >
            📁 Documents
            <span className="doc-count-badge">{documents.length}</span>
          </button>
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

      {/* ── Main Layout (Sidebar + Chat Content) ────────────────────────────── */}
      <div className="main-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <span className="sidebar-title">📑 Uploaded Documents</span>
          </div>

          <div className="sidebar-body">
            {/* Drag and Drop Zone */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              style={{ display: 'none' }}
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <div
              className={`dropzone ${dragActive ? 'dragging' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                handleFileUpload(e.dataTransfer.files)
              }}
            >
              <div className="dropzone-icon">{uploading ? '⏳' : '📤'}</div>
              <div className="dropzone-text">
                {uploading ? 'Uploading document...' : 'Upload Legal Document'}
              </div>
              <div className="dropzone-subtext">
                Drag & drop or click to browse (PDF, TXT, MD up to 50MB)
              </div>
            </div>

            {/* Document List */}
            <div className="doc-list">
              {documents.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
                  No documents uploaded yet.
                </p>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className="doc-card">
                    <div className="doc-info">
                      <div className="doc-name" title={doc.originalName}>
                        {doc.originalName}
                      </div>
                      <div className="doc-meta">
                        <span>{formatFileSize(doc.size)}</span>
                        <span>·</span>
                        <span className={`doc-status-badge ${doc.status}`}>
                          {doc.status}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn-delete-doc"
                      onClick={() => handleDeleteDocument(doc.id)}
                      title="Delete document"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Center Content Area */}
        <div className="content-area">
          {/* Messages Pane */}
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

          {/* Input Area */}
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
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`message-row ${isUser ? 'user' : ''}`}>
      <div className={`avatar ${isUser ? 'user' : 'ai'}`}>
        {isUser ? 'You' : '⚖️'}
      </div>
      <div className={`bubble ${isUser ? 'user' : 'ai'}`}>
        {message.content}
        {message.streaming && message.content && (
          <span className="streaming-cursor">▍</span>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">⚖️</div>
      <div>
        <h1 className="empty-title">Legal Research Assistant</h1>
        <p className="empty-subtitle" style={{ marginTop: 8 }}>
          Ask any legal question in plain English or upload legal documents in the sidebar.
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
