import { useEffect, useState } from "react";
import { BookOpen, Gamepad2, Library, LineChart, LogIn, LogOut, Menu, PlaySquare, Shield, Trophy, User, UserRound, Users, Vote, X } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks.js";

export function Layout() {
  const user = useCurrentUser();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAdmin = user.data?.role === "Admin";
  const isAuthenticated = user.data?.isAuthenticated === true;
  const navigationReady = !user.loading;
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      {navigationReady ? (
        <button
          className="sidebar-toggle"
          type="button"
          aria-controls="site-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          <span>{sidebarOpen ? "Close" : "Menu"}</span>
        </button>
      ) : null}
      <aside className="sidebar" id="site-sidebar">
        <NavLink className="brand" to="/" onClick={closeSidebar}>
          <Gamepad2 aria-hidden />
          <span>Dadson's PS2 Challenge</span>
        </NavLink>
        <nav>
          <NavLink to="/games" onClick={closeSidebar}><Library aria-hidden />Games</NavLink>
          <NavLink to="/progress" onClick={closeSidebar}><Trophy aria-hidden />Progress</NavLink>
          <NavLink to="/statistics" onClick={closeSidebar}><LineChart aria-hidden />Statistics</NavLink>
          <NavLink to="/votes" onClick={closeSidebar}><Vote aria-hidden />Votes</NavLink>
          <NavLink to="/runners" onClick={closeSidebar}><Users aria-hidden />Challenge Runners</NavLink>
          {isAuthenticated ? <NavLink to="/user" onClick={closeSidebar}><User aria-hidden />Profile</NavLink> : <NavLink to="/login" onClick={closeSidebar}><LogIn aria-hidden />Login</NavLink>}
          {isAdmin ? <NavLink to="/admin" onClick={closeSidebar}><Shield aria-hidden />Admin</NavLink> : null}
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
              <NavLink className="sidebar-user-link" to="/user" aria-label={`Open profile for ${user.data?.username ?? "user"}`} onClick={closeSidebar}>
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
      {navigationReady ? <button className="sidebar-backdrop" type="button" aria-label="Dismiss navigation overlay" onClick={closeSidebar} /> : null}
      <main>
        <Outlet />
      </main>
    </div>
  );
}
