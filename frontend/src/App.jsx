import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom"
import Session from "./Session"
import Admin from "./Admin"
import "./App.css"

function Nav() {
  const loc = useLocation()
  return (
    <nav className="top-nav">
      <div className="nav-brand">🏏 Turf Split</div>
      <div className="nav-links">
        {loc.pathname !== "/admin" && (
          <Link className="nav-link admin-link" to="/admin">Admin</Link>
        )}
        {loc.pathname === "/admin" && (
          <Link className="nav-link" to="/">Session</Link>
        )}
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-root">
        <Nav />
        <Routes>
          <Route path="/" element={<Session />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
