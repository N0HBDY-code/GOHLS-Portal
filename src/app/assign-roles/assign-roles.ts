// assign-roles.component.ts
import { Component, inject, OnInit } from '@angular/core';
import { Firestore, collection, getDocs, updateDoc, doc, arrayUnion } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-assign-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-roles.component.html',
  styleUrls: ['./assign-roles.component.css']
})
export class AssignRoles implements OnInit {
  private firestore: Firestore = inject(Firestore);

  users: any[] = [];
  allRoles = ['viewer', 'developer', 'commissioner', 'gm', 'stats monkey', 'finance officer', 'progression tracker'];

  ngOnInit(): void {
    this.loadUsers();
  }

  async loadUsers() {
    const snapshot = await getDocs(collection(this.firestore, 'users'));
    this.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async toggleRole(user: any, role: string) {
    const userRef = doc(this.firestore, 'users', user.id);
    const roles: string[] = user.roles || [];

    const updatedRoles = roles.includes(role)
      ? roles.filter(r => r !== role)
      : [...roles, role];

    await updateDoc(userRef, { roles: updatedRoles });
    user.roles = updatedRoles;
  }

  hasRole(user: any, role: string): boolean {
    return user.roles?.includes(role);
  }
}
