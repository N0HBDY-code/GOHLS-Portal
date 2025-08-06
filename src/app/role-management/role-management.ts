import { Component, inject, OnInit } from '@angular/core';
import { Firestore, collection, getDocs, updateDoc, doc, arrayUnion, arrayRemove } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './role-management.component.html',
  styleUrls: ['./role-management.component.css']
})
export class RoleManagement implements OnInit {
  private firestore = inject(Firestore);

  users: any[] = [];
  loading = true;
  selectedRole = '';
  availableRoles = [
    'viewer',
    'developer',
    'commissioner',
    'gm',
    'stats monkey',
    'finance officer',
    'progression tracker'
  ];

  async ngOnInit() {
    const snapshot = await getDocs(collection(this.firestore, 'users'));
    this.users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    this.loading = false;
  }

  async addRole(userId: string, role: string) {
    if (!role) return;
    const userRef = doc(this.firestore, 'users', userId);
    await updateDoc(userRef, {
      roles: arrayUnion(role)
    });
    await this.ngOnInit();
  }

  async removeRole(userId: string, role: string) {
    const userRef = doc(this.firestore, 'users', userId);
    await updateDoc(userRef, {
      roles: arrayRemove(role)
    });
    await this.ngOnInit();
  }
}
