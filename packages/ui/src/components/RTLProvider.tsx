"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Direction = "ltr" | "rtl";
type Language = "en" | "ar";

type RTLContextValue = {
  dir: Direction;
  lang: Language;
  isRTL: boolean;
  setDir: (dir: Direction) => void;
  setLang: (lang: Language) => void;
};

const RTLContext = createContext<RTLContextValue>({
  dir: "ltr",
  lang: "en",
  isRTL: false,
  setDir: () => undefined,
  setLang: () => undefined,
});

export function RTLProvider({
  children,
  dir: initialDir = "ltr",
  lang: initialLang = "en",
}: {
  children: ReactNode;
  dir?: Direction;
  lang?: Language;
}) {
  const [dir, setDirState] = useState<Direction>(initialDir);
  const [lang, setLangState] = useState<Language>(initialLang);

  function setDir(newDir: Direction) {
    setDirState(newDir);
    document.documentElement.dir = newDir;
    document.documentElement.lang = lang;
  }

  function setLang(newLang: Language) {
    setLangState(newLang);
    document.documentElement.lang = newLang;
  }

  // Sync HTML attributes when provider mounts or initial values change
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  return (
    <RTLContext.Provider value={{ dir, lang, isRTL: dir === "rtl", setDir, setLang }}>
      {children}
    </RTLContext.Provider>
  );
}

export function useRTL() {
  return useContext(RTLContext);
}
