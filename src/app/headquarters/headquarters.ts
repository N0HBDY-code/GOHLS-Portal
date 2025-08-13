import { Component, inject, OnInit } from '@angular/core';
import { Firestore, collection, getDocs, updateDoc, doc, arrayUnion, arrayRemove, query, where, getDoc, addDoc, setDoc, writeBatch, orderBy, deleteDoc } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auths } from '../auth-service/auth-service';
import { getDefaultAttributes } from '../services/progression-default';
import { Trades, TradeOffer } from '../services/trades';
interface Team {
  id: string;
  name: string;
  city?: string;
  mascot?: string;
  league?: string;
  conference?: string;
  division?: string;
}

interface SeasonHistory {
  season: number;
  startDate: any;
  playerCount: number;
  status: 'active' | 'completed';
}

interface DraftClassCounts {
  age18: number;
  age19: number;
  age20Plus: number;
  total: number;
}

interface PendingPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  archetype: string;
  age: number;
  height: number;
  weight: number;
  jerseyNumber: number;
  handedness: string;
  userId: string;
  userEmail: string;
  userDisplayName?: string;
  submittedDate: any;
  status: string;
  draftClass?: number;
  [key: string]: any;
}

@Component({
  selector: 'app-headquarters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './headquarters.html',
  styleUrls: ['./headquarters.css']
})
export class Headquarters implements OnInit {
  private firestore = inject(Firestore);
  private tradeService = inject(Trades);
  private authService = inject(Auths);

  // Season Management
  currentLeagueSeason = 1;
  seasonHistory: SeasonHistory[] = [];
  draftClassCounts: DraftClassCounts = {
    age18: 0,
    age19: 0,
    age20Plus: 0,
    total: 0
  };
  showSeasonRolloverModal = false;
  rolloverConfirmed = false;
  rolloverConfirmationText = '';
  seasonRolloverInProgress = false;

  // Game Schedule Settings
  currentSeason = 1;
  currentWeek = 1;
  currentDay = 'D1';

  // Role Management
  searchUsername = '';
  selectedUser: any = null;
  selectedRole = '';
  loading = false;
  error = '';
  success = '';

  // Trade Management
  pendingTrades: TradeOffer[] = [];
  loadingTrades = false;
  playerCache: Map<string, string> = new Map();
  teamCache: Map<string, string> = new Map();

  // New Player Assignment
  newPlayers: any[] = [];
  loadingNewPlayers = false;
  majorLeagueTeams: Team[] = [];
  minorLeagueTeams: Team[] = [];

  // Player Approval System
  pendingPlayers: PendingPlayer[] = [];
  loadingPendingPlayers = false;
  showEditPlayerModal = false;
  editingPlayer: PendingPlayer | null = null;
  editArchetypes: string[] = [];

  // Permission flags - ADD THESE MISSING PROPERTIES
  canManagePlayoffs = false;
  isDeveloper = false;

  availableRoles = [
    'viewer',
    'developer',
    'commissioner',
    'stats monkey',
    'finance officer',
    'progression tracker'
  ];

  // Team-specific GM role management
  showGmRoleModal = false;
  selectedUserForGm: any = null;
  selectedTeamForGm = '';
  allTeams: Team[] = [];

  async ngOnInit() {
    // Check permissions
    this.authService.effectiveRoles.subscribe(roles => {
      this.canManagePlayoffs = roles.some(role => 
        ['developer', 'commissioner'].includes(role)
      );
      this.isDeveloper = roles.includes('developer');
    });

    await Promise.all([
      this.loadSeasonManagement(),
      this.loadScheduleSettings(),
      this.loadPendingTrades(),
      this.loadNewPlayers(),
      this.loadTeams(),
      this.loadPendingPlayers(),
      this.loadAllTeams()
    ]);
  }

  async loadSeasonManagement() {
    try {
      // Load current league season
      const seasonRef = doc(this.firestore, 'leagueSettings/season');
      const seasonSnap = await getDoc(seasonRef);
      
      if (seasonSnap.exists()) {
        this.currentLeagueSeason = seasonSnap.data()['currentSeason'] || 1;
      } else {
        // Initialize season settings
        await setDoc(seasonRef, {
          currentSeason: 1,
          createdDate: new Date()
        });
        this.currentLeagueSeason = 1;
      }

      // Load season history
      await this.loadSeasonHistory();
      
      // Load draft class counts
      await this.loadDraftClassCounts();
      
    } catch (error) {
      console.error('Error loading season management:', error);
    }
  }

