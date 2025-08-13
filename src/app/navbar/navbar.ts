import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Auths } from '../auth-service/auth-service';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class Navbar implements OnInit, OnDestroy {
  isDeveloper = false;
  isLoggedIn = false;
  viewAsRoles: string[] = [];
  allRoles: string[] = [
    'viewer',
    'commissioner',
    'stats monkey',
    'finance officer',
    'progression tracker',
  ];

  private rolesSub!: Subscription;
  private viewAsSub!: Subscription;
  private userSub!: Subscription;
  allowedRolesForProgression = ['developer', 'commissioner', 'progression tracker'];
  canSeeProgression = false;
  constructor(private authService: Auths, private router: Router) {}

  ngOnInit(): void {
    this.userSub = this.authService.currentUser.subscribe(user => {
      this.isLoggedIn = !!user;
    });

    this.rolesSub = this.authService.currentRoles.subscribe(roles => {
      this.isDeveloper = roles.includes('developer'); // only real role
    });
  
    this.viewAsSub = this.authService.effectiveRoles.subscribe(roles => {
      this.viewAsRoles = roles;
      this.canSeeProgression = roles.some(role => this.allowedRolesForProgression.includes(role));
    });
  }
  

  onRoleChange(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value;
    this.authService.setViewAsRole(selected === 'real' ? null : selected);
  }

  logout(): void {
    this.authService.logout().then(() => {
      this.router.navigate(['/login']);
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.rolesSub?.unsubscribe();
    this.viewAsSub?.unsubscribe();
  }
}
