import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, Theme } from '../../services/theme.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="theme-toggle-container">
      <button 
        class="theme-toggle-btn"
        [attr.aria-label]="getAriaLabel()"
        [attr.aria-pressed]="currentTheme === 'dark'"
        (click)="toggleTheme()"
        type="button">
        
        <!-- Light Mode Icon -->
        <svg *ngIf="currentTheme === 'light'" 
             class="theme-icon" 
             viewBox="0 0 24 24" 
             fill="none" 
             stroke="currentColor" 
             stroke-width="2" 
             stroke-linecap="round" 
             stroke-linejoin="round"
             aria-hidden="true">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>

        <!-- Dark Mode Icon -->
        <svg *ngIf="currentTheme === 'dark'" 
             class="theme-icon" 
             viewBox="0 0 24 24" 
             fill="none" 
             stroke="currentColor" 
             stroke-width="2" 
             stroke-linecap="round" 
             stroke-linejoin="round"
             aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>

        <!-- Auto Mode Icon -->
        <svg *ngIf="currentTheme === 'auto'" 
             class="theme-icon" 
             viewBox="0 0 24 24" 
             fill="none" 
             stroke="currentColor" 
             stroke-width="2" 
             stroke-linecap="round" 
             stroke-linejoin="round"
             aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>

        <span class="theme-label">{{ getThemeLabel() }}</span>
      </button>

      <!-- Theme Options Dropdown -->
      <div class="theme-options" [class.show]="showOptions">
        <button 
          *ngFor="let option of themeOptions"
          class="theme-option"
          [class.active]="currentTheme === option.value"
          (click)="selectTheme(option.value)"
          [attr.aria-label]="'Switch to ' + option.label + ' theme'"
          type="button">
          
          <i [class]="option.icon" aria-hidden="true"></i>
          <span>{{ option.label }}</span>
          
          <i *ngIf="currentTheme === option.value" 
             class="fas fa-check theme-check" 
             aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .theme-toggle-container {
      position: relative;
      display: inline-block;
    }

    .theme-toggle-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--bs-body-bg);
      border: 2px solid var(--bs-border-color);
      border-radius: 8px;
      padding: 0.5rem 1rem;
      color: var(--bs-body-color);
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.875rem;
      font-weight: 500;
      min-width: 120px;
    }

    .theme-toggle-btn:hover {
      background: var(--bs-secondary-bg);
      border-color: var(--bs-primary);
      transform: translateY(-1px);
    }

    .theme-toggle-btn:focus {
      outline: 2px solid var(--bs-primary);
      outline-offset: 2px;
    }

    .theme-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .theme-label {
      font-size: 0.875rem;
    }

    .theme-options {
      position: absolute;
      top: 100%;
      right: 0;
      background: var(--bs-body-bg);
      border: 2px solid var(--bs-border-color);
      border-radius: 8px;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      min-width: 160px;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: all 0.2s ease;
      margin-top: 0.5rem;
    }

    .theme-options.show {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .theme-option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.75rem 1rem;
      background: none;
      border: none;
      color: var(--bs-body-color);
      cursor: pointer;
      transition: background-color 0.2s ease;
      font-size: 0.875rem;
    }

    .theme-option:hover {
      background: var(--bs-secondary-bg);
    }

    .theme-option:focus {
      outline: 2px solid var(--bs-primary);
      outline-offset: -2px;
    }

    .theme-option.active {
      background: var(--bs-primary-bg-subtle);
      color: var(--bs-primary);
    }

    .theme-check {
      margin-left: auto;
      font-size: 0.75rem;
    }

    @media (max-width: 768px) {
      .theme-toggle-btn {
        min-width: 100px;
        padding: 0.375rem 0.75rem;
      }
      
      .theme-label {
        display: none;
      }
    }
  `]
})
export class ThemeToggleComponent implements OnInit, OnDestroy {
  currentTheme: Theme = 'auto';
  showOptions = false;
  private subscription?: Subscription;

  themeOptions = [
    { value: 'light' as Theme, label: 'Light', icon: 'fas fa-sun' },
    { value: 'dark' as Theme, label: 'Dark', icon: 'fas fa-moon' },
    { value: 'auto' as Theme, label: 'Auto', icon: 'fas fa-desktop' }
  ];

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.subscription = this.themeService.theme$.subscribe(theme => {
      this.currentTheme = theme;
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', this.handleOutsideClick.bind(this));
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    document.removeEventListener('click', this.handleOutsideClick.bind(this));
  }

  toggleTheme(): void {
    this.showOptions = !this.showOptions;
  }

  selectTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
    this.showOptions = false;
  }

  getThemeLabel(): string {
    const option = this.themeOptions.find(opt => opt.value === this.currentTheme);
    return option?.label || 'Theme';
  }

  getAriaLabel(): string {
    return `Current theme: ${this.getThemeLabel()}. Click to change theme.`;
  }

  private handleOutsideClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.theme-toggle-container')) {
      this.showOptions = false;
    }
  }
}