import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { Auths } from './auth-service/auth-service';
export const RoleGuard = (allowedRoles: string[]): CanActivateFn => {
  return () => {
    const authService = inject(Auths);
    const router = inject(Router);
    
    return authService.effectiveRoles.pipe(
      map(roles => {
        const hasAccess = roles.some(role => {
          // Handle team-specific GM roles
          if (role.startsWith('gm:')) {
            return allowedRoles.includes('gm');
          }
          return allowedRoles.includes(role);
        });
        if (hasAccess) {
          return true;
        } else {
          router.navigate(['/unauthorized']);
          return false;
        }
      })
    );
  };
};
