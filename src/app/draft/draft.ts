import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  Firestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  addDoc, 
  setDoc, 
  updateDoc, 
  writeBatch, 
  deleteDoc,
  DocumentData,
  DocumentSnapshot
} from '@angular/fire/firestore';
import { Auths } from '../auth-service/auth-service';

interface DraftClass {
  id?: string;
  season: number;
  players: DraftPlayer[];
  status: 'upcoming' | 'active' | 'completed';
  startDate?: Date;
  endDate?: Date;
  league?: string;
  draftOrderSet?: boolean;
  draftOrder?: string[]; // Array of team IDs in draft order
}

interface DraftPlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  archetype: string;
  age: number;
  overall: number;
  draftRank?: number;
  teamId?: string;
  teamName?: string;
  teamLogo?: string;
  draftRound?: number;
  draftPick?: number;
  draftSeason?: number;
  draftStatus?: string;
}

interface DraftPick {
  id?: string;
  draftClassId: string;
  season: number;
  round: number;
  pick: number;
  teamId: string;
  teamName: string;
  originalTeamId?: string;
  originalTeamName?: string;
  playerId?: string;
  playerName?: string;
  completed: boolean;
  passed?: boolean;
}

interface Team {
  id: string;
  name: string;
  city: string;
  mascot: string;
  logoUrl?: string;
  conference: string;
  division: string;
  league?: string;
}

@Component({
  selector: 'app-draft',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './draft.html',
  styleUrls: ['./draft.css']
})
export class Draft implements OnInit {
  // Current view
  currentView: 'classes' | 'current' | 'history' = 'classes';
  
  // Draft classes
  draftClasses: DraftClass[] = [];
  selectedDraftClass: DraftClass | null = null;
  
  // Current draft
  public selectedDraftClassId: string = '';
  selectedDraftClassForDraft: DraftClass | null = null;
  draftPicks: DraftPick[] = [];
  currentRound = 1;
  currentPick = 1;
  draftInProgress = false;
  
  // Draft history
  draftHistory: DraftPick[] = [];
  
  // Teams
  teams: Team[] = [];
  
  // Permissions
  canManageDraft = false;
  isDeveloper = false;
  
  // Loading states
  loadingClasses = false;
  loadingDraft = false;
  loadingHistory = false;
  
  // Draft class management
  showCreateClassModal = false;
  newDraftClassSeason = new Date().getFullYear();
  newDraftClassLeague = 'major';
  
  // Draft order management
  showSetOrderModal = false;
  draftOrderTeams: Team[] = [];
  
  // Draft pick management
  showMakePickModal = false;
  selectedDraftPick: DraftPick | null = null;
  availablePlayers: DraftPlayer[] = [];
  selectedPlayerId = '';
  
  // Draft settings
  draftRounds = 7;
  
  // Filters
  positionFilter: string = 'all';
  ageFilter: string = 'all';
  sortBy: 'overall' | 'age' | 'position' = 'overall';
  sortDirection: 'asc' | 'desc' = 'desc';

  // Error handling
  indexError = false;
  draftClassError = false;
  draftClassErrorMessage = '';
  
  // Current league season
  currentLeagueSeason = 1;

  constructor(
    private firestore: Firestore,
    private authService: Auths
  ) {}

  async loadCurrentLeagueSeason() {
    try {
      const seasonRef = doc(this.firestore, 'leagueSettings/season');
      const seasonSnap = await getDoc(seasonRef);
      
      if (seasonSnap.exists()) {
        this.currentLeagueSeason = seasonSnap.data()['currentSeason'] || 1;
      } else {
        // Initialize season settings if they don't exist
        await setDoc(seasonRef, {
          currentSeason: 1,
          createdDate: new Date()
        });
        this.currentLeagueSeason = 1;
      }
    } catch (error) {
      console.error('Error loading current league season:', error);
      this.currentLeagueSeason = 1;
    }
  }

