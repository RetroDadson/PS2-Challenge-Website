import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { DocumentTitle } from "./components/DocumentTitle.js";
import { Layout } from "./components/Layout.js";
import { Admin } from "./pages/Admin.js";
import { Games } from "./pages/Games.js";
import { Home } from "./pages/Home.js";
import { Login } from "./pages/Login.js";
import { NotFound } from "./pages/NotFound.js";
import { BlankOverlay, ProgressOverlay, VoteCoversOverlay, VotesOverlay } from "./pages/Overlays.js";
import { Progress } from "./pages/Progress.js";
import { Statistics } from "./pages/Statistics.js";
import { UserPage } from "./pages/User.js";
import { Votes } from "./pages/Votes.js";
import { ChallengeRunners } from "./pages/ChallengeRunners.js";
import "./styles/app.css";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <DocumentTitle title="Home - Dadson's PS2 Challenge"><Home /></DocumentTitle> },
      { path: "/games", element: <DocumentTitle title="Games - Dadson's PS2 Challenge"><Games /></DocumentTitle> },
      { path: "/progress", element: <DocumentTitle title="Game Progress - Dadson's PS2 Tracker"><Progress /></DocumentTitle> },
      { path: "/statistics", element: <DocumentTitle title="Statistics - Dadson's PS2 Challenge"><Statistics /></DocumentTitle> },
      { path: "/votes", element: <DocumentTitle title="Vote History - Dadson's PS2 Tracker"><Votes /></DocumentTitle> },
      { path: "/runners", element: <DocumentTitle title="Challenge Runners - Dadson's PS2 Challenge"><ChallengeRunners /></DocumentTitle> },
      { path: "/login", element: <DocumentTitle title="Login - Dadson's PS2 Challenge"><Login /></DocumentTitle> },
      { path: "/user", element: <DocumentTitle title="User Profile - Dadson's PS2 Challenge"><UserPage /></DocumentTitle> },
      { path: "/admin", element: <DocumentTitle title="Admin Panel - Dadson's PS2 Challenge"><Admin /></DocumentTitle> },
      { path: "*", element: <DocumentTitle title="Not found"><NotFound /></DocumentTitle> }
    ]
  },
  { path: "/blank-overlay", element: <BlankOverlay /> },
  { path: "/progress-overlay", element: <ProgressOverlay /> },
  { path: "/vote-covers-overlay", element: <VoteCoversOverlay /> },
  { path: "/votes-overlay", element: <VotesOverlay /> }
]);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
