import { Copy, ExternalLink } from "lucide-react";
import { useId, useState } from "react";

export function subPicksOverlayPath(show: string, every: string): string {
  const params = new URLSearchParams();
  if (show.trim()) params.set("show", show.trim());
  if (every.trim()) params.set("every", every.trim());
  const query = params.toString();
  return query ? `/sub-picks-overlay?${query}` : "/sub-picks-overlay";
}

export function SubPicksOverlayLink() {
  const id = useId();
  const [show, setShow] = useState("");
  const [every, setEvery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const path = subPicksOverlayPath(show, every);
  const url = `${globalThis.location.origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Copied");
    } catch {
      setCopied("Copy failed, select the link and copy it instead");
    }
  };

  return (
    <section className="sub-overlay-builder" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>Sub Picks Overlay</h3>
      <p className="muted">
        Use this link as an OBS browser source, 1000 pixels wide. Leave both boxes empty to keep it on screen, or fill them in to make it pop up on a timer.
        If you only fill in one, the other uses 20 seconds on screen or 15 minutes between appearances.
      </p>
      <div className="form-grid">
        <div className="sub-overlay-field">
          <label htmlFor={`${id}-show`}>Seconds on screen (show)</label>
          <input
            id={`${id}-show`}
            type="number"
            min={1}
            placeholder="e.g. 20"
            value={show}
            aria-describedby={`${id}-show-hint`}
            onChange={(event) => { setShow(event.target.value); setCopied(null); }}
          />
          <small id={`${id}-show-hint`} className="muted">How long it stays up each time.</small>
        </div>
        <div className="sub-overlay-field">
          <label htmlFor={`${id}-every`}>Seconds between appearances (every)</label>
          <input
            id={`${id}-every`}
            type="number"
            min={0}
            placeholder="e.g. 900"
            value={every}
            aria-describedby={`${id}-every-hint`}
            onChange={(event) => { setEvery(event.target.value); setCopied(null); }}
          />
          <small id={`${id}-every-hint`} className="muted">How often it comes back, e.g. 900 is every 15 minutes. 0 keeps it on screen.</small>
        </div>
      </div>
      <div className="sub-overlay-builder-url">
        <input readOnly value={url} aria-label="Sub Picks overlay link" onFocus={(event) => event.target.select()} />
        <button type="button" className="secondary" onClick={() => void copy()}><Copy aria-hidden />Copy</button>
        <a className="button-link secondary" href={path} target="_blank" rel="noreferrer">Open <ExternalLink aria-hidden /></a>
      </div>
      {copied ? <output className="muted">{copied}</output> : null}
    </section>
  );
}