  async loadSeasonHistory() {
    try {
      const historyRef = collection(this.firestore, 'seasonHistory');
      const historyQuery = query(historyRef, orderBy('season', 'desc'));
      const historySnap = await getDocs(historyQuery);
      
      this.seasonHistory = historySnap.docs.map(doc => ({
        season: doc.data()['season'],
        startDate: doc.data()['startDate'],
        playerCount: doc.data()['playerCount'],
        status: doc.data()['season'] === this.currentLeagueSeason ? 'active' : 'completed'
      }));
    } catch (error) {
      console.error('Error loading season history:', error);
    }
  }

  async loadDraftClassCounts() {
    try {
      const playersRef = collection(this.firestore, 'players');
      const activePlayersQuery = query(playersRef, where('status', '==', 'active'));
      const playersSnap = await getDocs(activePlayersQuery);
      
      let age18 = 0;
      let age19 = 0;
      let age20Plus = 0;
      
      playersSnap.docs.forEach(doc => {
        const age = doc.data()['age'] || 19;
        if (age === 18) {
          age18++;
        } else if (age === 19) {
          age19++;
        } else {
          age20Plus++;
        }
      });
      
      this.draftClassCounts = {
        age18,
        age19,
        age20Plus,
        total: age18 + age19 + age20Plus
      };
    } catch (error) {
      console.error('Error loading draft class counts:', error);
    }
  }

  async executeSeasonRollover() {
    if (!this.rolloverConfirmed || this.rolloverConfirmationText !== 'ADVANCE SEASON') {
      return;
    }

    this.seasonRolloverInProgress = true;
    
    try {
      console.log(`🏆 Starting season rollover from Season ${this.currentLeagueSeason} to Season ${this.currentLeagueSeason + 1}`);
      
      // Create a batch for atomic operations
      const batch = writeBatch(this.firestore);
      
      // 1. Record current season in history
      const currentSeasonHistoryRef = doc(this.firestore, `seasonHistory/season${this.currentLeagueSeason}`);
      batch.set(currentSeasonHistoryRef, {
        season: this.currentLeagueSeason,
        startDate: new Date(), // When this season started (now becomes history)
        playerCount: this.draftClassCounts.total,
        status: 'completed'
      });
      
      // 2. Update league season
      const newSeason = this.currentLeagueSeason + 1;
      const seasonRef = doc(this.firestore, 'leagueSettings/season');
      batch.update(seasonRef, {
        currentSeason: newSeason,
        lastRolloverDate: new Date(),
        previousSeason: this.currentLeagueSeason
      });
      
      // Commit the batch first
      await batch.commit();
      
      // 3. Age all active players (done separately to avoid batch size limits)
      const playersRef = collection(this.firestore, 'players');
      const activePlayersQuery = query(playersRef, where('status', '==', 'active'));
      const playersSnap = await getDocs(activePlayersQuery);
      
      console.log(`👥 Aging ${playersSnap.docs.length} active players...`);
      
      // Process players in smaller batches to avoid Firestore limits
      const playerBatches = [];
      const batchSize = 500; // Firestore batch limit
      
      for (let i = 0; i < playersSnap.docs.length; i += batchSize) {
        const playerBatch = writeBatch(this.firestore);
        const batchDocs = playersSnap.docs.slice(i, i + batchSize);
        
        batchDocs.forEach(playerDoc => {
          const currentAge = playerDoc.data()['age'] || 19;
          const newAge = currentAge + 1;
          
          playerBatch.update(playerDoc.ref, {
            age: newAge,
            lastAgedSeason: newSeason
          });
          
          // Add aging history entry
          const historyRef = doc(collection(this.firestore, `players/${playerDoc.id}/history`));
          playerBatch.set(historyRef, {
            action: 'aged',
            previousAge: currentAge,
            newAge: newAge,
            season: newSeason,
            timestamp: new Date(),
            details: `Player aged from ${currentAge} to ${newAge} during Season ${newSeason} rollover`
          });
        });
        
        playerBatches.push(playerBatch.commit());
      }
      
      // Execute all player aging batches
      await Promise.all(playerBatches);
      
      // 4. Create new season history entry
      const newSeasonHistoryRef = doc(this.firestore, `seasonHistory/season${newSeason}`);
      await setDoc(newSeasonHistoryRef, {
        season: newSeason,
        startDate: new Date(),
        playerCount: this.draftClassCounts.total,
        status: 'active'
      });
      
      // 5. Create new draft class for the new season
      await addDoc(collection(this.firestore, 'draftClasses'), {
        season: newSeason,
        status: 'upcoming',
        createdAt: new Date()
      });
      
      // 6. Update local state
      this.currentLeagueSeason = newSeason;
      
      // 7. Reload all data
      await Promise.all([
        this.loadSeasonHistory(),
        this.loadDraftClassCounts()
      ]);
      
      // Close modal and show success
      this.showSeasonRolloverModal = false;
      this.rolloverConfirmed = false;
      this.rolloverConfirmationText = '';
      
      this.success = `Season rollover completed successfully! Welcome to Season ${newSeason}. All players have been aged by 1 year.`;
      setTimeout(() => this.success = '', 5000);
      
      console.log(`✅ Season rollover completed successfully to Season ${newSeason}`);
      
    } catch (error) {
      console.error('❌ Error during season rollover:', error);
      this.error = 'Failed to complete season rollover. Please try again or contact support.';
      setTimeout(() => this.error = '', 5000);
    } finally {
      this.seasonRolloverInProgress = false;
    }
  }

