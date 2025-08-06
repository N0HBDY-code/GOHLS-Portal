// assign-roles.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { Firestore, collection, getDocs, updateDoc, doc, arrayUnion } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-assign-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-roles.html',
  styleUrls: ['./assign-roles.css']
})
export class AssignRoles implements OnInit {
  private firestore: Firestore = inject(Firestore);

  email: string = '';
  selectedRoles: string[] = [];
  successMessage: string = '';
  errorMessage: string = '';
  availableRoles = ['viewer', 'developer', 'commissioner', 'gm', 'stats monkey', 'finance officer', 'progression tracker'];

  users: any[] = [];

  ngOnInit(): void {
    this.loadUsers();
  }

  async loadUsers() {
    const snapshot = await getDocs(collection(this.firestore, 'users'));
    this.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  toggleRole(role: string) {
    const index = this.selectedRoles.indexOf(role);
    if (index > -1) {
      this.selectedRoles.splice(index, 1);
    } else {
      this.selectedRoles.push(role);
    }
  }

  async assignRoles() {
    if (!this.email || this.selectedRoles.length === 0) {
      this.errorMessage = 'Please enter an email and select at least one role';
      this.successMessage = '';
      return;
    }

    try {
      // Find user by email
      const usersSnapshot = await getDocs(collection(this.firestore, 'users'));
      const userDoc = usersSnapshot.docs.find(doc => doc.data()['email'] === this.email);
      
      if (!userDoc) {
        this.errorMessage = 'User not found with that email address';
        this.successMessage = '';
        return;
      }

      // Update user roles
      const userRef = doc(this.firestore, 'users', userDoc.id);
      await updateDoc(userRef, {
        roles: this.selectedRoles
      });

      this.successMessage = `Roles assigned successfully to ${this.email}`;
      this.errorMessage = '';
      this.email = '';
      this.selectedRoles = [];
    } catch (error) {
      console.error('Error assigning roles:', error);
      this.errorMessage = 'Failed to assign roles. Please try again.';
      this.successMessage = '';
    }
  }
}
