import { useRef } from "react";

export function useDoubleTap(onDoubleTap: () => void, delay = 300) {
  const lastTap = useRef<number | null>(null);

  return () => {
    const now = Date.now();

    if (lastTap.current && now - lastTap.current < delay) {
      onDoubleTap();
      lastTap.current = null; // reset
    } else {
      lastTap.current = now;
    }
  };
}