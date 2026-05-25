import { LogIn } from "lucide-react";
import { useLocation } from "react-router-dom";

export function Login() {
  const location = useLocation();
  const queryReturnUrl = new URLSearchParams(location.search).get("returnUrl");
  const stateReturnUrl = stateReturnUrlFrom(location.state);
  const returnUrl = queryReturnUrl || stateReturnUrl || "/";
  return (
    <section className="panel narrow">
      <h1>Login with Twitch</h1>
      <p>Sign in to manage the challenge, update votes, and view your profile.</p>
      <a className="button-link" href={`/api/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`}>
        <LogIn />Login with Twitch
      </a>
    </section>
  );
}

function stateReturnUrlFrom(state: unknown): string {
  if (typeof state !== "object" || !state || !("from" in state)) {
    return "";
  }

  const from = (state as { from?: unknown }).from;
  return typeof from === "string" ? from : "";
}
