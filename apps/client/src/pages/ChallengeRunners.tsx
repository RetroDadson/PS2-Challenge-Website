import type { ChallengeRunnerDto, ChallengeRunnerInput } from "@ps2-challenge/shared";
import { Edit3, Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { api } from "../api.js";
import { ChallengeRunnerModal } from "../components/ChallengeRunnerModal.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { useAsync, useCurrentUser } from "../hooks.js";

export function ChallengeRunners() {
  const user = useCurrentUser();
  const runners = useAsync(() => api.challengeRunners(), []);
  const [editing, setEditing] = useState<ChallengeRunnerDto | null | undefined>(undefined);
  const isAdmin = user.data?.role === "Admin";

  if (user.loading || runners.loading) return <Loading />;
  if (user.error || runners.error) return <ErrorMessage message={user.error ?? runners.error ?? ""} />;

  const save = (input: ChallengeRunnerInput) => editing
    ? api.updateChallengeRunner(editing.id, input)
    : api.createChallengeRunner(input);

  const remove = async (id: number) => {
    await api.deleteChallengeRunner(id);
    setEditing(undefined);
    await runners.reload({ showLoading: false });
  };

  return (
    <section className="page runners-page">
      <header className="page-header">
        <div>
          <p>Community</p>
          <h1>Other Challenge Runners</h1>
        </div>
        {isAdmin ? <button onClick={() => setEditing(null)}><Plus />Add Runner</button> : null}
      </header>

      <p className="page-introduction">
        Discover other creators taking on ambitious gaming challenges and follow their journeys.
      </p>

      {(runners.data ?? []).length === 0 ? (
        <Empty>No challenge runners have been added yet.</Empty>
      ) : (
        <div className="runner-card-list">
          {(runners.data ?? []).map((runner) => (
            <article className="runner-card" key={runner.id}>
              <div className="runner-card-logo">
                {runner.logoUrl ? (
                  <img className="runner-logo" src={runner.logoUrl} alt={`${runner.name} logo`} />
                ) : (
                  <span className="runner-logo-placeholder" aria-label={`No logo available for ${runner.name}`}><UserRound aria-hidden /></span>
                )}
              </div>

              <div className="runner-card-main">
                <div className="runner-card-header">
                  <h2 className="runner-name">{runner.name}</h2>
                  {isAdmin ? (
                    <button className="secondary runner-edit-button" onClick={() => setEditing(runner)} aria-label={`Edit ${runner.name}`}>
                      <Edit3 />Edit
                    </button>
                  ) : null}
                </div>

                <p className="runner-description">{runner.description}</p>

                <div className="runner-channel-actions" aria-label={`Channels for ${runner.name}`}>
                  {runner.twitchUrl ? <ChannelLink platform="Twitch" name={runner.name} url={runner.twitchUrl} /> : <span className="runner-channel-missing">Twitch not listed</span>}
                  {runner.youtubeUrl ? <ChannelLink platform="YouTube" name={runner.name} url={runner.youtubeUrl} /> : <span className="runner-channel-missing">YouTube not listed</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing === undefined ? null : (
        <ChallengeRunnerModal
          runner={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => runners.reload({ showLoading: false })}
          onSave={save}
          onDelete={remove}
        />
      )}
    </section>
  );
}

function ChannelLink({ platform, name, url }: Readonly<{ platform: "Twitch" | "YouTube"; name: string; url: string }>) {
  const icon = platform === "Twitch" ? "/assets/glitch_flat_purple.svg" : "/assets/yt_icon_red_digital.png";
  return (
    <a
      className={`runner-channel-link ${platform.toLocaleLowerCase("en-GB")}`}
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${platform} for ${name}`}
    >
      <span className="runner-channel-icon" aria-hidden="true">
        <img src={icon} alt="" />
      </span>
      <span>{platform}</span>
    </a>
  );
}
