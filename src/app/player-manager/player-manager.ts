import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Firestore, collection, getDocs, addDoc, query, where, doc, setDoc, getDoc, updateDoc, orderBy, limit } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-player-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './player-manager.component.html',
  styleUrls: ['./player-manager.component.css']
})
export class PlayerManager implements OnInit, OnDestroy {
  private firestore: Firestore = inject(Firestore);
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);

  player: any = null;
  pendingPlayer: any = null;
  teamName: string = '';
  teamLogo: string = '';
  loading = true;
  isPendingPlayer = false;

  trainingType: string = '';
  tempTrainingType: string = '';
  trainingOptions: string[] = [];
  trainingSubmitted = false;
  trainingStatus: 'pending' | 'processed' | null = null;
  trainingProcessed = false;

  // Progression control
  progressionsOpen = true;
  currentProgressionWeek = 1;
  hasSubmittedThisWeek = false;

  secondaryProgress: number = 0;
  existingTrainingId: string | null = null;

  // Player attributes
  playerAttributes: Record<string, number> = {};
  
  // Attribute display order
  skaterAttributeOrder = [
    'SPEED', 'BODY CHK', 'ENDUR', 'PK CTRL', 'PASSING', 'SHT/PSS',
    'SLAP PWR', 'SLAP ACC', 'WRI PWR', 'WRI ACC', 'AGILITY', 'STRENGTH',
    'ACCEL', 'BALANCE', 'FACEOFF', 'DRBLTY', 'DEKE', 'AGGRE', 'POISE',
    'HND EYE', 'SHT BLK', 'OFF AWR', 'DEF AWR', 'DISCIP', 'FIGHTING',
    'STK CHK'
  ];

  goalieAttributeOrder = [
    'GLV LOW', 'GLV HIGH', 'STK LOW', 'STK HIGH', '5 HOLE', 'SPEED',
    'AGILITY', 'CONSIS', 'PK CTRL', 'ENDUR', 'BRK AWAY', 'RBD CTRL',
    'RECOV', 'POISE', 'PASSING', 'ANGLES', 'PK PL FRQ', 'AGGRE',
    'DRBLTY', 'VISION'
  ];

  // Training impact mapping
  private trainingMap: Record<string, string[]> = {
    'Speed Skating': ['SPEED', 'ACCEL', 'AGILITY'],
    'Distance Skating': ['ENDUR', 'BALANCE', 'DRBLTY'],
    'Stick Handling': ['PK CTRL', 'DEKE', 'HND EYE'],
    'MMA': ['BODY CHK', 'STRENGTH', 'AGGRE', 'FIGHTING'],
    'Marksmanship': ['WRI PWR', 'SLAP PWR', 'PASSING'],
    'Hit the Targets': ['WRI ACC', 'SLAP ACC', 'POISE'],
    'Study Film': ['OFF AWR', 'DEF AWR', 'DISCIP'],
    'Special Teams': ['STK CHK', 'SHT BLK', 'FACEOFF'],
    'Learn Secondary Position': [],
    'Shots High': ['GLV HIGH', 'STK HIGH', 'VISION'],
    'Shots Low': ['GLV LOW', 'STK LOW', '5 HOLE'],
    'Side to Sides': ['SPEED', 'AGILITY', 'POISE'],
    'Puck Skills': ['PK CTRL', 'PASSING', 'PK PL FRQ'],
    'Laps in Pads': ['ENDUR', 'DRBLTY', 'AGGRE'],
    'Positioning': ['BRK AWAY', 'ANGLES'],
    'Under Pressure': ['RBD CTRL', 'RECOV']
  };

  // History data
  playerHistory: any[] = [];
  gameStats: any[] = [];
  trainingHistory: any[] = [];
  currentView: 'overview' | 'history' | 'stats' | 'trainings' = 'overview';
  showRetireModal = false;
  retireConfirmation = '';

  // Caching
  private teamCache = new Map<string, any>();
  private gameStatsCache: any[] | null = null;
  private historyCache: any[] | null = null;

  // Week change listener
  private weekChangeListener?: () => void;

  async ngOnInit() {
    const user = this.auth.currentUser;
    if (!user) {
      this.loading = false;
      return;
    }

    console.log('PlayerManager: Initializing for user:', user.uid);

    // Set up week change listener
    this.weekChangeListener = () => {
      console.log('🔄 Week change detected, refreshing progression settings...');
      this.loadProgressionSettings();
    };
    window.addEventListener('weekChanged', this.weekChangeListener);

    try {
      // OPTIMIZATION: Load all initial data in parallel
      const [playerData, progressionSettings] = await Promise.all([
        this.loadPlayerData(user.uid),
        this.loadProgressionSettings()
      ]);

      if (playerData) {
        await this.initializePlayerData(playerData);
      }
    } catch (error) {
      console.error('Error initializing player manager:', error);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    if (this.weekChangeListener) {
      window.removeEventListener('weekChanged', this.weekChangeListener);
    }
  }

  // OPTIMIZATION: Single method to load player data (active or pending)
  private async loadPlayerData(userId: string): Promise<any> {
    console.log('🔍 Loading player data for user:', userId);

    // Run both queries in parallel
    const [activeSnapshot, pendingSnapshot] = await Promise.all([
      getDocs(query(
        collection(this.firestore, 'players'),
        where('userId', '==', userId),
        where('status', '==', 'active'),
        limit(1) // Only need one result
      )),
      getDocs(query(
        collection(this.firestore, 'pendingPlayers'),
        where('userId', '==', userId),
        where('status', '==', 'pending'),
        limit(1) // Only need one result
      ))
    ]);

    // Priority: Active player first
    if (!activeSnapshot.empty) {
      const playerData = activeSnapshot.docs[0].data();
      // FIXED: Use bracket notation to access id property
      playerData['id'] = activeSnapshot.docs[0].id;
      this.player = playerData;
      this.isPendingPlayer = false;
      console.log('⚡ Active player found');
      return { type: 'active', data: playerData };
    }

    // Fallback: Pending player
    if (!pendingSnapshot.empty) {
      const pendingData = pendingSnapshot.docs[0].data();
      // FIXED: Use bracket notation to access id property
      pendingData['id'] = pendingSnapshot.docs[0].id;
      this.pendingPlayer = pendingData;
      this.isPendingPlayer = true;
      console.log('⏳ Pending player found');
      return { type: 'pending', data: pendingData };
    }

    console.log('❌ No player found');
    return null;
  }

  // OPTIMIZATION: Initialize all player-related data in parallel
  private async initializePlayerData(playerData: any) {
    if (playerData.type === 'pending') {
      // For pending players, no additional data needed
      return;
    }

    this.setTrainingOptions(this.player.position);

    // Load all player data in parallel to reduce sequential API calls
    const loadPromises = [
      this.loadPlayerAttributes(),
      this.loadProgressionData(),
      this.loadTeamData()
    ];

    // Only load heavy data when user navigates to those tabs
    if (this.currentView === 'history') {
      loadPromises.push(this.loadPlayerHistory());
    }
    if (this.currentView === 'stats') {
      loadPromises.push(this.loadGameStats());
    }
    if (this.currentView === 'trainings') {
      loadPromises.push(this.loadTrainingHistory());
    }

    await Promise.all(loadPromises);
  }

  // OPTIMIZATION: Load progression data in a single method
  private async loadProgressionData() {
    if (!this.player?.id) return;

    const [secondaryProgressSnap, currentWeekSnap] = await Promise.all([
      // Get secondary position progress
      getDocs(query(
        collection(this.firestore, `players/${this.player.id}/progressions`),
        where('training', '==', 'Learn Secondary Position')
      )),
      // Get current week submission
      getDocs(query(
        collection(this.firestore, `players/${this.player.id}/progressions`),
        where('week', '==', this.currentProgressionWeek),
        where('season', '==', new Date().getFullYear()),
        limit(1)
      ))
    ]);

    // Process secondary progress
    this.secondaryProgress = secondaryProgressSnap.docs.length;

    // Process current week submission
    if (!currentWeekSnap.empty) {
      const submissionData = currentWeekSnap.docs[0].data();
      this.hasSubmittedThisWeek = true;
      this.trainingType = submissionData['training'];
      this.tempTrainingType = this.trainingType;
      this.trainingStatus = submissionData['status'] || 'pending';
      this.trainingProcessed = this.trainingStatus === 'processed';
      this.trainingSubmitted = true;
      this.existingTrainingId = currentWeekSnap.docs[0].id;
    }
  }

  // OPTIMIZATION: Load team data with caching
  private async loadTeamData() {
    if (!this.player?.id || this.player.teamId === 'none') return;

    // Check cache first
    if (this.teamCache.has(this.player.teamId)) {
      const cachedTeam = this.teamCache.get(this.player.teamId);
      this.teamName = cachedTeam.name;
      this.teamLogo = cachedTeam.logo;
      return;
    }

    // Load from Firebase
    const teamRef = doc(this.firestore, `teams/${this.player.teamId}`);
    const teamSnap = await getDoc(teamRef);
    
    if (teamSnap.exists()) {
      const teamData = teamSnap.data();
      const name = `${teamData['city']} ${teamData['mascot']}`.trim();
      const logo = teamData['logoUrl'] || '';
      
      // Cache the result
      this.teamCache.set(this.player.teamId, { name, logo });
      
      this.teamName = name;
      this.teamLogo = logo;
    }
  }

  // OPTIMIZATION: Lazy load game stats only when needed
  async loadGameStats() {
    if (!this.player?.id) return;

    // Return cached data if available
    if (this.gameStatsCache) {
      this.gameStats = this.gameStatsCache;
      return;
    }

    console.log('📊 Loading game stats...');
    this.gameStats = [];

    try {
      // OPTIMIZATION: Only load teams that have this player in their roster
      const teamsRef = collection(this.firestore, 'teams');
      const teamsSnap = await getDocs(teamsRef);
      
      const gamePromises: Promise<any>[] = [];
      const uniqueGames = new Map<string, any>();

      // Process teams in parallel
      for (const teamDoc of teamsSnap.docs) {
        const teamId = teamDoc.id;
        const teamData = teamDoc.data();
        
        // Check if player is in this team's roster (quick check)
        const rosterRef = doc(this.firestore, `teams/${teamId}/roster/${this.player.id}`);
        const rosterSnap = await getDoc(rosterRef);
        
        if (!rosterSnap.exists()) continue; // Skip teams where player never played
        
        const teamName = `${teamData['city']} ${teamData['mascot']}`;
        
        // Load games for this team
        gamePromises.push(
          this.loadTeamGamesForPlayer(teamId, teamName, uniqueGames)
        );
      }

      // Wait for all team game loads to complete
      await Promise.all(gamePromises);
      
      // Convert to array and sort
      this.gameStats = Array.from(uniqueGames.values())
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      // Cache the results
      this.gameStatsCache = this.gameStats;
      
      console.log(`✅ Loaded ${this.gameStats.length} game stats`);
    } catch (error) {
      console.error('Error loading game stats:', error);
    }
  }

  // Helper method to load games for a specific team
  private async loadTeamGamesForPlayer(teamId: string, teamName: string, uniqueGames: Map<string, any>) {
    const gamesRef = collection(this.firestore, `teams/${teamId}/games`);
    const gamesSnap = await getDocs(gamesRef);
    
    for (const gameDoc of gamesSnap.docs) {
      const gameData = gameDoc.data();
      
      // Check if this player has stats in this game
      const homePlayerStats = gameData['homePlayerStats']?.[this.player.id];
      const awayPlayerStats = gameData['awayPlayerStats']?.[this.player.id];
      
      if (!homePlayerStats && !awayPlayerStats) continue;
      
      const playerStats = homePlayerStats || awayPlayerStats;
      const isHome = !!homePlayerStats;
      
      // Get opponent information (cached)
      const opponentTeamId = isHome ? gameData['awayTeamId'] : gameData['homeTeamId'];
      let opponent = 'Unknown Opponent';
      
      if (opponentTeamId && this.teamCache.has(opponentTeamId)) {
        opponent = this.teamCache.get(opponentTeamId).name;
      } else if (opponentTeamId) {
        // Load and cache opponent data
        const opponentRef = doc(this.firestore, `teams/${opponentTeamId}`);
        const opponentSnap = await getDoc(opponentRef);
        if (opponentSnap.exists()) {
          const opponentData = opponentSnap.data();
          const opponentName = `${opponentData['city']} ${opponentData['mascot']}`;
          this.teamCache.set(opponentTeamId, { name: opponentName, logo: opponentData['logoUrl'] || '' });
          opponent = opponentName;
        }
      }
      
      // Create unique key
      const gameKey = `${gameData['week']}-${gameData['day']}-${gameData['homeTeamId']}-${gameData['awayTeamId']}`;
      
      if (!uniqueGames.has(gameKey)) {
        uniqueGames.set(gameKey, {
          gameId: gameDoc.id,
          teamName,
          opponent,
          date: gameData['date']?.toDate?.() || new Date(),
          week: gameData['week'],
          day: gameData['day'],
          isHome,
          goals: playerStats.goals || 0,
          assists: playerStats.assists || 0,
          plusMinus: playerStats.plusMinus || 0,
          shots: playerStats.shots || 0,
          pim: playerStats.pim || 0,
          hits: playerStats.hits || 0,
          ppg: playerStats.ppg || 0,
          shg: playerStats.shg || 0,
          fot: playerStats.fot || 0,
          fow: playerStats.fow || 0
        });
      }
    }
  }

  // OPTIMIZATION: Lazy load player history only when needed
  async loadPlayerHistory() {
    if (!this.player?.id) return;

    // Return cached data if available
    if (this.historyCache) {
      this.playerHistory = this.historyCache;
      return;
    }

    console.log('📜 Loading player history...');
    
    const historyRef = collection(this.firestore, `players/${this.player.id}/history`);
    const historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(20)); // Limit to recent history
    const historySnap = await getDocs(historyQuery);
    
    // Process history with cached team data
    this.playerHistory = await Promise.all(historySnap.docs.map(async (historyDoc) => {
      const data = historyDoc.data();
      let teamName = 'Unknown Team';
      let teamLogo = '';
      
      if (data['teamId'] && data['teamId'] !== 'none') {
        // Use cached team data if available
        if (this.teamCache.has(data['teamId'])) {
          const cachedTeam = this.teamCache.get(data['teamId']);
          teamName = cachedTeam.name;
          teamLogo = cachedTeam.logo;
        } else {
          // Load and cache team data
          const teamRef = doc(this.firestore, `teams/${data['teamId']}`);
          const teamSnap = await getDoc(teamRef);
          if (teamSnap.exists()) {
            const teamData = teamSnap.data() as any;
            teamName = `${teamData['city']} ${teamData['mascot']}`;
            teamLogo = teamData['logoUrl'] || '';
            this.teamCache.set(data['teamId'], { name: teamName, logo: teamLogo });
          }
        }
      }
      
      return {
        id: historyDoc.id,
        ...data,
        teamName,
        teamLogo,
        timestamp: data['timestamp']?.toDate?.() || new Date(data['timestamp'])
      };
    }));

    // Cache the results
    this.historyCache = this.playerHistory;
    console.log(`✅ Loaded ${this.playerHistory.length} history entries`);
  }

  async loadPlayerAttributes() {
    if (!this.player?.id) return;
    
    const attributesRef = doc(this.firestore, `players/${this.player.id}/meta/attributes`);
    const attributesSnap = await getDoc(attributesRef);
    
    if (attributesSnap.exists()) {
      this.playerAttributes = attributesSnap.data() as Record<string, number>;
    }
  }

  async loadTrainingHistory() {
    if (!this.player?.id) return;

    const trainingRef = collection(this.firestore, `players/${this.player.id}/progressions`);
    const trainingQuery = query(trainingRef, orderBy('timestamp', 'desc'), limit(10)); // Limit recent training
    const trainingSnap = await getDocs(trainingQuery);
    
    this.trainingHistory = trainingSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data()['timestamp']?.toDate?.() || new Date(doc.data()['timestamp'])
    }));
  }

  // OPTIMIZATION: Load data only when tab is accessed
  async onTabChange(tab: 'overview' | 'history' | 'stats' | 'trainings') {
    this.currentView = tab;

    // Lazy load data based on tab
    switch (tab) {
      case 'history':
        if (!this.historyCache) {
          await this.loadPlayerHistory();
        }
        break;
      case 'stats':
        if (!this.gameStatsCache) {
          await this.loadGameStats();
        }
        break;
      case 'trainings':
        if (this.trainingHistory.length === 0) {
          await this.loadTrainingHistory();
        }
        break;
    }
  }

  async loadProgressionSettings() {
    try {
      const settingsRef = doc(this.firestore, 'progressionSettings/config');
      const snap = await getDoc(settingsRef);

      const previousWeek = this.currentProgressionWeek;

      if (snap.exists()) {
        const data = snap.data();
        this.progressionsOpen = data['open'] ?? true;
        this.currentProgressionWeek = data['week'] ?? 1;
      } else {
        this.progressionsOpen = true;
        this.currentProgressionWeek = 1;
      }

      if (previousWeek !== this.currentProgressionWeek && previousWeek !== 0) {
        console.log(`📅 Week changed from ${previousWeek} to ${this.currentProgressionWeek}`);
        await this.handleWeekChange();
      }

      if (this.player?.id) {
        await this.checkCurrentWeekSubmission();
      }
    } catch (error) {
      console.error('Error loading progression settings:', error);
      this.progressionsOpen = true;
      this.currentProgressionWeek = 1;
    }
  }

  async handleWeekChange() {
    console.log('🔄 Handling week change...');
    this.tempTrainingType = '';
    this.trainingType = '';
    this.trainingSubmitted = false;
    this.trainingStatus = null;
    this.trainingProcessed = false;
    this.existingTrainingId = null;
    this.hasSubmittedThisWeek = false;
    console.log('✅ Training selection cleared for new week');
  }

  async checkCurrentWeekSubmission() {
    if (!this.player?.id) return;

    try {
      const progressRef = collection(this.firestore, `players/${this.player.id}/progressions`);
      const q = query(
        progressRef,
        where('week', '==', this.currentProgressionWeek),
        where('season', '==', new Date().getFullYear()),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const submissionData = snapshot.docs[0].data();
        this.hasSubmittedThisWeek = true;
        this.trainingType = submissionData['training'];
        this.tempTrainingType = this.trainingType;
        this.trainingStatus = submissionData['status'] || 'pending';
        this.trainingProcessed = this.trainingStatus === 'processed';
        this.trainingSubmitted = true;
        this.existingTrainingId = snapshot.docs[0].id;
      } else {
        this.hasSubmittedThisWeek = false;
        this.trainingSubmitted = false;
        this.trainingProcessed = false;
      }
    } catch (error) {
      console.error('Error checking current week submission:', error);
    }
  }

  setTrainingOptions(position: string) {
    if (position === 'G') {
      this.trainingOptions = [
        'Shots High', 'Shots Low', 'Side to Sides', 'Puck Skills',
        'Laps in Pads', 'Positioning', 'Under Pressure'
      ];
    } else {
      this.trainingOptions = [
        'Speed Skating', 'Distance Skating', 'Stick Handling', 'MMA',
        'Marksmanship', 'Hit the Targets', 'Study Film', 'Special Teams'
      ];
      if (position !== 'D') {
        this.trainingOptions.push('Learn Secondary Position');
      }
    }
  }

  onTrainingChange() {
    // This will trigger the template to update the visual indicators
  }

  isAttributeAffected(attribute: string): boolean {
    if (!this.tempTrainingType) return false;
    const affectedAttributes = this.trainingMap[this.tempTrainingType] || [];
    return affectedAttributes.includes(attribute);
  }

  getAttributeDelta(): number {
    if (!this.player?.age) return 0;
    
    const age = this.player.age;
    const currentWeek = this.currentProgressionWeek;
    
    if (age <= 26) return currentWeek <= 5 ? 3 : 2;
    if (age <= 29) return 1;
    if (age === 30) return 1;
    if (age === 31) return -1;
    if (age === 32) return -2;
    if (age === 33) return -2;
    return -3;
  }

  canEditTraining(): boolean {
    return !this.trainingProcessed && this.progressionsOpen;
  }

  async submitTraining() {
    if (!this.tempTrainingType || !this.player?.id || !this.player?.teamId) return;

    if (!this.progressionsOpen) {
      alert('Training submissions are currently closed. Please wait for the next progression period to open.');
      return;
    }

    if (this.trainingProcessed) {
      alert('Your training has already been processed and cannot be modified. Please wait for the next week.');
      return;
    }

    if (this.hasSubmittedThisWeek && !this.existingTrainingId) {
      alert(`You have already submitted training for Week ${this.currentProgressionWeek}. Please wait for the next week.`);
      return;
    }
  
    const currentSeason = new Date().getFullYear();
    const trainingData = {
      training: this.tempTrainingType,
      timestamp: new Date(),
      status: 'pending',
      week: this.currentProgressionWeek,
      season: currentSeason
    };
  
    const playerProgressionRef = collection(this.firestore, `players/${this.player.id}/progressions`);
    const teamProgressionRef = collection(this.firestore, `teams/${this.player.teamId}/roster/${this.player.id}/progression`);
  
    if (this.existingTrainingId) {
      if (this.trainingProcessed) {
        alert('Your training has already been processed and cannot be modified.');
        return;
      }
      
      const trainingDoc = doc(this.firestore, `players/${this.player.id}/progressions/${this.existingTrainingId}`);
      await updateDoc(trainingDoc, trainingData);
      
      const teamDoc = doc(this.firestore, `teams/${this.player.teamId}/roster/${this.player.id}/progression/${this.existingTrainingId}`);
      await setDoc(teamDoc, trainingData);
    } else {
      const docRef = await addDoc(playerProgressionRef, trainingData);
      this.existingTrainingId = docRef.id;
  
      const teamDoc = doc(this.firestore, `teams/${this.player.teamId}/roster/${this.player.id}/progression/${docRef.id}`);
      await setDoc(teamDoc, trainingData);
    }
  
    this.trainingType = this.tempTrainingType;
    this.trainingStatus = 'pending';
    this.trainingProcessed = false;
    this.hasSubmittedThisWeek = true;
  
    if (this.trainingType === 'Learn Secondary Position') {
      this.secondaryProgress++;
      if (this.secondaryProgress >= 3) {
        alert('You have successfully learned your secondary position!');
      }
    }
  
    this.trainingSubmitted = true;
    await this.loadTrainingHistory();
  }

  async retirePlayer() {
    if (this.retireConfirmation !== 'RETIRE') {
      alert('Please type "RETIRE" to confirm retirement');
      return;
    }

    if (!this.player?.id) return;

    try {
      const historyRef = collection(this.firestore, `players/${this.player.id}/history`);
      await addDoc(historyRef, {
        action: 'retired',
        teamId: this.player.teamId,
        timestamp: new Date(),
        details: 'Player announced retirement from professional hockey'
      });

      const playerRef = doc(this.firestore, `players/${this.player.id}`);
      await updateDoc(playerRef, {
        status: 'retired',
        retiredDate: new Date(),
        teamId: 'retired'
      });

      if (this.player.teamId && this.player.teamId !== 'none') {
        const rosterRef = doc(this.firestore, `teams/${this.player.teamId}/roster/${this.player.id}`);
        await updateDoc(rosterRef, {
          status: 'retired',
          retiredDate: new Date()
        });
      }

      this.showRetireModal = false;
      this.player.status = 'retired';
      
      window.dispatchEvent(new CustomEvent('playerRetired'));
      alert('Your player has been retired. Thank you for your service to the league!');
    } catch (error) {
      console.error('Error retiring player:', error);
      alert('Failed to retire player. Please try again.');
    }
  }

  getTotalStats() {
    return this.gameStats.reduce((totals, game) => {
      totals.games += 1;
      totals.goals += game.goals || 0;
      totals.assists += game.assists || 0;
      totals.points += (game.goals || 0) + (game.assists || 0);
      totals.pim += game.pim || 0;
      totals.hits += game.hits || 0;
      totals.shots += game.shots || 0;
      return totals;
    }, { games: 0, goals: 0, assists: 0, points: 0, pim: 0, hits: 0, shots: 0 });
  }

  getTeamHistory() {
    const teams = new Map();
    
    this.playerHistory.forEach(entry => {
      if (entry.action === 'signed' || entry.action === 'traded') {
        teams.set(entry.teamId, {
          teamName: entry.teamName,
          teamLogo: entry.teamLogo,
          joinDate: entry.timestamp,
          action: entry.action
        });
      }
    });

    return Array.from(teams.values()).sort((a, b) => b.joinDate.getTime() - a.joinDate.getTime());
  }
}