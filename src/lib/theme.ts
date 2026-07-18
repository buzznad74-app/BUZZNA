/**
 * Centralized Theme Provider
 * Manages light/dark mode persistence and dynamic color injection
 */

export type ThemeMode = 'light' | 'dark';
export type VerticalTheme = 'retail' | 'butchery' | 'mitumba' | 'hardware' | 'cyber';

export interface ThemeConfig {
  mode: ThemeMode;
  vertical: VerticalTheme;
  brandColor: string;
}

const DEFAULT_CONFIG: ThemeConfig = {
  mode: 'light',
  vertical: 'retail',
  brandColor: 'indigo'
};

class ThemeManager {
  private config: ThemeConfig = DEFAULT_CONFIG;
  private listeners: Set<(config: ThemeConfig) => void> = new Set();

  constructor() {
    this.loadFromStorage();
    this.applyTheme();
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('buzzna_theme_config');
      if (saved) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (err) {
      console.warn('Failed to load theme config:', err);
    }
  }

  private applyTheme(): void {
    if (this.config.mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  public setMode(mode: ThemeMode): void {
    this.config.mode = mode;
    this.applyTheme();
    this.saveToStorage();
    this.notifyListeners();
  }

  public setVertical(vertical: VerticalTheme): void {
    this.config.vertical = vertical;
    this.saveToStorage();
    this.notifyListeners();
  }

  public setColor(color: string): void {
    this.config.brandColor = color;
    this.saveToStorage();
    this.notifyListeners();
  }

  public getConfig(): ThemeConfig {
    return { ...this.config };
  }

  public subscribe(listener: (config: ThemeConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('buzzna_theme_config', JSON.stringify(this.config));
    } catch (err) {
      console.warn('Failed to save theme config:', err);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.config));
  }
}

export const themeManager = new ThemeManager();
export default themeManager;
