import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Auths } from '../auth-service/auth-service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
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
      this.errorMessage = 'Please enter your username';
      return;
    }

    if (this.password === '') {
      this.errorMessage = 'Please enter your password';
      return;
    }

    // Clear any previous error messages
    this.errorMessage = '';
    this.authService.login(this.username, this.password)
      .then(() => {
        this.router.navigate(['/dashboard']);
        this.username = '';
        this.password = '';
        this.errorMessage = '';
      })
      .catch(err => {
        console.error('Login failed:', err);
        // Provide user-friendly error messages
        if (err.code === 'auth/user-not-found') {
          this.errorMessage = 'Username not found. Please check your username or register for a new account.';
        } else if (err.code === 'auth/wrong-password') {
          this.errorMessage = 'Incorrect password. Please try again.';
        } else if (err.code === 'auth/invalid-email') {
          this.errorMessage = 'Invalid email format.';
        } else if (err.message === 'Username not found') {
          this.errorMessage = 'Username not found. Please check your username or register for a new account.';
        } else {
          this.errorMessage = 'Login failed: ' + err.message;
        }
      });
  }
}