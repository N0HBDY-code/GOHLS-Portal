import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Auths } from '../auth-service/auth-service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private authService = inject(Auths);
  private router = inject(Router);

  username = '';
  password = '';
  errorMessage = '';

  login() {
    if (this.username === '') {
      alert('Please enter your username');
      return;
    }

    if (this.password === '') {
      alert('Please enter your password');
      return;
    }

    this.authService.login(this.username, this.password)
      .then(() => {
        this.router.navigate(['/dashboard']);
        this.username = '';
        this.password = '';
      })
      .catch(err => {
        console.error('Login failed:', err);
        this.errorMessage = 'Login failed: ' + err.message;
      });
  }
}