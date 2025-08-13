import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'light' | 'dark' | 'auto';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'gohls-theme-preference';
  private themeSubject = new BehaviorSubject<Theme>('auto');
  public theme$ = this.themeSubject.asObservable();

  private mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.initializeTheme();
    this.setupMediaQueryListener();
  }

  private initializeTheme(): void {
    const savedTheme = localStorage.getItem(this.STORAGE_KEY) as Theme;
    const initialTheme = savedTheme || 'auto';
    
    this.setTheme(initialTheme);
  }

  private setupMediaQueryListener(): void {
    this.mediaQuery.addEventListener('change', () => {
      if (this.themeSubject.value === 'auto') {
        this.applyTheme('auto');
      }
    });
  }

  setTheme(theme: Theme): void {
    this.themeSubject.next(theme);
    this.applyTheme(theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
  }

  private applyTheme(theme: Theme): void {
    const root = document.documentElement;
    
    // Remove existing theme classes
    root.classList.remove('theme-light', 'theme-dark');
    
    // Determine actual theme to apply
    let actualTheme: 'light' | 'dark';
    
    if (theme === 'auto') {
      actualTheme = this.mediaQuery.matches ? 'dark' : 'light';
    } else {
      actualTheme = theme;
    }
    
    // Apply theme class
    root.classList.add(`theme-${actualTheme}`);
    
    // Update meta theme-color for mobile browsers
    this.updateMetaThemeColor(actualTheme);
  }

  private updateMetaThemeColor(theme: 'light' | 'dark'): void {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const color = theme === 'dark' ? '#1a1a1a' : '#ffffff';
    
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', color);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = color;
      document.head.appendChild(meta);
    }
  }

  getCurrentTheme(): Theme {
    return this.themeSubject.value;
  }

  getActualTheme(): 'light' | 'dark' {
    const currentTheme = this.getCurrentTheme();
    if (currentTheme === 'auto') {
      return this.mediaQuery.matches ? 'dark' : 'light';
    }
    return currentTheme;
  }
}