"use client";

import { createContext, useContext, type ReactNode } from "react";

type Direction = "ltr" | "rtl";
type Language = "en" | "ar";

type RTLContextValue = {
  dir: Direction;
  lang: Language;
  isRTL: boolean;
};

const RTLContext = createContext<RTLContextValue>({
  dir: "ltr",
  lang: "en",
  isRTL: false,
});

export function RTLProvider({
  children,
  dir = "ltr",
  lang = "en",
}: {
  children: ReactNode;
  dir?: Direction;
  lang?: Language;
}) {
  return (
    <RTLContext.Provider value={{ dir, lang, isRTL: dir === "rtl" }}>
      {children}
    </RTLContext.Provider>
  );
}

export function useRTL() {
  return useContext(RTLContext);
}
