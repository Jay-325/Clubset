"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

type OtterState = "idle" | "swimming" | "eating" | "sleeping" | "working";

interface OtterContextType {
  overrideState: OtterState | null;
  setOverrideState: (state: OtterState | null) => void;
}

const OtterContext = createContext<OtterContextType | null>(null);

export function OtterProvider({ children }: { children: ReactNode }) {
  const [overrideState, setOverrideState] = useState<OtterState | null>(null);

  // Auto-clear eating override after 2 seconds (celebration duration)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (overrideState === "eating") {
      timer = setTimeout(() => setOverrideState(null), 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [overrideState]);

  return (
    <OtterContext.Provider value={{ overrideState, setOverrideState }}>
      {children}
    </OtterContext.Provider>
  );
}

export function useOtterOverride() {
  const context = useContext(OtterContext);
  if (context) return context;
  return { overrideState: null, setOverrideState: () => {} };
}
