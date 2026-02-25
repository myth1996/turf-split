import { useState, useEffect } from "react"

const API = import.meta.env.VITE_API_URL || "http://localhost:8000"
const CF_MODE = import.meta.env.VITE_CASHFREE_MODE || "production"

export default function Session() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState(() => localStorage.getItem("ts_name") || "")
  const [phone, setPhone] = useState(() => localStorage.getItem("ts_phone") || "")
  const [myRsvp, setMyRsvp] = useState(null)   // { id, rsvp_status, payment_status, amount_due }
  const [cashfree, setCashfree] = useState(null)
  const [paying, setPaying] = useState(false)
  const [submitStatus, setSubmitStatus] = useState("idle") // idle / loading / done

  // Load Cashfree SDK
  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js"
    script.async = true
    script.onload = () => setCashfree(window.Cashfree({ mode: CF_MODE }))
    document.body.appendChild(script)
    return () => document.body.removeChild(script)
  }, [])

  // Fetch current session + poll every 10s
  useEffect(() => {
    function load() {
      fetch(`${API}/sessions/current`)
        .then(r => r.json())
        .then(d => {
          setSession(d.session)
          if (d.session) restoreMyRsvp(d.session)
        })
        .finally(() => setLoading(false))
    }
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  function restoreMyRsvp(s) {
    const savedName = localStorage.getItem("ts_name")
    if (!savedName) return
    const found = s.rsvps.find(r => r.player_name === savedName)
    if (found) setMyRsvp(found)  // keeps payment_status in sync on each poll
  }

  async function handleRsvp(status) {
    if (!name.trim()) return alert("Please enter your name")
    setSubmitStatus("loading")
    localStorage.setItem("ts_name", name.trim())
    if (phone) localStorage.setItem("ts_phone", phone)
    const res = await fetch(`${API}/sessions/${session.id}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_name: name.trim(), phone: phone || null, rsvp_status: status }),
    })
    const data = await res.json()
    setMyRsvp(data)
    setSubmitStatus("done")
    // Refresh session
    fetch(`${API}/sessions/${session.id}`)
      .then(r => r.json())
      .then(setSession)
  }

  async function handlePay() {
    if (!myRsvp || !cashfree) return
    setPaying(true)
    try {
      const res = await fetch(`${API}/sessions/${session.id}/pay/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rsvp_id: myRsvp.id }),
      })
      const order = await res.json()
      cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" })
        .then(async result => {
          if (result.paymentDetails) {
            const verify = await fetch(`${API}/sessions/${session.id}/pay/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order_id: order.order_id, rsvp_id: myRsvp.id }),
            })
            const data = await verify.json()
            if (data.success) {
              setMyRsvp(prev => ({ ...prev, payment_status: "paid_online" }))
              fetch(`${API}/sessions/${session.id}`).then(r => r.json()).then(setSession)
            }
          }
          setPaying(false)
        })
    } catch {
      alert("Payment failed. Please try again.")
      setPaying(false)
    }
  }

  if (loading) return <div className="center-msg">Loading...</div>

  if (!session) return (
    <div className="center-msg">
      <div className="no-session-icon">🏏</div>
      <h2>No session scheduled yet</h2>
      <p>Check back soon or ask the organiser to create one.</p>
    </div>
  )

  const confirmed = session.rsvps.filter(r => r.rsvp_status === "in")
  const maybe = session.rsvps.filter(r => r.rsvp_status === "maybe")
  const paid = session.rsvps.filter(r => r.payment_status !== "pending")
  const isLocked = session.status === "locked"

  return (
    <div className="page">
      {/* Session header */}
      <div className="session-card">
        <div className="session-badge">{isLocked ? "🔒 Locked" : "🟢 Open"}</div>
        <h2 className="session-title">🏏 {session.turf_name}</h2>
        <div className="session-meta">
          📅 {session.date} &nbsp;·&nbsp; ⏰ {session.time}
        </div>
        <div className="session-cost-row">
          <div className="cost-block">
            <div className="cost-label">Turf cost</div>
            <div className="cost-value">₹{session.turf_cost}</div>
          </div>
          <div className="cost-divider">÷</div>
          <div className="cost-block">
            <div className="cost-label">Confirmed</div>
            <div className="cost-value">{confirmed.length} players</div>
          </div>
          <div className="cost-divider">=</div>
          <div className="cost-block highlight">
            <div className="cost-label">Per head</div>
            <div className="cost-value green">₹{session.per_head_cost}</div>
          </div>
        </div>
        <div className="collection-bar-wrap">
          <div className="collection-bar-label">
            Collected: ₹{session.collected} / ₹{session.turf_cost}
          </div>
          <div className="collection-bar-bg">
            <div
              className="collection-bar-fill"
              style={{ width: `${Math.min(100, (session.collected / session.turf_cost) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* RSVP form */}
      {!isLocked && (
        <div className="rsvp-card">
          <h3 className="card-title">Are you coming?</h3>
          <input
            className="ts-input"
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="ts-input"
            placeholder="Phone (optional, for payment)"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            type="tel"
          />
          <div className="rsvp-btn-row">
            <button
              className={`rsvp-btn in${myRsvp?.rsvp_status === "in" ? " active" : ""}`}
              onClick={() => handleRsvp("in")}
              disabled={submitStatus === "loading"}
            >✅ I'm In</button>
            <button
              className={`rsvp-btn maybe${myRsvp?.rsvp_status === "maybe" ? " active" : ""}`}
              onClick={() => handleRsvp("maybe")}
              disabled={submitStatus === "loading"}
            >🤔 Maybe</button>
            <button
              className={`rsvp-btn out${myRsvp?.rsvp_status === "out" ? " active" : ""}`}
              onClick={() => handleRsvp("out")}
              disabled={submitStatus === "loading"}
            >❌ Can't Come</button>
          </div>
          {submitStatus === "done" && myRsvp && (
            <p className="rsvp-confirm">
              Got it, {myRsvp.player_name}! You're marked as <strong>{myRsvp.rsvp_status}</strong>.
            </p>
          )}
        </div>
      )}

      {/* Pay button (locked session, player is "in") */}
      {isLocked && myRsvp?.rsvp_status === "in" && (
        <div className="pay-card">
          {myRsvp.payment_status === "pending" ? (
            <>
              <p className="pay-amount">Your share: <strong>₹{myRsvp.amount_due}</strong></p>
              <button className="pay-btn" onClick={handlePay} disabled={paying}>
                {paying ? "Opening payment..." : `💳 Pay ₹${myRsvp.amount_due} via UPI`}
              </button>
              <p className="pay-note">Or pay cash to the organiser</p>
            </>
          ) : (
            <div className="paid-badge">
              {myRsvp.payment_status === "paid_online" ? "✅ Paid online" : "💵 Cash marked"}
            </div>
          )}
        </div>
      )}

      {/* Who's coming */}
      <div className="players-card">
        <h3 className="card-title">
          Who's coming
          <span className="player-count">{confirmed.length} confirmed · {maybe.length} maybe</span>
        </h3>
        <div className="player-list">
          {confirmed.map(r => (
            <div key={r.id} className="player-row">
              <span className="player-name">✅ {r.player_name}</span>
              <span className={`player-pay-badge ${r.payment_status}`}>
                {r.payment_status === "paid_online" ? "💳 Paid" :
                 r.payment_status === "paid_cash" ? "💵 Cash" : "⏳"}
              </span>
            </div>
          ))}
          {maybe.map(r => (
            <div key={r.id} className="player-row maybe-row">
              <span className="player-name">🤔 {r.player_name}</span>
            </div>
          ))}
          {confirmed.length === 0 && maybe.length === 0 && (
            <p className="empty-msg">No one yet — be the first!</p>
          )}
        </div>
      </div>

      <div className="footer-note">🔒 Payments secured by Cashfree</div>
    </div>
  )
}
