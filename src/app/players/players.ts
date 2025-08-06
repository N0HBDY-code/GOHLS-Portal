import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Firestore, collection, getDocs, addDoc, query, where, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PlayerManager } from '../player-manager/player-manager';
@Component({
  selector: 'app-player',
  standalone: true,
  imports: [CommonModule, FormsModule, PlayerManager],
  templateUrl: './players.component.html',
  styleUrls: ['./players.component.css']
})
export class Players implements OnInit, OnDestroy {
  private firestore: Firestore = inject(Firestore);
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);

  hasActivePlayer = false;
  hasRetiredPlayer = false;
  hasPendingPlayer = false;
  loading = true;
  retiredPlayerName = '';
  pendingPlayerName = '';
  showCreateForm = false;

  filteredArchetypes: string[] = [];

  // Event listener for player retirement and approval
  private retirementListener?: () => void;
  private approvalListener?: () => void;

  playerForm = {
    firstName: '',
    lastName: '',
    gamertag: '',
    position: '',
    archetype: '',
    jerseyNumber: 0,
    handedness: '',
    height: 72, // Default to 6'0"
    weight: 180, // Default weight
    fight: '',
    origin: '',
    hair: '',
    beard: '',
    tape: '',
    ethnicity: '',
    twitch: '',
    referral: '',
    invitedBy: '',
    age: 19
  };

  async ngOnInit() {
    const user = this.auth.currentUser;
    if (!user) {
      this.loading = false;
      return;
    }

    // Set up event listeners
    this.retirementListener = () => {
      console.log('🏆 Player retirement event received, refreshing status...');
      this.refreshPlayerStatus();
    };
    
    this.approvalListener = () => {
      console.log('✅ Player approval event received, refreshing status...');
      this.refreshPlayerStatus();
    };

    window.addEventListener('playerRetired', this.retirementListener);
    window.addEventListener('playerApproved', this.approvalListener);

    await this.checkPlayerStatus(user.uid);
    this.loading = false;
  }

  ngOnDestroy() {
    // Clean up event listeners
    if (this.retirementListener) {
      window.removeEventListener('playerRetired', this.retirementListener);
    }
    if (this.approvalListener) {
      window.removeEventListener('playerApproved', this.approvalListener);
    }
  }

  async checkPlayerStatus(userId: string) {
    try {
      console.log('🔍 Checking player status for user:', userId);
      
      // Reset all states first
      this.resetAllStates();

      // Run all queries in parallel
      const [activeSnapshot, retiredSnapshot, pendingSnapshot] = await Promise.all([
        // Active players
        getDocs(query(
          collection(this.firestore, 'players'),
          where('userId', '==', userId),
          where('status', '==', 'active')
        )),
        // Retired players
        getDocs(query(
          collection(this.firestore, 'players'),
          where('userId', '==', userId),
          where('status', '==', 'retired')
        )),
        // Pending players
        getDocs(query(
          collection(this.firestore, 'pendingPlayers'),
          where('userId', '==', userId),
          where('status', '==', 'pending')
        ))
      ]);

      console.log('📊 Query results:', {
        active: activeSnapshot.docs.length,
        retired: retiredSnapshot.docs.length,
        pending: pendingSnapshot.docs.length
      });

      // PRIORITY 1: Active player (highest priority)
      if (!activeSnapshot.empty) {
        this.hasActivePlayer = true;
        console.log('⚡ Active player found - showing player manager');
        return;
      }

      // PRIORITY 2: Pending player (second priority - must check before retired)
      if (!pendingSnapshot.empty) {
        const pendingData = pendingSnapshot.docs[0].data();
        this.hasPendingPlayer = true;
        this.pendingPlayerName = `${pendingData['firstName']} ${pendingData['lastName']}`;
        console.log('⏳ Pending player found:', this.pendingPlayerName);
        return;
      }

      // PRIORITY 3: Retired player (third priority)
      if (!retiredSnapshot.empty) {
        const retiredData = retiredSnapshot.docs[0].data();
        this.hasRetiredPlayer = true;
        this.retiredPlayerName = `${retiredData['firstName']} ${retiredData['lastName']}`;
        console.log('🏆 Retired player found:', this.retiredPlayerName);
        return;
      }

      // PRIORITY 4: No player found - show create form
      console.log('➕ No player found, showing create form');
      this.showCreateForm = true;

    } catch (error) {
      console.error('❌ Error checking player status:', error);
      // On error, default to showing create form
      this.showCreateForm = true;
    }
  }

  private resetAllStates() {
    this.hasActivePlayer = false;
    this.hasRetiredPlayer = false;
    this.hasPendingPlayer = false;
    this.showCreateForm = false;
    this.retiredPlayerName = '';
    this.pendingPlayerName = '';
  }

  // Add a method to refresh player status (can be called from outside)
  async refreshPlayerStatus() {
    const user = this.auth.currentUser;
    if (!user) return;

    console.log('🔄 Manually refreshing player status...');
    this.loading = true;
    
    // Add a small delay to ensure database consistency after approval/retirement
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await this.checkPlayerStatus(user.uid);
    this.loading = false;
  }

  onPositionChange() {
    const position = this.playerForm.position;
    if (['LW', 'C', 'RW'].includes(position)) {
      this.filteredArchetypes = [
        'Playmaker',
        'Sniper',
        '2-Way Forward',
        'Power Forward',
        'Enforcer Forward',
        'Grinder'
      ];
    } else if (position === 'D') {
      this.filteredArchetypes = [
        'Defensive Defense',
        'Offensive Defense',
        '2-Way Defense',
        'Enforcer Defense'
      ];
    } else if (position === 'G') {
      this.filteredArchetypes = ['Hybrid', 'Butterfly', 'Standup'];
    } else {
      this.filteredArchetypes = [];
    }

    this.playerForm.archetype = '';
  }

  async createPlayer() {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      console.log('📝 Creating pending player request...');
      
      // Get current progression settings to determine age
      const settingsRef = doc(this.firestore, 'progressionSettings/config');
      const settingsSnap = await getDoc(settingsRef);
      const currentWeek = settingsSnap.exists() ? settingsSnap.data()['week'] || 1 : 1;
      
      // Get current league season
      const seasonRef = doc(this.firestore, 'leagueSettings/season');
      const seasonSnap = await getDoc(seasonRef);
      const currentSeason = seasonSnap.exists() ? seasonSnap.data()['currentSeason'] || 1 : 1;
      
      // Determine player age based on week
      // Before week 5: 20 years old
      // After week 5: 19 years old
      const playerAge = currentWeek <= 5 ? 20 : 19;
      
      // Create a pending player request
      await addDoc(collection(this.firestore, 'pendingPlayers'), {
        ...this.playerForm,
        userId: user.uid,
        status: 'pending',
        submittedDate: new Date(),
        userEmail: user.email,
        userDisplayName: user.displayName,
        age: playerAge,
        draftClass: currentSeason // Assign to current season's draft class
      });

      console.log('✅ Pending player created successfully');

      // Update component state immediately to show pending player
      this.resetAllStates();
      this.hasPendingPlayer = true;
      this.pendingPlayerName = `${this.playerForm.firstName} ${this.playerForm.lastName}`;

      console.log('🎯 Component state updated to show pending player:', this.pendingPlayerName);

      alert('Your player has been submitted for approval! You can now view your pending player below.');
    } catch (error) {
      console.error('❌ Error submitting player:', error);
      alert('Failed to submit player. Please try again.');
    }
  }

  createNewPlayer() {
    console.log('➕ Creating new player - resetting form...');
    
    // Reset form and show creation form
    this.playerForm = {
      firstName: '',
      lastName: '',
      gamertag: '',
      position: '',
      archetype: '',
      jerseyNumber: 0,
      handedness: '',
      height: 72,
      weight: 180,
      fight: '',
      origin: '',
      hair: '',
      beard: '',
      tape: '',
      ethnicity: '',
      twitch: '',
      referral: '',
      invitedBy: '',
      age: 19
    };
    this.filteredArchetypes = [];
    this.resetAllStates();
    this.showCreateForm = true;
  }
}