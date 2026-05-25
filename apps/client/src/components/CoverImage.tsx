import { useState, type FocusEvent, type MouseEvent } from "react";

type CoverImageProps = {
  src: string | null | undefined;
  alt: string;
};

export function CoverImage({ src, alt }: Readonly<CoverImageProps>) {
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);

  if (!src) {
    return <div className="no-cover">No Cover</div>;
  }

  const updatePreviewPosition = (event: MouseEvent) => {
    setPreviewPosition({ x: event.clientX, y: event.clientY });
  };

  const updatePreviewPositionFromFocus = (event: FocusEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPreviewPosition({ x: rect.right, y: rect.top });
  };

  return (
    <button
      type="button"
      className="cover-wrapper"
      onBlur={() => setPreviewPosition(null)}
      onFocus={updatePreviewPositionFromFocus}
      onMouseEnter={updatePreviewPosition}
      onMouseMove={updatePreviewPosition}
      onMouseLeave={() => setPreviewPosition(null)}
    >
      <img className="game-cover-thumb" src={src} alt={alt} loading="lazy" />
      {previewPosition ? (
        <img
          className="cover-hover-preview"
          src={src}
          alt=""
          aria-hidden="true"
          style={{ left: `${previewPosition.x + 10}px`, top: `${previewPosition.y + 10}px` }}
        />
      ) : null}
    </button>
  );
}
