import { loadConfig } from "../apps/server/src/config.js";
import { eventSubSecret } from "../apps/server/src/services/eventSubSignature.js";

const secret = eventSubSecret(loadConfig().twitchClientSecret);
if (!secret) {
  console.error("Set the Twitch client secret first (TWITCH_CLIENT_SECRET or Twitch:ClientSecret in appsettings).");
  process.exit(1);
}
console.log(secret);
