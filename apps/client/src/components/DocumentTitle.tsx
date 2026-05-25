import { useEffect, type ReactNode } from "react";

export function DocumentTitle({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return children;
}
