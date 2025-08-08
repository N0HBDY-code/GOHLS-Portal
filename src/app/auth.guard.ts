import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { Auths } from './auth-service/auth-service';

export const AuthGuard: CanActivateFn = () => {
  const authService = inject(Auths);
  const router = inject(Router);
  
  return authService.currentUser.pipe(
    map(user => {
      if (user) {
        return true;
      } else {
        router.navigate(['/login']);
        return false;
      }
    })
  );
};