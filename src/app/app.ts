import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Navbar } from './navbar/navbar';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, Navbar],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent {
  showNavbar = true;
  private router = inject(Router);
  title = 'GOHLS';
  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      const noNavbarRoutes = ['/login', '/register', '/forgot-password'];
      this.showNavbar = !noNavbarRoutes.includes(event.urlAfterRedirects);
    });
  }
}
