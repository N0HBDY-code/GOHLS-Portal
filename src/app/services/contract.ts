import { Injectable } from '@angular/core';
import { Firestore, doc, updateDoc, collection, addDoc, getDocs, query, where } from '@angular/fire/firestore';

export interface ContractOffer {
  playerId: string;
  teamId: string;
  salary: number;
  years: number;
  signingBonus: number;
  performanceBonus: number;
  noTradeClause: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class Contract {
  constructor(private firestore: Firestore) {}

  async makeOffer(offer: Omit<ContractOffer, 'status' | 'timestamp'>) {
    const offerData: ContractOffer = {
      ...offer,
      status: 'pending',
      timestamp: new Date()
    };

    await addDoc(collection(this.firestore, 'contractOffers'), offerData);
  }

  async getOffersForPlayer(playerId: string) {
    const offersRef = collection(this.firestore, 'contractOffers');
    const q = query(offersRef, where('playerId', '==', playerId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async getOffersForTeam(teamId: string) {
    const offersRef = collection(this.firestore, 'contractOffers');
    const q = query(offersRef, where('teamId', '==', teamId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async acceptOffer(playerId: string, offer: ContractOffer) {
    const playerRef = doc(this.firestore, `players/${playerId}`);
    await updateDoc(playerRef, {
      teamId: offer.teamId,
      salary: offer.salary,
      contractYears: offer.years,
      signingBonus: offer.signingBonus,
      performanceBonus: offer.performanceBonus,
      noTradeClause: offer.noTradeClause,
      contractExpiration: new Date().setFullYear(new Date().getFullYear() + offer.years)
    });

    // Add player to team roster
    const rosterRef = doc(this.firestore, `teams/${offer.teamId}/roster/${playerId}`);
    await updateDoc(rosterRef, {
      salary: offer.salary,
      contractYears: offer.years,
      signingBonus: offer.signingBonus,
      performanceBonus: offer.performanceBonus,
      noTradeClause: offer.noTradeClause
    });
  }
}