  async ngOnInit() {
    // Check permissions
    this.authService.effectiveRoles.subscribe(roles => {
      this.canManageDraft = roles.some(role => 
        ['developer', 'commissioner'].includes(role)
      );
      this.isDeveloper = roles.includes('developer');
    });
    
    // Load current league season first
    await this.loadCurrentLeagueSeason();
    
    // Load teams
    await this.loadTeams();
    
    // Load draft classes
    await this.loadDraftClasses();
    
    // Load draft history
    await this.loadDraftHistory();
  }
  
  async loadTeams() {
    const teamsRef = collection(this.firestore, 'teams');
    const snapshot = await getDocs(teamsRef);
    
    this.teams = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        name: `${data['city']} ${data['mascot']}`,
        city: data['city'],
        mascot: data['mascot'],
        logoUrl: data['logoUrl'],
        conference: data['conference'],
        division: data['division'],
        league: data['league'] || 'major'
      };
    });
  }
  
  async loadDraftClasses() {
    this.loadingClasses = true;
    this.draftClassError = false;
    
    try {
      // Load draft classes from Firestore
      const classesRef = collection(this.firestore, 'draftClasses');
      const snapshot = await getDocs(classesRef);
      
      if (snapshot.empty) {
        // Create initial draft class for current season if none exist
        await this.createInitialDraftClass(this.currentLeagueSeason);
        await this.loadDraftClasses(); // Reload after creation
        return;
      }
      
      // Check if current season draft class exists
      const currentSeasonExists = snapshot.docs.some(doc => doc.data()['season'] === this.currentLeagueSeason);
      if (!currentSeasonExists) {
        await this.createInitialDraftClass(this.currentLeagueSeason);
        await this.loadDraftClasses(); // Reload after creation
        return;
      }
      
      // Process draft classes
      this.draftClasses = await Promise.all(snapshot.docs.map(async docSnap => {
        const data = docSnap.data();
        
        // Load players for this draft class using draftClass field
        const playersQuery = query(
          collection(this.firestore, 'players'),
          where('draftClass', '==', data['season']),
          where('status', '==', 'active')
        );
        
        const playersSnapshot = await getDocs(playersQuery);
        const players = await Promise.all(playersSnapshot.docs.map(async playerDocSnap => {
          const playerData = playerDocSnap.data();
          
          // Get overall rating from attributes
          let overall = 50;
          try {
            const attributesRef = doc(this.firestore, `players/${playerDocSnap.id}/meta/attributes`);
            const attributesSnap = await getDoc(attributesRef);
            if (attributesSnap.exists()) {
              const attributesData = attributesSnap.data();
              overall = attributesData['OVERALL'] || 50;
            }
          } catch (error) {
            console.error('Error loading player attributes:', error);
          }
          
          // Get team information if player has been assigned
          let teamName = undefined;
          let teamLogo = undefined;
          if (playerData['teamId'] && playerData['teamId'] !== 'none') {
            const team = this.teams.find(t => t.id === playerData['teamId']);
            if (team) {
              teamName = team.name;
              teamLogo = team.logoUrl;
            }
          }
          
          return {
            id: playerDocSnap.id,
            firstName: playerData['firstName'] || '',
            lastName: playerData['lastName'] || '',
            position: playerData['position'] || '',
            archetype: playerData['archetype'] || '',
            age: playerData['age'] || 19,
            overall,
            draftRank: playerData['draftRank'],
            teamId: playerData['teamId'],
            teamName,
            teamLogo,
            draftRound: playerData['draftRound'],
            draftPick: playerData['draftPick'],
            draftSeason: playerData['draftSeason'],
            draftStatus: playerData['draftStatus']
          };
        }));
        
        return {
          id: docSnap.id,
          season: data['season'],
          players,
          status: data['status'] || 'upcoming',
          startDate: data['startDate'],
          endDate: data['endDate'],
          league: data['league'] || 'major',
          draftOrderSet: data['draftOrderSet'] || false,
          draftOrder: data['draftOrder'] || []
        };
      }));
      
      // Sort draft classes by season (newest first)
      this.draftClasses.sort((a, b) => b.season - a.season);
      
      // Set selected draft class to the most recent one
      if (this.draftClasses.length > 0) {
        this.selectedDraftClass = this.draftClasses[0];
        // Don't auto-select for draft - let user choose
      }
    } catch (error) {
      console.error('Error loading draft classes:', error);
      this.draftClassError = true;
      this.draftClassErrorMessage = 'Failed to load draft classes. This may be due to missing Firestore indexes.';
      this.indexError = true;
    } finally {
      this.loadingClasses = false;
    }
  }
  
  async createInitialDraftClass(season: number) {
    try {
      // Create draft class document
      await addDoc(collection(this.firestore, 'draftClasses'), {
        season,
        status: 'upcoming',
        league: 'major',
        createdAt: new Date(),
        draftOrderSet: false,
        draftOrder: []
      });
      
      console.log(`Created initial draft class for season ${season}`);
    } catch (error) {
      console.error('Error creating initial draft class:', error);
    }
  }
  
  async loadCurrentDraft() {
    this.loadingDraft = true;
    
    try {
      if (!this.selectedDraftClassForDraft?.id) {
        this.draftPicks = [];
        this.loadingDraft = false;
        return;
      }

      // Load draft picks for this draft class
      const picksRef = collection(this.firestore, 'draftPicks');
      // Use simple query without compound ordering to avoid index requirements
      const picksQuery = query(
        picksRef, 
        where('draftClassId', '==', this.selectedDraftClassForDraft.id)
      );
      const picksSnap = await getDocs(picksQuery);
      
      this.draftPicks = await Promise.all(picksSnap.docs.map(async docSnap => {
        const data = docSnap.data();
        
        // Get team name
        let teamName = 'Unknown Team';
        const team = this.teams.find(t => t.id === data['teamId']);
        if (team) {
          teamName = team.name;
        }
        
        // Get original team name if different
        let originalTeamName = undefined;
        if (data['originalTeamId'] && data['originalTeamId'] !== data['teamId']) {
          const originalTeam = this.teams.find(t => t.id === data['originalTeamId']);
          if (originalTeam) {
            originalTeamName = originalTeam.name;
          }
        }
        
        // Get player name if picked
        let playerName = undefined;
        if (data['playerId']) {
          const playerRef = doc(this.firestore, `players/${data['playerId']}`);
          const playerSnap = await getDoc(playerRef);
          if (playerSnap.exists()) {
            const playerData = playerSnap.data();
            playerName = `${playerData['firstName']} ${playerData['lastName']}`;
          }
        }
        
        return {
          id: docSnap.id,
          draftClassId: data['draftClassId'],
          season: data['season'],
          round: data['round'],
          pick: data['pick'],
          teamId: data['teamId'],
          teamName,
          originalTeamId: data['originalTeamId'],
          originalTeamName,
          playerId: data['playerId'],
          playerName,
          completed: !!data['playerId']
        };
      }));
      
      // Determine current round and pick
      // Sort the picks manually after loading to avoid index requirements
      this.draftPicks.sort((a, b) => {
        if (a.round !== b.round) {
          return a.round - b.round;
        }
        return a.pick - b.pick;
      });
      this.updateCurrentDraftPosition();
      
      // Check if draft is in progress
      this.draftInProgress = this.selectedDraftClassForDraft.status === 'active';
      
    } catch (error) {
      console.error('Error loading current draft:', error);
    } finally {
      this.loadingDraft = false;
    }
  }
  
  updateCurrentDraftPosition() {
    // Find the first incomplete pick
    const firstIncompletePick = this.draftPicks.find(pick => !pick.completed);
    
    if (firstIncompletePick) {
      this.currentRound = firstIncompletePick.round;
      this.currentPick = firstIncompletePick.pick;
    } else if (this.draftPicks.length > 0) {
      // All picks are complete, set to last pick
      const lastPick = this.draftPicks[this.draftPicks.length - 1];
      this.currentRound = lastPick.round;
      this.currentPick = lastPick.pick;
    }
  }
  
  async generateDraftPicks() {
    if (!this.selectedDraftClassForDraft?.id || !this.selectedDraftClassForDraft.draftOrder) {
      console.error('No draft class selected or draft order not set');
      return;
    }

    try {
      const batch = writeBatch(this.firestore);
      
      // Generate picks for each round and team
      for (let round = 1; round <= this.draftRounds; round++) {
        for (let pick = 1; pick <= this.selectedDraftClassForDraft.draftOrder.length; pick++) {
          const teamIndex = pick - 1;
          const teamId = this.selectedDraftClassForDraft.draftOrder[teamIndex];
          const team = this.teams.find(t => t.id === teamId);
          
          if (!team) continue;
          
          const pickRef = doc(collection(this.firestore, 'draftPicks'));
          
          batch.set(pickRef, {
            draftClassId: this.selectedDraftClassForDraft.id,
            season: this.selectedDraftClassForDraft.season,
            round,
            pick,
            teamId: team.id,
            originalTeamId: team.id,
            completed: false,
            createdAt: new Date()
          });
        }
      }
      
      await batch.commit();
      console.log(`Generated ${this.draftRounds} rounds of draft picks`);
    } catch (error) {
      console.error('Error generating draft picks:', error);
    }
  }
  
  async loadDraftHistory() {
    this.loadingHistory = true;
    
    try {
      // Load completed draft classes
      const completedClassesQuery = query(
        collection(this.firestore, 'draftClasses'),
        where('status', '==', 'completed'),
        orderBy('season', 'desc'),
        limit(5)
      );
      
      const completedClassesSnap = await getDocs(completedClassesQuery);
      
      if (!completedClassesSnap.empty) {
        const historyPromises = completedClassesSnap.docs.map(async docSnap => {
          const draftClassId = docSnap.id;
          
          // Load picks for this draft class
          const picksRef = collection(this.firestore, 'draftPicks');
          const picksQuery = query(
            picksRef, 
            where('draftClassId', '==', draftClassId),
            orderBy('round'), 
            orderBy('pick')
          );
          const picksSnap = await getDocs(picksQuery);
          
          return Promise.all(picksSnap.docs.map(async pickDocSnap => {
            const data = pickDocSnap.data();
            
            // Get team name
            let teamName = 'Unknown Team';
            const team = this.teams.find(t => t.id === data['teamId']);
            if (team) {
              teamName = team.name;
            }
            
            // Get player name if picked
            let playerName = undefined;
            if (data['playerId']) {
              const playerRef = doc(this.firestore, `players/${data['playerId']}`);
              const playerSnap = await getDoc(playerRef);
              if (playerSnap.exists()) {
                const playerData = playerSnap.data();
                playerName = `${playerData['firstName']} ${playerData['lastName']}`;
              }
            }
            
            return {
              id: pickDocSnap.id,
              draftClassId: data['draftClassId'],
              season: data['season'],
              round: data['round'],
              pick: data['pick'],
              teamId: data['teamId'],
              teamName,
              playerId: data['playerId'],
              playerName,
              completed: !!data['playerId']
            };
          }));
        });
        
        const historyResults = await Promise.all(historyPromises);
        this.draftHistory = historyResults.flat();
      }
    } catch (error) {
      console.error('Error loading draft history:', error);
    } finally {
      this.loadingHistory = false;
    }
  }
  
  async startDraft() {
    if (!this.canManageDraft || !this.selectedDraftClassForDraft?.id) return;
    
    try {
      // Update draft class status
      const classRef = doc(this.firestore, `draftClasses/${this.selectedDraftClassForDraft.id}`);
      await updateDoc(classRef, {
        status: 'active',
        startDate: new Date()
      });
      
      this.selectedDraftClassForDraft.status = 'active';
      this.draftInProgress = true;
    } catch (error) {
      console.error('Error starting draft:', error);
    }
  }
  
  async endDraft() {
    if (!this.canManageDraft || !this.selectedDraftClassForDraft?.id) return;
    
    try {
      // Update draft class status
      const classRef = doc(this.firestore, `draftClasses/${this.selectedDraftClassForDraft.id}`);
      await updateDoc(classRef, {
        status: 'completed',
        endDate: new Date()
      });
      
      this.selectedDraftClassForDraft.status = 'completed';
      this.draftInProgress = false;
      
      // Move undrafted players to free agency
      const undraftedQuery = query(
        collection(this.firestore, 'players'),
        where('draftClass', '==', this.selectedDraftClassForDraft.season),
        where('draftStatus', '==', 'eligible')
      );
      
      const undraftedSnap = await getDocs(undraftedQuery);
      
      const batch = writeBatch(this.firestore);
      undraftedSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, {
          draftStatus: 'undrafted',
          freeAgent: true,
          teamId: 'none'
        });
      });
      
      await batch.commit();
      
    } catch (error) {
      console.error('Error ending draft:', error);
    }
  }

  async setDraftStatus(status: 'upcoming' | 'active' | 'completed') {
    if (!this.canManageDraft || !this.selectedDraftClassForDraft?.id) return;
    
    try {
      const classRef = doc(this.firestore, `draftClasses/${this.selectedDraftClassForDraft.id}`);
      const updateData: any = { status };
      
      // Add timestamps based on status
      if (status === 'active') {
        updateData.startDate = new Date();
      } else if (status === 'completed') {
        updateData.endDate = new Date();
        
        // Move undrafted players to free agency when completing
        const undraftedQuery = query(
          collection(this.firestore, 'players'),
          where('draftClass', '==', this.selectedDraftClassForDraft.season),
          where('draftStatus', '==', 'eligible')
        );
        
        const undraftedSnap = await getDocs(undraftedQuery);
        
        if (!undraftedSnap.empty) {
          const batch = writeBatch(this.firestore);
          undraftedSnap.docs.forEach(docSnap => {
            batch.update(docSnap.ref, {
              draftStatus: 'undrafted',
              freeAgent: true,
              teamId: 'none'
            });
          });
          await batch.commit();
        }
      }
      
      await updateDoc(classRef, updateData);
      
      // Update local state
      this.selectedDraftClassForDraft.status = status;
      this.draftInProgress = status === 'active';
      
      // Reload draft classes to reflect changes
      await this.loadDraftClasses();
      
    } catch (error) {
      console.error('Error updating draft status:', error);
      alert('Failed to update draft status. Please try again.');
    }
  }
  
  async openMakePickModal(pick: DraftPick) {
    if (!this.canManageDraft || !this.draftInProgress || pick.completed) return;
    
    this.selectedDraftPick = pick;
    
    // Load available players from the current draft class
    try {
      if (!this.selectedDraftClassForDraft) return;
      
      const playersQuery = query(
        collection(this.firestore, 'players'),
        where('draftClass', '==', this.selectedDraftClassForDraft.season),
        where('draftStatus', '==', 'eligible'),
        where('status', '==', 'active')
      );
      
      const playersSnap = await getDocs(playersQuery);
      
      this.availablePlayers = await Promise.all(playersSnap.docs.map(async docSnap => {
        const data = docSnap.data();
        
        // Get overall rating
        let overall = 50;
        try {
          const attributesRef = doc(this.firestore, `players/${docSnap.id}/meta/attributes`);
          const attributesSnap = await getDoc(attributesRef);
          if (attributesSnap.exists()) {
            const attributesData = attributesSnap.data();
            overall = attributesData['OVERALL'] || 50;
          }
        } catch (error) {
          console.error('Error loading player attributes:', error);
        }
        
        return {
          id: docSnap.id,
          firstName: data['firstName'] || '',
          lastName: data['lastName'] || '',
          position: data['position'] || '',
          archetype: data['archetype'] || '',
          age: data['age'] || 19,
          overall
        };
      }));
      
      // Apply default sorting (by overall, descending)
      this.sortPlayers();
      
      this.showMakePickModal = true;
    } catch (error) {
      console.error('Error loading available players:', error);
    }
  }
  
  async makeDraftPick() {
    if (!this.selectedPlayerId) return;
    
    const currentPick = this.getCurrentDraftPick();
    if (!currentPick || currentPick.completed || currentPick.passed) return;
    
    try {
      const player = this.availablePlayers.find(p => p.id === this.selectedPlayerId);
      if (!player) return;
      
      // Update draft pick
      const pickRef = doc(this.firestore, `draftPicks/${currentPick.id}`);
      await updateDoc(pickRef, {
        playerId: player.id,
        completed: true,
        completedAt: new Date()
      });
      
      // Update player
      const playerRef = doc(this.firestore, `players/${player.id}`);
      await updateDoc(playerRef, {
        teamId: currentPick.teamId,
        draftedBy: currentPick.teamId,
        draftRound: currentPick.round,
        draftPick: currentPick.pick,
        draftSeason: currentPick.season,
        draftStatus: 'drafted',
        freeAgent: false
      });
      
      // Add player to team roster
      const rosterRef = doc(this.firestore, `teams/${currentPick.teamId}/roster/${player.id}`);
      await setDoc(rosterRef, {
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        archetype: player.archetype,
        jerseyNumber: Math.floor(Math.random() * 98) + 1, // Random number 1-99
        age: player.age,
        teamId: currentPick.teamId,
        draftRound: currentPick.round,
        draftPick: currentPick.pick,
        draftSeason: currentPick.season
      });
      
      // Add to player history
      await addDoc(collection(this.firestore, `players/${player.id}/history`), {
        action: 'drafted',
        teamId: currentPick.teamId,
        timestamp: new Date(),
        details: `Drafted Round ${currentPick.round}, Pick ${currentPick.pick} by ${currentPick.teamName}`
      });
      
      // Clear selection and reload
      this.selectedPlayerId = '';
      
      await this.loadCurrentDraft();
    } catch (error) {
      console.error('Error making draft pick:', error);
      alert('Failed to make draft pick. Please try again.');
    }
  }
  
  async createDraftClass() {
    if (!this.canManageDraft) return;
    
    try {
      // Check if draft class already exists for this season
      const classRef = collection(this.firestore, 'draftClasses');
      const classQuery = query(classRef, where('season', '==', this.newDraftClassSeason));
      const classSnap = await getDocs(classQuery);
      
      if (!classSnap.empty) {
        alert(`Draft class for season ${this.newDraftClassSeason} already exists.`);
        return;
      }
      
      // Create new draft class
      await addDoc(collection(this.firestore, 'draftClasses'), {
        season: this.newDraftClassSeason,
        status: 'upcoming',
        league: this.newDraftClassLeague,
        createdAt: new Date(),
        draftOrderSet: false,
        draftOrder: []
      });
      
      // Close modal and reload
      this.showCreateClassModal = false;
      await this.loadDraftClasses();
    } catch (error) {
      console.error('Error creating draft class:', error);
    }
  }

  async setDraftOrder() {
    if (!this.canManageDraft || !this.selectedDraftClassForDraft?.id) return;
    
    // Get teams for the selected league
    const leagueTeams = this.teams.filter(t => (t.league || 'major') === this.selectedDraftClassForDraft!.league);
    
    if (leagueTeams.length === 0) {
      alert(`No teams found for ${this.selectedDraftClassForDraft.league} league.`);
      return;
    }
    
    // Set up teams for ordering (you could implement standings-based ordering here)
    this.draftOrderTeams = [...leagueTeams];
    this.showSetOrderModal = true;
  }

  async saveDraftOrder() {
    if (!this.selectedDraftClassForDraft?.id) return;
    
    try {
      const draftOrder = this.draftOrderTeams.map(t => t.id);
      
      // Update draft class with order
      const classRef = doc(this.firestore, `draftClasses/${this.selectedDraftClassForDraft.id}`);
      await updateDoc(classRef, {
        draftOrder,
        draftOrderSet: true
      });
      
      // Update local state
      this.selectedDraftClassForDraft.draftOrder = draftOrder;
      this.selectedDraftClassForDraft.draftOrderSet = true;
      
      // Generate draft picks
      await this.generateDraftPicks();
      
      // Load the draft
      await this.loadCurrentDraft();
      
      this.showSetOrderModal = false;
      alert('Draft order set successfully!');
    } catch (error) {
      console.error('Error saving draft order:', error);
      alert('Failed to save draft order. Please try again.');
    }
  }

  // Move team up in draft order
  moveTeamUp(index: number) {
    if (index > 0) {
      const temp = this.draftOrderTeams[index];
      this.draftOrderTeams[index] = this.draftOrderTeams[index - 1];
      this.draftOrderTeams[index - 1] = temp;
    }
  }

  // Move team down in draft order
  moveTeamDown(index: number) {
    if (index < this.draftOrderTeams.length - 1) {
      const temp = this.draftOrderTeams[index];
      this.draftOrderTeams[index] = this.draftOrderTeams[index + 1];
      this.draftOrderTeams[index + 1] = temp;
    }
  }
  
  // Helper methods for filtering and sorting
  filterPlayers(): DraftPlayer[] {
    if (!this.selectedDraftClass) return [];
    
    let filtered = [...this.selectedDraftClass.players];
    
    // Apply position filter
    if (this.positionFilter !== 'all') {
      filtered = filtered.filter(p => p.position === this.positionFilter);
    }
    
    // Apply age filter
    if (this.ageFilter !== 'all') {
      const age = parseInt(this.ageFilter);
      filtered = filtered.filter(p => p.age === age);
    }
    
    return filtered;
  }
  
  sortPlayers() {
    if (!this.availablePlayers) return;
    
    this.availablePlayers.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'overall':
          comparison = b.overall - a.overall;
          break;
        case 'age':
          comparison = a.age - b.age;
          break;
        case 'position':
          // Order: G, D, C, LW, RW
          const posOrder = { 'G': 1, 'D': 2, 'C': 3, 'LW': 4, 'RW': 5 };
          comparison = (posOrder[a.position as keyof typeof posOrder] || 99) - 
                      (posOrder[b.position as keyof typeof posOrder] || 99);
          break;
      }
      
      // Apply sort direction
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }
  
  // UI helper methods
  getPositionColor(position: string): string {
    switch (position) {
      case 'G': return '#dc3545'; // Red
      case 'D': return '#fd7e14'; // Orange
      case 'C': return '#28a745'; // Green
      case 'LW': return '#17a2b8'; // Teal
      case 'RW': return '#007bff'; // Blue
      default: return '#6c757d'; // Gray
    }
  }
  
  getOverallColor(overall: number): string {
    // Clamp the value between 50 and 99
    const clampedOverall = Math.max(50, Math.min(99, overall));
    
    // Calculate the percentage from 50 to 99 (0% to 100%)
    const percentage = (clampedOverall - 50) / (99 - 50);
    
    // Use a more vibrant red to green interpolation
    const red = Math.round(220 - (220 - 34) * percentage);
    const green = Math.round(38 + (197 - 38) * percentage);
    const blue = Math.round(38 + (94 - 38) * percentage);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }
  
  getCurrentDraftPick(): DraftPick | null {
    return this.draftPicks.find(p => p.round === this.currentRound && p.pick === this.currentPick) || null;
  }
  
  getDraftPicksForRound(round: number): DraftPick[] {
    return this.draftPicks.filter(p => p.round === round);
  }
  
  getTeamLogo(teamId: string): string {
    const team = this.teams.find(t => t.id === teamId);
    return team?.logoUrl || '';
  }
  
  getTeamName(teamId: string): string {
    const team = this.teams.find(t => t.id === teamId);
    return team?.name || 'Unknown Team';
  }
  
  // Draft class management
  selectDraftClass(draftClass: DraftClass) {
    this.selectedDraftClass = draftClass;
  }

  selectDraftClassForDraft(draftClass: DraftClass) {
    this.selectedDraftClassForDraft = draftClass;
    this.loadCurrentDraft();
  }

  public onDraftClassSelectionChange() {
    if (this.selectedDraftClassId) {
      const draftClass = this.draftClasses.find(dc => dc.id === this.selectedDraftClassId);
      if (draftClass) {
        this.selectedDraftClassForDraft = draftClass;
        this.loadCurrentDraft();
      }
    } else {
      this.selectedDraftClassForDraft = null;
      this.draftPicks = [];
    }
  }
  
  // Draft navigation
  goToRound(round: number) {
    this.currentRound = round;
  }

  // Draft history helper methods
  getUniqueDraftSeasons(): number[] {
    const seasons = [...new Set(this.draftHistory.map(p => p.season))];
    return seasons.sort((a, b) => b - a);
  }

  getPicksForSeason(season: number): DraftPick[] {
    return this.draftHistory.filter(p => p.season === season);
  }

  // Error handling methods
  getIndexUrl(): string {
    return 'https://console.firebase.google.com/u/1/project/gohls-3033e/firestore/indexes';
  }
}