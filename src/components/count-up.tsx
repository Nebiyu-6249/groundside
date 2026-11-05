"use client";

import { useEffect, useRef, useState } from "react";

/** Short count-up of a euro total when it grows (SPEC 12); instant with reduced motion. */
export function CountUpEuros({ cents }: { cents: number }) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);
  useEffect(() => {
    const start = from.current;
    from.current = cents;
    if (start === cents || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(cents);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setShown(Math.round(start + (cents - start) * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents]);
  return <span aria-label={`${(cents / 100).toFixed(2)} EUR`}>{(shown / 100).toFixed(2)} EUR</span>;
}
