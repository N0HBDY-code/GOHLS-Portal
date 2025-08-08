import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Auths } from '../auth-service/auth-service';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css'
})
export class ForgotPassword {

  private authService = inject(Auths);

  email: string = '';

  forgotPassword() {
    this.authService.forgotPassword(this.email);
    this.email = '';
  }
}