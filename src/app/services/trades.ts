import { Injectable } from '@angular/core';
import { Firestore, doc, updateDoc, collection, addDoc, getDocs, query, where, DocumentReference, writeBatch, getDoc } from '@angular/fire/firestore';

export interface TradeOffer {
  id?: string;
  fromTeamId: string;
  toTeamId: string;
  playersOffered: string[];
  playersRequested: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'awaiting_approval' | 'approved' | 'denied';
  timestamp: Date;
  fromTeamAccepted?: boolean;
  toTeamAccepted?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class Trades {
  constructor(private firestore: Firestore) {}

  async proposeTrade(offer: Omit<TradeOffer, 'status' | 'timestamp' | 'id'>) {
    const tradeData: Omit<TradeOffer, 'id'> = {
      ...offer,
      status: 'pending',
      timestamp: new Date(),
      fromTeamAccepted: true,
      toTeamAccepted: false
    };

    await addDoc(collection(this.firestore, 'tradeOffers'), tradeData);
  }

  async getTradeOffersForTeam(teamId: string): Promise<TradeOffer[]> {
    const offersRef = collection(this.firestore, 'tradeOffers');
    const q = query(offersRef, where('toTeamId', '==', teamId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ 
      id: doc.id,
      ...doc.data() as Omit<TradeOffer, 'id'>
    }));
  }

  async getPendingTradeApprovals(): Promise<TradeOffer[]> {
    const offersRef = collection(this.firestore, 'tradeOffers');
    const q = query(offersRef, where('status', '==', 'awaiting_approval'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() as Omit<TradeOffer, 'id'>
    }));
  }

  async acceptTrade(tradeOffer: TradeOffer) {
    if (!tradeOffer.id) return;

    const tradeRef = doc(this.firestore, 'tradeOffers', tradeOffer.id);
    
    if (tradeOffer.toTeamId === tradeOffer.fromTeamId) {
      throw new Error('Cannot trade with the same team');
    }

    // Update the accepting team's status
    const updates: Partial<TradeOffer> = {
      toTeamAccepted: true
    };

    // If both teams have accepted, move to awaiting approval
    if (tradeOffer.fromTeamAccepted) {
      updates.status = 'awaiting_approval';
    }

    await updateDoc(tradeRef, updates);
  }

  async approveTrade(tradeOffer: TradeOffer) {
    if (!tradeOffer.id) return;

    const batch = writeBatch(this.firestore);
    const tradeRef = doc(this.firestore, `tradeOffers/${tradeOffer.id}`);

    // Update trade status to approved
    batch.update(tradeRef, { status: 'approved' });

    // Process the player transfers
    if (tradeOffer.playersOffered.length > 0) {
      for (const playerId of tradeOffer.playersOffered) {
        await this.addPlayerToBatch(batch, playerId, tradeOffer.fromTeamId, tradeOffer.toTeamId);
      }
    }

    if (tradeOffer.playersRequested.length > 0) {
      for (const playerId of tradeOffer.playersRequested) {
        await this.addPlayerToBatch(batch, playerId, tradeOffer.toTeamId, tradeOffer.fromTeamId);
      }
    }

    await batch.commit();
  }

  async denyTrade(tradeOffer: TradeOffer) {
    if (!tradeOffer.id) return;
    
    const tradeRef = doc(this.firestore, `tradeOffers/${tradeOffer.id}`);
    await updateDoc(tradeRef, { status: 'denied' });
  }

  async rejectTrade(tradeOffer: TradeOffer) {
    if (!tradeOffer.id) return;
    
    const tradeRef = doc(this.firestore, `tradeOffers/${tradeOffer.id}`);
    await updateDoc(tradeRef, { 
      status: 'rejected',
      toTeamAccepted: false,
      fromTeamAccepted: false
    });
  }

  private async addPlayerToBatch(batch: any, playerId: string, fromTeamId: string, toTeamId: string) {
    // Get player data from the old team's roster
    const oldTeamRosterRef = doc(this.firestore, `teams/${fromTeamId}/roster/${playerId}`);
    const oldTeamRosterSnap = await getDoc(oldTeamRosterRef);
    
    if (!oldTeamRosterSnap.exists()) {
      console.warn(`Player ${playerId} not found in team ${fromTeamId}'s roster`);
      return;
    }

    const playerData = oldTeamRosterSnap.data();
    const playerRef = doc(this.firestore, `players/${playerId}`);
    const newTeamRosterRef = doc(this.firestore, `teams/${toTeamId}/roster/${playerId}`);

    // Update player's team ID
    batch.update(playerRef, { teamId: toTeamId });
    
    // Remove from old team
    batch.delete(oldTeamRosterRef);
    
    // Add to new team
    batch.set(newTeamRosterRef, { ...playerData, teamId: toTeamId });
  }
}