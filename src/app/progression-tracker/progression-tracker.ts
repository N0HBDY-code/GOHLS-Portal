import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore,
  collection,
  getDocs,
  updateDoc,
  doc,
  CollectionReference,
  getDoc,
  setDoc,
  addDoc,
  query,
  where
} from '@angular/fire/firestore';
import { getDefaultAttributes } from '../services/progression-default';
import { Auths } from '../auth-service/auth-service';

@Component({
  selector: 'app-progression-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './progression-tracker.html',
  styleUrls: ['./progression-tracker.css']
})
export class ProgressionTracker implements OnInit {
  private firestore = inject(Firestore);
  private authService = inject(Auths);

  teams: { id: string, name: string, logoUrl?: string }[] = [];
  selectedTeamId: string = '';
  roster: any[] = [];
  loading = false;

  // Permission control
  canManageWeeks = false;
  canManageOverall = false;

  // Current progression settings (what players see)
  currentProgressionWeek: number = 1;
  tempProgressionWeek: number = 1; // For editing
  progressionsOpen: boolean = true;
  isEditingWeek = false;
  weekSaving = false;

  // Management view settings (what progression tracker sees)
  viewingWeek: number = 1;
  currentSeason: number = new Date().getFullYear();

  // Overall attribute management
  showOverallModal = false;
  selectedPlayerForOverall: any = null;
  newOverallValue: number = 50;
  overallSaving = false;
  overallError = '';
  overallSuccess = '';

  // Training impact mapping - moved from service since we're not using it
  private trainingMap: Record<string, string[]> = {
    'Speed Skating': ['SPEED', 'ACCEL', 'AGILITY'],
    'Distance Skating': ['ENDUR', 'BALANCE', 'DRBLTY'],
    'Stick Handling': ['PK CTRL', 'DEKE', 'HND EYE'],
    'MMA': ['BODY CHK', 'STRENGTH', 'AGGRE', 'FIGHTING'],
    'Marksmanship': ['WRI PWR', 'SLAP PWR', 'PASSING'],
    'Hit the Targets': ['WRI ACC', 'SLAP ACC', 'POISE'],
    'Study Film': ['OFF AWR', 'DEF AWR', 'DISCIP'],
    'Special Teams': ['STK CHK', 'SHT BLK', 'FACEOFF'],
    'Shots High': ['GLV HIGH', 'STK HIGH', 'VISION'],
    'Shots Low': ['GLV LOW', 'STK LOW', '5 HOLE'],
    'Side to Sides': ['SPEED', 'AGILITY', 'POISE'],
    'Puck Skills': ['PK CTRL', 'PASSING', 'PK PL FRQ'],
    'Laps in Pads': ['ENDUR', 'DRBLTY', 'AGGRE'],
    'Positioning': ['BRK AWAY', 'ANGLES'],
    'Under Pressure': ['RBD CTRL', 'RECOV']
  };

  conferences = [
    {
      name: 'Mr. Hockey Conference',
      divisions: ['Europe Division', 'Great Lakes Division', 'Atlantic Division']
    },
    {
      name: 'The Rocket Conference',
      divisions: ['Northwest Division', 'Pacific Division', 'South Division']
    }
  ];

  showAddTeamModal = false;
  selectedConference: string = '';
  selectedDivision: string = '';
  newTeam = { city: '', mascot: '', logoUrl: '' };

  async ngOnInit() {
    // Check permissions first
    this.authService.effectiveRoles.subscribe(roles => {
      this.canManageWeeks = roles.some(role => 
        ['developer', 'commissioner'].includes(role)
      );
      this.canManageOverall = roles.some(role => 
        ['developer', 'commissioner', 'progression tracker'].includes(role)
      );
    });

    await this.loadProgressionSettings();
    this.viewingWeek = this.currentProgressionWeek; // Default to current week

    const snapshot = await getDocs(collection(this.firestore, 'teams'));
    this.teams = snapshot.docs.map(doc => {
      const data = doc.data();
      const name = data['name'] || `${data['city'] || ''} ${data['mascot'] || ''}`.trim() || 'Unnamed';
      return { id: doc.id, name, logoUrl: data['logoUrl'] || '' };
    });
  }

  get selectedTeam() {
    return this.teams.find(t => t.id === this.selectedTeamId);
  }

