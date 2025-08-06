import { Injectable } from '@angular/core';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class FreeAgency {
  constructor(private firestore: Firestore) {}

  async getFreeAgents() {
    const playersRef = collection(this.firestore, 'players');
    const q = query(playersRef, where('teamId', '==', 'none'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getExpiredContracts() {
    const now = new Date();
    const playersRef = collection(this.firestore, 'players');
    const q = query(playersRef, where('contractExpiration', '<=', now));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}