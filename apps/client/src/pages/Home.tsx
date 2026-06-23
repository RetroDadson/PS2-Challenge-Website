import { ArrowRight, Gamepad2, Trophy, Users } from "lucide-react";
import { Link } from "react-router-dom";

export function Home() {
  return (
    <section className="page home-page">
      <div className="home-hero">
        <h1>Welcome to Dadson's PS2 Challenge</h1>
        <p>Track my progress on completing all PS2 games!</p>
      </div>

      <section className="panel home-panel">
        <p>
          This is to track progress on my challenge of playing through all the PS2 games released in PAL
          and North American regions with the exception of a few!
        </p>

        <div className="home-actions">
          <Link to="/games">View All Games</Link>
          <Link to="/progress">View Progress</Link>
          <Link to="/statistics">View Statistics</Link>
          <Link to="/votes">View Votes</Link>
        </div>

        <p>Follow the journey on Twitch and YouTube</p>

        <div className="social-links">
          <a href="https://twitch.tv/retrodadson" target="_blank" rel="noreferrer" aria-label="Twitch">
            <img src="/assets/glitch_flat_purple.svg" alt="" />
          </a>
          <a href="https://www.youtube.com/@dadson1996" target="_blank" rel="noreferrer" aria-label="YouTube">
            <img src="/assets/yt_icon_red_digital.png" alt="" />
          </a>
        </div>
      </section>

      <section className="home-runners-feature" aria-labelledby="home-runners-heading">
        <div className="home-runners-visual" aria-hidden="true">
          <span className="home-runners-orbit home-runners-orbit-one" />
          <span className="home-runners-orbit home-runners-orbit-two" />
          <span className="home-runners-node home-runners-node-games"><Gamepad2 /></span>
          <span className="home-runners-node home-runners-node-trophy"><Trophy /></span>
          <span className="home-runners-node home-runners-node-community"><Users /></span>
          <div className="home-runners-visual-copy">
            <strong>One community</strong>
            <span>Countless challenges</span>
          </div>
        </div>

        <div className="home-runners-copy">
          <p className="home-runners-eyebrow">Beyond the PS2</p>
          <h2 id="home-runners-heading">Meet other console challenge runners</h2>
          <p>
            Find creators taking on complete libraries, regional collections, and ambitious gaming
            journeys across different consoles.
          </p>
          <Link className="home-runners-link" to="/runners">
            Explore the runner directory <ArrowRight aria-hidden />
          </Link>
        </div>
      </section>
    </section>
  );
}