  async loadRoster() {
    if (!this.selectedTeamId) {
      this.roster = [];
      return;
    }

    this.loading = true;
    this.roster = [];

    const rosterRef = collection(this.firestore, `teams/${this.selectedTeamId}/roster`) as CollectionReference;
    const playersSnap = await getDocs(rosterRef);

    const playerDocs = playersSnap.docs;
    for (const playerDoc of playerDocs) {
      const data = playerDoc.data();
      
      // Load progression data for the viewing week (not current week)
      const progressionQuery = query(
        collection(this.firestore, `players/${playerDoc.id}/progressions`),
        where('week', '==', this.viewingWeek),
        where('season', '==', this.currentSeason)
      );
      const progressionSnap = await getDocs(progressionQuery);
      const progression = progressionSnap.docs[0]?.data();

      const globalPlayerRef = doc(this.firestore, `players/${playerDoc.id}`);
      const globalPlayerSnap = await getDoc(globalPlayerRef);
      const globalPlayerData = globalPlayerSnap.exists() ? globalPlayerSnap.data() : {};

      const attributesRef = doc(this.firestore, `players/${playerDoc.id}/meta/attributes`);
      const attributesSnap = await getDoc(attributesRef);
      if (!attributesSnap.exists()) {
        await setDoc(attributesRef, getDefaultAttributes(data['position']));
      }

      // Get current overall value from attributes
      const currentAttributes = attributesSnap.exists() ? attributesSnap.data() : {};
      const currentOverall = currentAttributes['OVERALL'] || 50;

      this.roster.push({
        id: playerDoc.id,
        name: `${data['firstName']} ${data['lastName']}`,
        number: data['jerseyNumber'],
        position: data['position'],
        age: globalPlayerData['age'] || 19,
        progression: progression?.['training'] || 'Not submitted',
        status: progression?.['status'] || 'N/A',
        progressionDocId: progressionSnap.docs[0]?.id || null,
        overall: currentOverall
      });
    }

    this.loading = false;
  }

  async onViewingWeekChange() {
    console.log(`📅 Viewing week changed to: ${this.viewingWeek}`);
    if (this.selectedTeamId) {
      await this.loadRoster();
    }
  }

  startEditingWeek() {
    if (!this.canManageWeeks) return;
    this.tempProgressionWeek = this.currentProgressionWeek;
    this.isEditingWeek = true;
  }

  cancelEditingWeek() {
    this.isEditingWeek = false;
    this.tempProgressionWeek = this.currentProgressionWeek;
  }

  async saveProgressionWeek() {
    if (!this.canManageWeeks || this.weekSaving) return;

    // Validate week number
    if (this.tempProgressionWeek < 1 || this.tempProgressionWeek > 100) {
      alert('Week number must be between 1 and 100');
      return;
    }

    this.weekSaving = true;
    
    try {
      const settingsRef = doc(this.firestore, 'progressionSettings/config');
      const previousWeek = this.currentProgressionWeek;
      
      await setDoc(settingsRef, {
        week: this.tempProgressionWeek,
        open: this.progressionsOpen
      }, { merge: true });

      this.currentProgressionWeek = this.tempProgressionWeek;
      this.isEditingWeek = false;

      // If week changed, emit event for player components
      if (previousWeek !== this.currentProgressionWeek) {
        console.log(`📅 Current progression week changed from ${previousWeek} to ${this.currentProgressionWeek}`);
        
        window.dispatchEvent(new CustomEvent('weekChanged', {
          detail: {
            previousWeek: previousWeek,
            newWeek: this.currentProgressionWeek
          }
        }));

        // Update viewing week to match current week by default
        this.viewingWeek = this.currentProgressionWeek;
        
        // Reload roster if team is selected
        if (this.selectedTeamId) {
          await this.loadRoster();
        }
      }

      console.log(`✅ Progression week updated to ${this.currentProgressionWeek}`);
    } catch (error) {
      console.error('Error updating progression week:', error);
      alert('Failed to update progression week. Please try again.');
    } finally {
      this.weekSaving = false;
    }
  }

  async toggleProgressionsOpen() {
    if (!this.canManageWeeks) return;

    try {
      const settingsRef = doc(this.firestore, 'progressionSettings/config');
      await setDoc(settingsRef, {
        week: this.currentProgressionWeek,
        open: this.progressionsOpen
      }, { merge: true });

      console.log(`✅ Progressions ${this.progressionsOpen ? 'opened' : 'closed'} for week ${this.currentProgressionWeek}`);
    } catch (error) {
      console.error('Error updating progression status:', error);
      alert('Failed to update progression status. Please try again.');
    }
  }

  // Overall attribute management methods
  openOverallModal(player: any) {
    if (!this.canManageOverall) return;
    
    this.selectedPlayerForOverall = player;
    this.newOverallValue = player.overall || 50;
    this.showOverallModal = true;
    this.overallError = '';
    this.overallSuccess = '';
  }

  closeOverallModal() {
    this.showOverallModal = false;
    this.selectedPlayerForOverall = null;
    this.newOverallValue = 50;
    this.overallError = '';
    this.overallSuccess = '';
  }

