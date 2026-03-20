import { useEffect, useState } from "react";

export function useNowTick(enabled: boolean): string {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setTick(Date.now());
    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [enabled]);

  return new Date(tick).toISOString();
}
