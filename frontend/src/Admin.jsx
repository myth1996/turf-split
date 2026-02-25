import { useState, useEffect } from "react"

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"

function waLink(phone, msg) {
  const num = phone?.replace(/\D/g, "")
  return `https://wa.me/${num ? "91" + num : ""}?text=${encodeURIComponent(msg)}`
}

export default function Admin() {
  const [password, setPassword] = useState(() => localStorage.getItem("ts_admin_pw") || "")
  const [authed, setAuthed] = useState(false)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(false)

  // Create session form
  const today = new Date().toISOString().split("T")[0]
  const [date, setDate] = useState(today)
  const [time, setTime] = useState("06:00")
  const [turfName, setTurfName] = useState("Home Turf")
  const [turfCost, setTurfCost] = useState(3200)

  const headers = { "Content-Type": "application/json", "x-admin-password": password }

  function login() {
    localStorage.setItem("ts_admin_pw", password)
    setAuthed(true)
    loadSession()
  }

  function loadSession() {
    setLoading(true)
    fetch(`${API}/sessions/current`)
      .then(r => r.json())
      .then(d => setSession(d.session))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (authed) loadSession()
  }, [authed])

  async function createSession() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ date, time, turf_name: turfName, turf_cost: Number(turfCost) }),
      })
      if (res.status === 403) { alert("Wrong password"); return }
      if (!res.ok) { alert(`Server error: ${res.status}`); return }
      const data = await res.json()
      setSession(data)
    } catch (e) {
      alert(`Could not reach server: ${e.message}\n\nAPI: ${API}`)
    } finally {
      setLoading(false)
    }
  }

  async function lockSession() {
    if (!session) return
    if (!confirm(`Lock session? Per head will be ₹${Math.ceil(session.turf_cost / session.confirmed_count)}`)) return
    const res = await fetch(`${API}/sessions/${session.id}/lock`, { method: "POST", headers })
    const data = await res.json()
    setSession(data)
  }

  async function markCash(rsvpId) {
    await fetch(`${API}/sessions/${session.id}/rsvps/${rsvpId}/cash`, { method: "PATCH", headers })
    loadSession()
  }

  async function removePlayer(rsvpId, name) {
    if (!confirm(`Remove ${name}?`)) return
    await fetch(`${API}/sessions/${session.id}/rsvps/${rsvpId}`, { method: "DELETE", headers })
    loadSession()
  }

  async function closeSession() {
    if (!confirm("Mark session as closed?")) return
    await fetch(`${API}/sessions/${session.id}/close`, { method: "POST", headers })
    loadSession()
  }

  if (!authed) return (
    <div className="page">
      <div className="admin-login">
        <h2>🔐 Admin Login</h2>
        <input
          className="ts-input"
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && login()}
        />
        <button className="pay-btn" onClick={login}>Login</button>
      </div>
    </div>
  )

  const confirmed = session?.rsvps?.filter(r => r.rsvp_status === "in") || []
  const maybe = session?.rsvps?.filter(r => r.rsvp_status === "maybe") || []
  const unpaid = confirmed.filter(r => r.payment_status === "pending")
  const paid = confirmed.filter(r => r.payment_status !== "pending")
  const shareUrl = session ? `${window.location.origin}/?s=${session.id}` : ""

  // WhatsApp message for unpaid players
  function reminderMsg(name) {
    return `Hey ${name}! 🏏 Cricket this ${session?.date} at ${session?.turf_name}.\nYour share is ₹${session?.per_head_cost}.\nPay here: ${shareUrl}`
  }

  return (
    <div className="page">
      <div className="admin-header">
        <h2>⚙️ Admin Dashboard</h2>
        <button className="ghost-btn" onClick={() => { setAuthed(false); localStorage.removeItem("ts_admin_pw") }}>
          Logout
        </button>
      </div>

      {/* Create session */}
      {!session && (
        <div className="rsvp-card">
          <h3 className="card-title">Create New Session</h3>
          <label className="ts-label">Date</label>
          <input className="ts-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <label className="ts-label">Time</label>
          <input className="ts-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
          <label className="ts-label">Turf name</label>
          <input className="ts-input" value={turfName} onChange={e => setTurfName(e.target.value)} />
          <label className="ts-label">Turf cost (₹)</label>
          <input className="ts-input" type="number" value={turfCost} onChange={e => setTurfCost(e.target.value)} />
          <button className="pay-btn" onClick={createSession} disabled={loading}>
            {loading ? "Creating..." : "🏏 Create Session"}
          </button>
        </div>
      )}

      {/* Active session */}
      {session && (
        <>
          {/* Stats bar */}
          <div className="stats-row">
            <div className="stat-box">
              <div className="stat-num">{confirmed.length}</div>
              <div className="stat-label">Confirmed</div>
            </div>
            <div className="stat-box">
              <div className="stat-num">{maybe.length}</div>
              <div className="stat-label">Maybe</div>
            </div>
            <div className="stat-box green">
              <div className="stat-num">₹{session.per_head_cost}</div>
              <div className="stat-label">Per head</div>
            </div>
            <div className="stat-box">
              <div className="stat-num">₹{session.collected}</div>
              <div className="stat-label">Collected</div>
            </div>
          </div>

          {/* Share link */}
          <div className="share-row">
            <input className="ts-input share-input" readOnly value={shareUrl} />
            <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(shareUrl); alert("Link copied!") }}>
              Copy
            </button>
            <a
              className="whatsapp-share-btn"
              href={`https://wa.me/?text=${encodeURIComponent(`🏏 Cricket ${session.date} @ ${session.turf_name}\nRSVP + pay here: ${shareUrl}`)}`}
              target="_blank" rel="noopener noreferrer"
            >
              📲 Share
            </a>
          </div>

          {/* Lock / Close */}
          <div className="action-row">
            {session.status === "open" && (
              <button className="lock-btn" onClick={lockSession} disabled={confirmed.length === 0}>
                🔒 Lock Session (₹{Math.ceil(session.turf_cost / (confirmed.length || 1))}/head)
              </button>
            )}
            {session.status === "locked" && (
              <button className="close-btn" onClick={closeSession}>✅ Close Session</button>
            )}
          </div>

          {/* Player table */}
          <div className="players-card">
            <h3 className="card-title">
              Players
              <span className="player-count">{paid.length}/{confirmed.length} paid · ₹{session.collected}/₹{session.turf_cost}</span>
            </h3>

            {confirmed.length === 0 && <p className="empty-msg">No confirmed players yet</p>}

            {confirmed.map(r => (
              <div key={r.id} className="admin-player-row">
                <div className="admin-player-left">
                  <span className="player-name">{r.player_name}</span>
                  {r.phone && <span className="player-phone">{r.phone}</span>}
                </div>
                <div className="admin-player-actions">
                  {r.payment_status === "pending" ? (
                    <>
                      <button className="cash-btn" onClick={() => markCash(r.id)}>💵 Cash</button>
                      {r.phone && (
                        <a
                          className="remind-btn"
                          href={waLink(r.phone, reminderMsg(r.player_name))}
                          target="_blank" rel="noopener noreferrer"
                        >
                          📲 Remind
                        </a>
                      )}
                    </>
                  ) : (
                    <span className={`pay-tag ${r.payment_status}`}>
                      {r.payment_status === "paid_online" ? "💳 Online" : "💵 Cash"}
                    </span>
                  )}
                  <button className="remove-btn" onClick={() => removePlayer(r.id, r.player_name)}>✕</button>
                </div>
              </div>
            ))}

            {maybe.length > 0 && (
              <>
                <div className="section-divider">Maybe ({maybe.length})</div>
                {maybe.map(r => (
                  <div key={r.id} className="admin-player-row maybe-row">
                    <span className="player-name">🤔 {r.player_name}</span>
                    <button className="remove-btn" onClick={() => removePlayer(r.id, r.player_name)}>✕</button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Bulk reminder for unpaid */}
          {session.status === "locked" && unpaid.length > 0 && (
            <div className="reminder-card">
              <h3 className="card-title">⏳ Unpaid ({unpaid.length})</h3>
              {unpaid.map(r => (
                <div key={r.id} className="reminder-row">
                  <span>{r.player_name}</span>
                  {r.phone ? (
                    <a className="remind-btn" href={waLink(r.phone, reminderMsg(r.player_name))}
                      target="_blank" rel="noopener noreferrer">
                      📲 Send Reminder
                    </a>
                  ) : (
                    <span className="no-phone">No phone</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <button className="ghost-btn danger" onClick={() => setSession(null)}>
            + Create new session
          </button>
        </>
      )}
    </div>
  )
}
