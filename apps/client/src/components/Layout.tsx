import { BookOpen, Gamepad2, Library, LineChart, LogIn, LogOut, PlaySquare, Shield, Trophy, User, UserRound, Users, Vote } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useCurrentUser } from "../hooks.js";

export function Layout() {
  const user = useCurrentUser();
  const isAdmin = user.data?.role === "Admin";
  const isAuthenticated = user.data?.isAuthenticated === true;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <Gamepad2 aria-hidden />
          <span>Dadson's PS2 Challenge</span>
        </NavLink>
        <nav>
          <NavLink to="/games"><Library aria-hidden />Games</NavLink>
          <NavLink to="/progress"><Trophy aria-hidden />Progress</NavLink>
          <NavLink to="/statistics"><LineChart aria-hidden />Statistics</NavLink>
          <NavLink to="/votes"><Vote aria-hidden />Votes</NavLink>
          <NavLink to="/runners"><Users aria-hidden />Challenge Runners</NavLink>
          {isAuthenticated ? <NavLink to="/user"><User aria-hidden />Profile</NavLink> : <NavLink to="/login"><LogIn aria-hidden />Login</NavLink>}
          {isAdmin ? <NavLink to="/admin"><Shield aria-hidden />Admin</NavLink> : null}
          <details className="sidebar-social-menu">
            <summary><PlaySquare aria-hidden />Watch the Challenge</summary>
            <div className="sidebar-social-links">
              <a href="https://www.twitch.tv/retrodadson" target="_blank" rel="noreferrer">
                <img src="/assets/glitch_flat_purple.svg" alt="" />
                <span>Twitch</span>
              </a>
              <a href="https://www.youtube.com/@dadson1996" target="_blank" rel="noreferrer">
                <img src="/assets/yt_icon_red_digital.png" alt="" />
                <span>YouTube</span>
              </a>
            </div>
          </details>
        </nav>
        <div className="sidebar-lower">
          {isAuthenticated ? (
            <section className="sidebar-account" aria-label="Signed in user">
              <NavLink className="sidebar-user-link" to="/user" aria-label={`Open profile for ${user.data?.username ?? "user"}`}>
                {user.data?.profileImageUrl ? (
                  <img src={user.data.profileImageUrl} alt={user.data.username ?? "User"} />
                ) : (
                  <span className="sidebar-avatar-placeholder" aria-hidden><UserRound /></span>
                )}
                <span>
                  <strong>{user.data?.username ?? "User"}</strong>
                  <small>{user.data?.role ?? "Signed in"}</small>
                </span>
              </NavLink>
              <a className="sidebar-logout" href="/api/auth/logout"><LogOut aria-hidden />Logout</a>
            </section>
          ) : null}
          <nav className="sidebar-utility-nav" aria-label="Utilities">
            <a href="/swagger"><BookOpen aria-hidden />API Docs</a>
          </nav>
        </div>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