  async saveOverallAttribute() {
    if (!this.selectedPlayerForOverall || this.overallSaving) return;

    // Validate overall value
    if (this.newOverallValue < 40 || this.newOverallValue > 99) {
      this.overallError = 'Overall rating must be between 40 and 99';
      return;
    }

    this.overallSaving = true;
    this.overallError = '';
    this.overallSuccess = '';

    try {
      const playerId = this.selectedPlayerForOverall.id;
      const attributesRef = doc(this.firestore, `players/${playerId}/meta/attributes`);
      
      // Update the OVERALL attribute
      await updateDoc(attributesRef, {
        OVERALL: this.newOverallValue
      });

      // Update the roster display
      const playerIndex = this.roster.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        this.roster[playerIndex].overall = this.newOverallValue;
      }

      this.overallSuccess = `Overall rating updated to ${this.newOverallValue} successfully!`;
      
      // Close modal after short delay
      setTimeout(() => {
        this.closeOverallModal();
      }, 1500);

      console.log(`✅ Overall rating updated for ${this.selectedPlayerForOverall.name}: ${this.newOverallValue}`);
    } catch (error) {
      console.error('Error updating overall rating:', error);
      this.overallError = 'Failed to update overall rating. Please try again.';
    } finally {
      this.overallSaving = false;
    }
  }

  // Method to get overall rating color - improved to avoid brown tones
  getOverallColor(overall: number): string {
    // Clamp the value between 50 and 99
    const clampedOverall = Math.max(50, Math.min(99, overall));
    
    // Calculate the percentage from 50 to 99 (0% to 100%)
    const percentage = (clampedOverall - 50) / (99 - 50);
    
    // Use a more vibrant red to green interpolation avoiding brown tones
    // Red: RGB(220, 38, 38) - Bright red
    // Green: RGB(34, 197, 94) - Bright green
    const red = Math.round(220 - (220 - 34) * percentage);
    const green = Math.round(38 + (197 - 38) * percentage);
    const blue = Math.round(38 + (94 - 38) * percentage);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }

  // Helper method to get attribute delta based on age and week
  private getAttributeDelta(age: number, week: number): number {
    if (age <= 26) return week <= 5 ? 3 : 2;
    if (age <= 29) return 1;
    if (age === 30) return 1;
    if (age === 31) return -1;
    if (age === 32) return -2;
    if (age === 33) return -2;
    return -3;
  }

  // Apply progression manually (since we're not using the service)
  private async applyProgression(playerId: string, training: string, age: number, week: number) {
    const attrRef = doc(this.firestore, `players/${playerId}/meta/attributes`);
    const attrSnap = await getDoc(attrRef);
    if (!attrSnap.exists()) return;

    const attributes = attrSnap.data();
    const fields = this.trainingMap[training];
    if (!fields) return; // Skip if training not found

    const delta = this.getAttributeDelta(age, week);

    const updatedAttributes: Record<string, any> = {};

    for (const attr of fields) {
      const current = attributes[attr] || 0;
      // Ensure attributes stay within bounds (40-99)
      updatedAttributes[attr] = Math.max(40, Math.min(99, current + delta));
    }

    await updateDoc(attrRef, updatedAttributes);
  }

  // Undo progression manually (since we're not using the service)
  private async undoProgression(playerId: string, training: string, age: number, week: number) {
    const attrRef = doc(this.firestore, `players/${playerId}/meta/attributes`);
    const attrSnap = await getDoc(attrRef);
    if (!attrSnap.exists()) return;

    const attributes = attrSnap.data();
    const fields = this.trainingMap[training];
    if (!fields) return; // Skip if training not found

    const delta = this.getAttributeDelta(age, week);

    const updatedAttributes: Record<string, any> = {};

    for (const attr of fields) {
      const current = attributes[attr] || 0;
      // Ensure attributes stay within bounds (40-99)
      updatedAttributes[attr] = Math.max(40, Math.min(99, current - delta));
    }

    await updateDoc(attrRef, updatedAttributes);
  }

  // Get affected attributes for a training
  private getAffectedAttributes(training: string): string[] {
    return this.trainingMap[training] || [];
  }

  async markAsProcessed(playerId: string, docId: string) {
    if (!this.selectedTeamId || !docId) return;

    // Update both player and team progression records
    const playerProgressionRef = doc(this.firestore, `players/${playerId}/progressions/${docId}`);
    await updateDoc(playerProgressionRef, { status: 'processed' });

    // Also update team roster progression if it exists
    const teamProgressionRef = doc(this.firestore, `teams/${this.selectedTeamId}/roster/${playerId}/progression/${docId}`);
    try {
      await updateDoc(teamProgressionRef, { status: 'processed' });
    } catch (error) {
      console.log('Team progression record not found, skipping update');
    }

    // Get progression details for applying changes
    const progressionSnap = await getDoc(playerProgressionRef);
    const training = progressionSnap.data()?.['training'];

    const playerSnap = await getDoc(doc(this.firestore, `players/${playerId}`));
    const age = playerSnap.data()?.['age'] || 19;

    // Apply progression using the specific week
    await this.applyProgression(playerId, training, age, this.viewingWeek);

    await this.loadRoster();
  }

  async undoProcessed(playerId: string, docId: string) {
    if (!this.selectedTeamId || !docId) return;

    // Get progression details before undoing
    const playerProgressionRef = doc(this.firestore, `players/${playerId}/progressions/${docId}`);
    const progressionSnap = await getDoc(playerProgressionRef);
    const training = progressionSnap.data()?.['training'];

    const playerSnap = await getDoc(doc(this.firestore, `players/${playerId}`));
    const age = playerSnap.data()?.['age'] || 19;

    // Undo the progression changes
    await this.undoProgression(playerId, training, age, this.viewingWeek);

    // Update status back to pending
    await updateDoc(playerProgressionRef, { status: 'pending' });

    // Also update team roster progression if it exists
    const teamProgressionRef = doc(this.firestore, `teams/${this.selectedTeamId}/roster/${playerId}/progression/${docId}`);
    try {
      await updateDoc(teamProgressionRef, { status: 'pending' });
    } catch (error) {
      console.log('Team progression record not found, skipping update');
    }

    await this.loadRoster();
  }

  selectedPlayerAttributes: Record<string, number> = {};
  affectedAttributes: string[] = [];
  showAttributesPlayerId: string | null = null;
  objectKeys = Object.keys;

  async showAttributes(playerId: string, training: string) {
    if (this.showAttributesPlayerId === playerId) {
      this.showAttributesPlayerId = null;
      this.selectedPlayerAttributes = {};
      this.affectedAttributes = [];
      return;
    }

    this.showAttributesPlayerId = playerId;

    const attrRef = doc(this.firestore, `players/${playerId}/meta/attributes`);
    const attrSnap = await getDoc(attrRef);
    this.selectedPlayerAttributes = attrSnap.exists() ? attrSnap.data() as Record<string, number> : {};

    this.affectedAttributes = this.getAffectedAttributes(training);
  }

  // Updated attribute display order to include OVERALL
  attributeDisplayOrder: string[] = [
    "SPEED", "BODY CHK", "ENDUR", "PK CTRL", "PASSING", "SHT/PSS",
    "SLAP PWR", "SLAP ACC", "WRI PWR", "WRI ACC", "AGILITY", "STRENGTH",
    "ACCEL", "BALANCE", "FACEOFF", "DRBLTY", "DEKE", "AGGRE", "POISE",
    "HND EYE", "SHT BLK", "OFF AWR", "DEF AWR", "DISCIP", "FIGHTING",
    "STK CHK", "OVERALL"
  ];

  getPlayerNameById(playerId: string): string {
    const player = this.roster.find(p => p.id === playerId);
    return player ? player.name : 'Player';
  }

  async loadProgressionSettings() {
    const settingsRef = doc(this.firestore, 'progressionSettings/config');
    const snap = await getDoc(settingsRef);

    if (snap.exists()) {
      const data = snap.data();
      this.currentProgressionWeek = data['week'] ?? 1;
      this.tempProgressionWeek = this.currentProgressionWeek;
      this.progressionsOpen = data['open'] ?? true;
    } else {
      this.currentProgressionWeek = 1;
      this.tempProgressionWeek = 1;
      this.progressionsOpen = true;
      await setDoc(settingsRef, {
        week: this.currentProgressionWeek,
        open: this.progressionsOpen
      });
    }
  }

  openAddTeamModal(conference: string, division: string) {
    this.selectedConference = conference;
    this.selectedDivision = division;
    this.newTeam = { city: '', mascot: '', logoUrl: '' };
    this.showAddTeamModal = true;
  }

  async addTeam() {
    const name = `${this.newTeam.city} ${this.newTeam.mascot}`;
    const newTeamDoc = {
      city: this.newTeam.city,
      mascot: this.newTeam.mascot,
      logoUrl: this.newTeam.logoUrl,
      name,
      conference: this.selectedConference,
      division: this.selectedDivision
    };

    const teamRef = await addDoc(collection(this.firestore, 'teams'), newTeamDoc);
    this.teams.push({ id: teamRef.id, name, logoUrl: this.newTeam.logoUrl });
    this.showAddTeamModal = false;
  }
}