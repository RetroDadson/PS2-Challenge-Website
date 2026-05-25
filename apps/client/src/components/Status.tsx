import type { ReactNode } from "react";

export function Loading() {
  return <div className="status">Loading...</div>;
}

export function ErrorMessage({ message }: Readonly<{ message: string }>) {
  return <div className="status error">{message}</div>;
}

export function Empty({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="status">{children}</div>;
}