  async loadScheduleSettings() {
    try {
      const settingsRef = doc(this.firestore, 'gameScheduleSettings/current');
      const settingsSnap = await getDoc(settingsRef);
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        this.currentSeason = data['season'] || 1;
        this.currentWeek = data['week'] || 1;
        this.currentDay = data['day'] || 'D1';
      }
    } catch (error) {
      console.error('Error loading schedule settings:', error);
    }
  }

  async updateScheduleSettings() {
    this.loading = true;
    try {
      const settingsRef = doc(this.firestore, 'gameScheduleSettings/current');
      await setDoc(settingsRef, {
        season: this.currentSeason,
        week: this.currentWeek,
        day: this.currentDay,
        lastUpdated: new Date()
      });
      
      this.success = 'Schedule settings updated successfully';
      setTimeout(() => this.success = '', 3000);
    } catch (error) {
      console.error('Error updating schedule settings:', error);
      this.error = 'Failed to update schedule settings';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async loadNewPlayers() {
    this.loadingNewPlayers = true;
    try {
      const playersRef = collection(this.firestore, 'players');
      const q = query(playersRef, where('teamId', '==', 'none'), where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      
      this.newPlayers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        selectedTeamId: ''
      }));
    } finally {
      this.loadingNewPlayers = false;
    }
  }

  async loadPendingPlayers() {
    this.loadingPendingPlayers = true;
    try {
      const pendingRef = collection(this.firestore, 'pendingPlayers');
      const q = query(pendingRef, where('status', '==', 'pending'));
      const snapshot = await getDocs(q);
      
      this.pendingPlayers = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          firstName: data.firstName,
          lastName: data.lastName,
          position: data.position,
          archetype: data.archetype,
          age: data.age,
          height: data.height,
          weight: data.weight,
          jerseyNumber: data.jerseyNumber,
          handedness: data.handedness,
          userId: data.userId,
          userEmail: data.userEmail,
          userDisplayName: data.userDisplayName,
          submittedDate: data.submittedDate,
          status: data.status,
          draftClass: data.draftClass,
          fight: data.fight,
          origin: data.origin,
          hair: data.hair,
          beard: data.beard,
          tape: data.tape,
          ethnicity: data.ethnicity,
          twitch: data.twitch,
          referral: data.referral,
          invitedBy: data.invitedBy,
          gamertag: data.gamertag
        };
      });
    } finally {
      this.loadingPendingPlayers = false;
    }
  }

  async loadTeams() {
    const teamsRef = collection(this.firestore, 'teams');
    const snapshot = await getDocs(teamsRef);
    
    const allTeams: Team[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: `${data['city']} ${data['mascot']}`,
        city: data['city'],
        mascot: data['mascot'],
        league: data['league'] || 'major',
        conference: data['conference'],
        division: data['division']
      };
    });

    // Separate teams by league
    this.majorLeagueTeams = allTeams.filter(team => team.league === 'major' || !team.league);
    this.minorLeagueTeams = allTeams.filter(team => team.league === 'minor');
  }

  async assignPlayerToTeam(player: any) {
    if (!player.selectedTeamId) return;

    this.loading = true;
    try {
      // Update player's team assignment
      const playerRef = doc(this.firestore, `players/${player.id}`);
      await updateDoc(playerRef, {
        teamId: player.selectedTeamId
      });

      // Add player to team roster
      const rosterRef = doc(this.firestore, `teams/${player.selectedTeamId}/roster/${player.id}`);
      await setDoc(rosterRef, {
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        archetype: player.archetype,
        jerseyNumber: player.jerseyNumber,
        age: player.age,
        height: player.height,
        weight: player.weight,
        handedness: player.handedness,
        teamId: player.selectedTeamId
      });

      // Add to player history
      await addDoc(collection(this.firestore, `players/${player.id}/history`), {
        action: 'signed',
        teamId: player.selectedTeamId,
        timestamp: new Date(),
        details: 'Assigned to team by league management'
      });

      // Remove from new players list
      this.newPlayers = this.newPlayers.filter(p => p.id !== player.id);
      
      this.success = `${player.firstName} ${player.lastName} has been assigned to their team!`;
      setTimeout(() => this.success = '', 3000);
    } catch (error) {
      console.error('Error assigning player:', error);
      this.error = 'Failed to assign player to team';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async approvePlayer(player: PendingPlayer) {
    this.loading = true;
    try {
      // Get current league season for draft class
      const seasonRef = doc(this.firestore, 'leagueSettings/season');
      const seasonSnap = await getDoc(seasonRef);
      const currentSeason = seasonSnap.exists() ? seasonSnap.data()['currentSeason'] : 1;
      
      // Create player in main collection
      const playerRef = await addDoc(collection(this.firestore, 'players'), {
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        archetype: player.archetype,
        jerseyNumber: player.jerseyNumber,
        age: player.age,
        height: player.height,
        weight: player.weight,
        handedness: player.handedness,
        userId: player.userId,
        teamId: 'none',
        status: 'active',
        createdDate: new Date(),
        draftClass: player.draftClass || currentSeason, // Use specified draft class or current season
        draftStatus: 'eligible', // Set as eligible for draft
        fightTendency: player['fight'],
        origin: player['origin'],
        hair: player['hair'],
        beard: player['beard'],
        stickTapeColor: player['tape'],
        race: player['ethnicity'],
        twitch: player['twitch'],
        referralSource: player['referral'],
        invitedBy: player['invitedBy'],
        gamertag: player['gamertag']
      });

      // Create default attributes
      const attributesRef = doc(this.firestore, `players/${playerRef.id}/meta/attributes`);
      await setDoc(attributesRef, getDefaultAttributes(player.position));

      // Add creation to player history
      await addDoc(collection(this.firestore, `players/${playerRef.id}/history`), {
        action: 'created',
        teamId: 'none',
        timestamp: new Date(),
        details: 'Player approved and entered the league'
      });

      // Delete from pending players
      await deleteDoc(doc(this.firestore, `pendingPlayers/${player.id}`));

      // Remove from pending players list
      this.pendingPlayers = this.pendingPlayers.filter(p => p.id !== player.id);
      
      this.success = `${player.firstName} ${player.lastName} has been approved and created!`;
      setTimeout(() => this.success = '', 3000);
      
      // Dispatch event for player components to refresh
      window.dispatchEvent(new CustomEvent('playerApproved'));
    } catch (error) {
      console.error('Error approving player:', error);
      this.error = 'Failed to approve player';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async rejectPlayer(player: PendingPlayer) {
    if (!confirm(`Are you sure you want to reject ${player.firstName} ${player.lastName}'s player request?`)) {
      return;
    }
    
    this.loading = true;
    try {
      // Delete from pending players
      await deleteDoc(doc(this.firestore, `pendingPlayers/${player.id}`));

      // Remove from pending players list
      this.pendingPlayers = this.pendingPlayers.filter(p => p.id !== player.id);
      
      this.success = `${player.firstName} ${player.lastName}'s player request has been rejected.`;
      setTimeout(() => this.success = '', 3000);
    } catch (error) {
      console.error('Error rejecting player:', error);
      this.error = 'Failed to reject player';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  editPlayer(player: PendingPlayer) {
    this.editingPlayer = { ...player };
    this.onEditPositionChange();
    this.showEditPlayerModal = true;
  }

  onEditPositionChange() {
    if (!this.editingPlayer) return;
    
    const position = this.editingPlayer.position;
    if (['LW', 'C', 'RW'].includes(position)) {
      this.editArchetypes = [
        'Playmaker',
        'Sniper',
        '2-Way Forward',
        'Power Forward',
        'Enforcer Forward',
        'Grinder'
      ];
    } else if (position === 'D') {
      this.editArchetypes = [
        'Defensive Defense',
        'Offensive Defense',
        '2-Way Defense',
        'Enforcer Defense'
      ];
    } else if (position === 'G') {
      this.editArchetypes = ['Hybrid', 'Butterfly', 'Standup'];
    } else {
      this.editArchetypes = [];
    }
  }

  async savePlayerEdit() {
    if (!this.editingPlayer) return;
    
    this.loading = true;
    try {
      // Update pending player
      const playerRef = doc(this.firestore, `pendingPlayers/${this.editingPlayer.id}`);
      await updateDoc(playerRef, {
        firstName: this.editingPlayer.firstName,
        lastName: this.editingPlayer.lastName,
        position: this.editingPlayer.position,
        archetype: this.editingPlayer.archetype,
        jerseyNumber: this.editingPlayer.jerseyNumber,
        age: this.editingPlayer.age,
        height: this.editingPlayer.height,
        weight: this.editingPlayer.weight,
        handedness: this.editingPlayer.handedness,
        draftClass: this.editingPlayer.draftClass
      });

      // Update local list
      const index = this.pendingPlayers.findIndex(p => p.id === this.editingPlayer?.id);
      if (index !== -1) {
        this.pendingPlayers[index] = { ...this.editingPlayer };
      }
      
      this.success = `${this.editingPlayer.firstName} ${this.editingPlayer.lastName}'s information has been updated.`;
      setTimeout(() => this.success = '', 3000);
      
      this.showEditPlayerModal = false;
      this.editingPlayer = null;
    } catch (error) {
      console.error('Error updating player:', error);
      this.error = 'Failed to update player';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async loadPendingTrades() {
    this.loadingTrades = true;
    try {
      this.pendingTrades = await this.tradeService.getPendingTradeApprovals();
      
      // Load team and player names
      const teamIds = new Set<string>();
      const playerIds = new Set<string>();

      this.pendingTrades.forEach(trade => {
        teamIds.add(trade.fromTeamId);
        teamIds.add(trade.toTeamId);
        trade.playersOffered.forEach(id => playerIds.add(id));
        trade.playersRequested.forEach(id => playerIds.add(id));
      });

      // Load team names
      for (const teamId of teamIds) {
        const teamSnap = await getDoc(doc(this.firestore, `teams/${teamId}`));
        if (teamSnap.exists()) {
          const data = teamSnap.data();
          this.teamCache.set(teamId, `${data['city']} ${data['mascot']}`);
        }
      }

      // Load player names
      for (const playerId of playerIds) {
        const playerSnap = await getDoc(doc(this.firestore, `players/${playerId}`));
        if (playerSnap.exists()) {
          const data = playerSnap.data();
          this.playerCache.set(playerId, `${data['firstName']} ${data['lastName']}`);
        }
      }
    } finally {
      this.loadingTrades = false;
    }
  }

  getTeamName(teamId: string): string {
    return this.teamCache.get(teamId) || 'Unknown Team';
  }

  getPlayerName(playerId: string): string {
    return this.playerCache.get(playerId) || 'Unknown Player';
  }

  async approveTrade(trade: TradeOffer) {
    this.loading = true;
    try {
      await this.tradeService.approveTrade(trade);
      await this.loadPendingTrades();
      this.success = 'Trade approved successfully';
      setTimeout(() => this.success = '', 3000);
    } catch (error) {
      console.error('Error approving trade:', error);
      this.error = 'Failed to approve trade';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async denyTrade(trade: TradeOffer) {
    this.loading = true;
    try {
      await this.tradeService.denyTrade(trade);
      await this.loadPendingTrades();
      this.success = 'Trade denied successfully';
      setTimeout(() => this.success = '', 3000);
    } catch (error) {
      console.error('Error denying trade:', error);
      this.error = 'Failed to deny trade';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async searchUser() {
    if (!this.searchUsername.trim()) {
      this.error = 'Please enter a username';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';
    this.selectedUser = null;

    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('displayName', '==', this.searchUsername));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        this.error = 'User not found';
        return;
      }

      const userDoc = snapshot.docs[0];
      this.selectedUser = {
        uid: userDoc.id,
        ...userDoc.data(),
        roles: userDoc.data()['roles'] || []
      };
    } catch (error) {
      console.error('Error searching user:', error);
      this.error = 'Error searching for user';
    } finally {
      this.loading = false;
    }
  }

  async addRole() {
    if (!this.selectedUser || !this.selectedRole) return;

    // Handle GM role specially
    if (this.selectedRole === 'gm') {
      this.selectedUserForGm = this.selectedUser;
      this.showGmRoleModal = true;
      this.selectedRole = ''; // Reset selection
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      const userRef = doc(this.firestore, 'users', this.selectedUser.uid);
      await updateDoc(userRef, {
        roles: arrayUnion(this.selectedRole)
      });

      this.selectedUser.roles.push(this.selectedRole);
      this.selectedRole = '';
      this.success = 'Role added successfully';
      setTimeout(() => this.success = '', 3000);
    } catch (error) {
      console.error('Error adding role:', error);
      this.error = 'Failed to add role';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async removeRole(role: string) {
    if (!this.selectedUser) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      const userRef = doc(this.firestore, 'users', this.selectedUser.uid);
      await updateDoc(userRef, {
        roles: arrayRemove(role)
      });

      this.selectedUser.roles = this.selectedUser.roles.filter((r: string) => r !== role);
      this.success = 'Role removed successfully';
      setTimeout(() => this.success = '', 3000);
    } catch (error) {
      console.error('Error removing role:', error);
      this.error = 'Failed to remove role';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  async loadAllTeams() {
    try {
      const teamsRef = collection(this.firestore, 'teams');
      const snapshot = await getDocs(teamsRef);
      
      this.allTeams = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: `${data['city']} ${data['mascot']}`,
          city: data['city'],
          mascot: data['mascot'],
          league: data['league'] || 'major',
          conference: data['conference'],
          division: data['division']
        };
      });
    } catch (error) {
      console.error('Error loading all teams:', error);
    }
  }

  async assignGmRole() {
    if (!this.selectedUserForGm || !this.selectedTeamForGm) return;

    this.loading = true;
    try {
      const userRef = doc(this.firestore, 'users', this.selectedUserForGm.uid);
      const teamSpecificRole = `gm:${this.selectedTeamForGm}`;
      
      await updateDoc(userRef, {
        roles: arrayUnion(teamSpecificRole)
      });

      // Update local display
      this.selectedUserForGm.roles.push(teamSpecificRole);
      
      this.success = `GM role assigned successfully for ${this.getTeamNameById(this.selectedTeamForGm)}`;
      setTimeout(() => this.success = '', 3000);
      
      this.showGmRoleModal = false;
      this.selectedUserForGm = null;
      this.selectedTeamForGm = '';
    } catch (error) {
      console.error('Error assigning GM role:', error);
      this.error = 'Failed to assign GM role';
      setTimeout(() => this.error = '', 3000);
    } finally {
      this.loading = false;
    }
  }

  getTeamNameById(teamId: string): string {
    const team = this.allTeams.find(t => t.id === teamId);
    return team ? team.name : 'Unknown Team';
  }

  formatRoleDisplay(role: string): string {
    if (role.startsWith('gm:')) {
      const teamId = role.split(':')[1];
      const teamName = this.getTeamNameById(teamId);
      return `GM - ${teamName}`;
    }
    return role;
  }
}