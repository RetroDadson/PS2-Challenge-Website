import type { ReactNode } from "react";
import { useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

export function ModalDialog({
  children,
  onClose,
  title
}: Readonly<{
  children: ReactNode;
  onClose: () => void;
  title: string;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute("open", "");
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="modal-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button className="modal-dialog-backdrop" type="button" onClick={onClose} aria-label="Close dialog backdrop" tabIndex={-1} />
      <section className="modal">
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </header>
        {children}
      </section>
    </dialog>
  );
}
