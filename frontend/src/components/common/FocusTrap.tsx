"use client";

import { useEffect, useRef } from "react";

interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
}

/**
 * Traps keyboard focus within the component.
 * Tab cycles through focusable elements, never escaping to background.
 */
export default function FocusTrap({ children, active = true }: FocusTrapProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;

    const el = ref.current;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Focus first element on mount
    first.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [active]);

  return (
    <div ref={ref} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}
