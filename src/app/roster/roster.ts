import { Component, Input, OnInit, NgZone } from '@angular/core';
import { Firestore, collection, addDoc, deleteDoc, doc, getDoc, getDocs, updateDoc, query, orderBy, limit, startAfter, DocumentData, QueryDocumentSnapshot, setDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface Player {
  id?: string;
  firstName: string;
  lastName: string;
  position: string;
  archetype?: string;
  expiration?: string;
  noTradeClause?: boolean;
  number: number;
  height?: string;
  weight?: string;
  handedness?: string;
  age?: number;
  rookie?: boolean;
  teamId: string;
  teamName?: string;
  attributes?: Record<string, number>;
  overall?: number;
  salary?: number;
  contractYears?: number;
  capHit?: number;
  signingBonus?: number;
  performanceBonus?: number;
}

@Component({
  selector: 'app-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './roster.html',
  styleUrls: ['./roster.css']
})
export class Roster implements OnInit {
  @Input() teamId!: string;

  players: Player[] = [];
  availablePlayers: Player[] = [];
  selectedPlayerId: string = '';
  lastPlayerDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  playerPageSize = 5;
  currentView: 'general' | 'attributes' | 'finances' = 'general';
  teamCapSpace: number = 85000000; // Default cap space

  skaterAttributes = [
    'SPEED', 'BODY CHK', 'ENDUR', 'PK CTRL', 'PASSING', 'SHT/PSS',
    'SLAP PWR', 'SLAP ACC', 'WRI PWR', 'WRI ACC', 'AGILITY', 'STRENGTH',
    'ACCEL', 'BALANCE', 'FACEOFF', 'DRBLTY', 'DEKE', 'AGGRE', 'POISE',
    'HND EYE', 'SHT BLK', 'OFF AWR', 'DEF AWR', 'DISCIP', 'FIGHTING',
    'STK CHK'
  ];

  goalieAttributes = [
    'GLV LOW', 'GLV HIGH', 'STK LOW', 'STK HIGH', '5 HOLE', 'SPEED',
    'AGILITY', 'CONSIS', 'PK CHK', 'ENDUR', 'BRK AWAY', 'RBD CTRL',
    'RECOV', 'POISE', 'PASSING', 'ANGLES', 'PK PL FRQ', 'AGGRE',
    'DRBLTY', 'VISION'
  ];

  constructor(private firestore: Firestore, private ngZone: NgZone) {}

  async ngOnInit() {
    await this.loadPlayers();
    await this.loadAvailablePlayers();
  }

  get hasSkaters() {
    return this.players.some(p => p.position !== 'G');
  }

  get hasGoalies() {
    return this.players.some(p => p.position === 'G');
  }

  getSkaters() {
    return this.players.filter(p => p.position !== 'G');
  }

  getGoalies() {
    return this.players.filter(p => p.position === 'G');
  }

  formatCurrency(value: number | undefined): string {
    if (!value) return '0';
    return value.toLocaleString('en-US');
  }

  calculateOverall(player: Player): number {
    if (!player.attributes) return 0;
    
    const attributes = player.position === 'G' ? this.goalieAttributes : this.skaterAttributes;
    const values = attributes.map(attr => player.attributes?.[attr] || 0);
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  async loadPlayers() {
    const rosterRef = collection(this.firestore, `teams/${this.teamId}/roster`);
    const q = query(rosterRef, orderBy('firstName'), limit(this.playerPageSize));
    const snapshot = await getDocs(q);
    this.players = await Promise.all(snapshot.docs.map(async docSnap => {
      const data = docSnap.data();
      const player: Player = {
        id: docSnap.id,
        firstName: data['firstName'] || '',
        lastName: data['lastName'] || '',
        position: data['position'] || '',
        number: data['jerseyNumber'] || 0,
        teamId: data['teamId'] || '',
        archetype: data['archetype'],
        height: data['height'],
        weight: data['weight'],
        handedness: data['handedness'],
        age: data['age'],
        rookie: data['rookie'],
        expiration: data['expiration'],
        noTradeClause: data['noTradeClause'],
        salary: data['salary'],
        contractYears: data['contractYears'],
        capHit: data['capHit'],
        signingBonus: data['signingBonus'],
        performanceBonus: data['performanceBonus']
      };

      // Load attributes
      const attributesSnap = await getDoc(doc(this.firestore, `players/${docSnap.id}/meta/attributes`));
      if (attributesSnap.exists()) {
        player.attributes = attributesSnap.data() as Record<string, number>;
        player.overall = this.calculateOverall(player);
      }

      if (data['teamId']) {
        const teamSnap = await getDoc(doc(this.firestore, `teams/${data['teamId']}`));
        player.teamName = teamSnap.exists() ? teamSnap.data()['name'] : 'Unknown';
      } else {
        const globalPlayerSnap = await getDoc(doc(this.firestore, `players/${docSnap.id}`));
        const globalData = globalPlayerSnap.data();
        if (globalData?.['teamId']) {
          const teamSnap = await getDoc(doc(this.firestore, `teams/${globalData['teamId']}`));
          player.teamId = globalData['teamId'];
          player.teamName = teamSnap.exists() ? teamSnap.data()['name'] : 'Unknown';
        } else {
          player.teamId = 'none';
        }
      }
      return player;
    }));
    this.lastPlayerDoc = snapshot.docs[snapshot.docs.length - 1] || null;
  }

  async loadAvailablePlayers() {
    const allPlayersSnap = await getDocs(collection(this.firestore, 'players'));
    const rosterSnap = await getDocs(collection(this.firestore, `teams/${this.teamId}/roster`));

    const rosterIds = new Set(rosterSnap.docs.map(doc => doc.id));

    this.availablePlayers = allPlayersSnap.docs
      .filter(doc => {
        const data = doc.data() as any;
        return !rosterIds.has(doc.id) && (data.teamId === 'none' || !data.teamId);
      })
      .map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          firstName: data['firstName'] || '',
          lastName: data['lastName'] || '',
          position: data['position'] || '',
          number: data['jerseyNumber'] || 0,
          teamId: data['teamId'] || ''
        } as Player;
      });
  }

  async loadNextPlayers() {
    if (!this.lastPlayerDoc) return;
    const rosterRef = collection(this.firestore, `teams/${this.teamId}/roster`);
    const q = query(rosterRef, orderBy('firstName'), startAfter(this.lastPlayerDoc), limit(this.playerPageSize));
    const snapshot = await getDocs(q);
    const nextPlayers = await Promise.all(snapshot.docs.map(async docSnap => {
      const data = docSnap.data();
      const player: Player = {
        id: docSnap.id,
        firstName: data['firstName'] || '',
        lastName: data['lastName'] || '',
        position: data['position'] || '',
        number: data['jerseyNumber'] || 0,
        teamId: data['teamId'] || '',
        attributes: {},
        salary: data['salary'],
        contractYears: data['contractYears'],
        capHit: data['capHit'],
        signingBonus: data['signingBonus'],
        performanceBonus: data['performanceBonus']
      };

      // Load attributes
      const attributesSnap = await getDoc(doc(this.firestore, `players/${docSnap.id}/meta/attributes`));
      if (attributesSnap.exists()) {
        player.attributes = attributesSnap.data() as Record<string, number>;
        player.overall = this.calculateOverall(player);
      }

      return player;
    }));
    this.players = [...this.players, ...nextPlayers];
    this.lastPlayerDoc = snapshot.docs[snapshot.docs.length - 1] || null;
  }

  async addPlayer() {
    if (!this.selectedPlayerId) return;

    const selected = this.availablePlayers.find(p => p.id === this.selectedPlayerId);
    if (!selected || !selected.id) return;

    const rosterDoc = doc(this.firestore, `teams/${this.teamId}/roster/${selected.id}`);
    await updateDoc(doc(this.firestore, `players/${selected.id}`), {
      teamId: this.teamId
    });
    await setDoc(rosterDoc, selected);

    this.selectedPlayerId = '';
    this.ngZone.run(() => {
      this.loadPlayers();
      this.loadAvailablePlayers();
    });
  }

  async deletePlayer(playerId: string) {
    const playerDoc = doc(this.firestore, `teams/${this.teamId}/roster/${playerId}`);
    await deleteDoc(playerDoc);

    const globalPlayerDoc = doc(this.firestore, `players/${playerId}`);
    await updateDoc(globalPlayerDoc, { teamId: 'none' });

    this.players = this.players.filter(p => p.id !== playerId);
    this.availablePlayers = this.availablePlayers.filter(p => p.id !== playerId);

    await this.loadAvailablePlayers();
  }
}