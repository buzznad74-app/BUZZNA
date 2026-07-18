import React, { createContext, useContext, useState, useEffect } from 'react';
import { themeManager, ThemeMode, VerticalTheme, ThemeConfig } from '../lib/theme';

interface ThemeContextType {
  config: ThemeConfig;
  setMode: (mode: ThemeMode) => void;
  setVertical: (vertical: VerticalTheme) => void;
  setColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState(themeManager.getConfig());

  useEffect(() => {
    const unsubscribe = themeManager.subscribe(setConfig);
    return () => unsubscribe();
  }, []);

  return (
    <ThemeContext.Provider value={{ config, setMode: themeManager.setMode, setVertical: themeManager.setVertical, setColor: themeManager.setColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
