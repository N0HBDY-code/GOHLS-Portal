import { Component, OnInit, inject } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  updateDoc
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auths } from '../auth-service/auth-service';

interface Team {
  id: string;
  name: string;
  league: string;
  conference: string;
  division: string;
  logoUrl?: string;
  wins: number;
  losses: number;
  overtimeLosses: number;
  points: number;
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifferential: number;
  pointPercentage: number;
  playoffStatus?: string;
}

interface Game {
  id: string;
  teamId: string;
  opponent: string;
  date: any;
  players: Player[];
}

interface Player {
  name: string;
  points: number;
  assists: number;
  rebounds: number;
}

interface Conference {
  name: string;
  divisions: string[];
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analytics.html',
  styleUrls: ['./analytics.css']
})
export class Analytics implements OnInit {
  currentView: 'standings' | 'playerstats' | 'analytics' = 'standings';
  
  // Caching system
  private teamsCache: Team[] | null = null;
  private playerStatsCache: any[] | null = null;
  private gamesCache: Map<string, Game[]> = new Map();
  private teamStatsCache: Map<string, any> = new Map();
  private lastCacheTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Player stats properties
  playerStatsView: 'goals' | 'assists' | 'points' | 'points60' | 'toi' | 'shots' | 'ppg' | 'shg' | 'hits' | 'pim' | 'possession' | 'plusminus' | 'saves' | 'savepct' | 'shutouts' | 'gaa' = 'goals';
  showRookieOnly = false;
  playerStats: any[] = [];
  loadingPlayerStats = false;
  playerStatsPage = 0;
  playersPerPage = 10;
  
  playerStatsCategories = [
    { key: 'goals', label: 'Goals Leaders', icon: 'fas fa-bullseye' },
    { key: 'assists', label: 'Assist Leaders', icon: 'fas fa-hands-helping' },
    { key: 'points', label: 'Points Leaders', icon: 'fas fa-star' },
    { key: 'points60', label: 'Points per 60', icon: 'fas fa-clock' },
    { key: 'toi', label: 'Time on Ice Leaders', icon: 'fas fa-stopwatch' },
    { key: 'shots', label: 'Shots on Goal Leaders', icon: 'fas fa-hockey-puck' },
    { key: 'ppg', label: 'Powerplay Goal Leaders', icon: 'fas fa-bolt' },
    { key: 'shg', label: 'Short Handed Goal Leaders', icon: 'fas fa-shield-alt' },
    { key: 'hits', label: 'Hits Leaders', icon: 'fas fa-fist-raised' },
    { key: 'pim', label: 'Penalty Minute Leaders', icon: 'fas fa-exclamation-triangle' },
    { key: 'possession', label: 'Puck Possession Leaders', icon: 'fas fa-hand-holding' },
    { key: 'plusminus', label: '+/- Leaders', icon: 'fas fa-plus-minus' },
    { key: 'saves', label: 'Save Leaders', icon: 'fas fa-hand-paper' },
    { key: 'savepct', label: 'Save % Leaders', icon: 'fas fa-percentage' },
    { key: 'shutouts', label: 'Shutout Leaders', icon: 'fas fa-lock' },
    { key: 'gaa', label: 'Goals Against Average', icon: 'fas fa-chart-line' }
  ];

  // Standings properties
  selectedLeague = 'major';
  standingsViewType: 'division' | 'conference' | 'overall' = 'division';
  teams: Team[] = [];
  filteredTeams: Team[] = [];
  loadingStandings = false;
  showPlayoffManager = false;
  canManagePlayoffs = false;
  
  conferences: Conference[] = [
    {
      name: 'Mr. Hockey Conference',
      divisions: ['Europe Division', 'Great Lakes Division', 'Atlantic Division']
    },
    {
      name: 'The Rocket Conference',
      divisions: ['Northwest Division', 'Pacific Division', 'South Division']
    }
  ];

  // Analytics properties
  selectedTeamId = '';
  selectedTeamName = '';
  
  // Comprehensive team analytics
  teamAnalytics = {
    // Record stats
    homeRecord: { wins: 0, losses: 0, otl: 0 },
    awayRecord: { wins: 0, losses: 0, otl: 0 },
    currentStreak: { type: '', count: 0 },
    longestWinStreak: 0,
    longestLoseStreak: 0,
    
    // Offensive stats
    goals: 0,
    evenStrengthGoals: 0,
    mostGoalsInGame: 0,
    shotAttempts: 0,
    shootingPercentage: 0,
    avgGoalsPerGame: 0,
    
    // Defensive stats
    goalsAgainst: 0,
    mostGoalsAgainstInGame: 0,
    shotsAgainst: 0,
    goalsAgainstPercentage: 0,
    avgGoalsAgainstPerGame: 0,
    
    // General stats
    goalDifferential: 0,
    hits: 0,
    passingPercentage: 0,
    faceoffsTaken: 0,
    faceoffsWon: 0,
    faceoffPercentage: 0,
    
    // Special teams
    powerplayTimeOnIce: 0,
    penaltyKills: { successful: 0, total: 0 },
    penaltyKillPercentage: 0,
    
    // Time stats
    timeOnAttack: 0,
    timeOnAttackPerGoal: 0,
    timeOnDefense: 0,
    timeOnDefensePerGoal: 0,
    fights: 0,
    
    // Game count
    totalGames: 0
  };

  // Reports properties
  exportGames: Game[] = [];
  selectedExportTeamId = '';
  selectedExportGameId = '';

  private firestore = inject(Firestore);
  private authService = inject(Auths);

  // Expose Math to template
  Math = Math;

  async ngOnInit() {
    // Check permissions
    this.authService.effectiveRoles.subscribe(roles => {
      this.canManagePlayoffs = roles.some(role => 
        ['developer', 'commissioner'].includes(role)
      );
    });

    // Load teams first (required for standings)
    await this.loadTeamsOptimized();
    
    // Only load player stats when that tab is accessed
    if (this.currentView === 'playerstats') {
      await this.loadPlayerStatsOptimized();
    }
  }

  private isCacheValid(): boolean {
    return Date.now() - this.lastCacheTime < this.CACHE_DURATION;
  }

  private updateCacheTime(): void {
    this.lastCacheTime = Date.now();
  }

  async loadTeamsOptimized() {
    // Return cached data if valid
    if (this.teamsCache && this.isCacheValid()) {
      this.teams = this.teamsCache;
      this.filteredTeams = this.teams.filter(team => team.league === this.selectedLeague);
      return;
    }

    this.loadingStandings = true;
    try {
      // OPTIMIZATION: Load teams and all games in parallel
      const [teamsSnapshot, gamesSnapshot] = await Promise.all([
        getDocs(collection(this.firestore, 'teams')),
        getDocs(collection(this.firestore, 'games'))
      ]);
      
      // Create a map of team stats from all games
      const teamStatsMap = new Map<string, {
        wins: number;
        losses: number;
        overtimeLosses: number;
        goalsFor: number;
        goalsAgainst: number;
        gamesPlayed: number;
      }>();
      
      // Initialize all teams with zero stats
      teamsSnapshot.docs.forEach(doc => {
        teamStatsMap.set(doc.id, {
          wins: 0,
          losses: 0,
          overtimeLosses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          gamesPlayed: 0
        });
      });
      
      // Process all games in a single pass
      gamesSnapshot.docs.forEach(gameDoc => {
        const gameData = gameDoc.data();
        const homeTeamId = gameData['homeTeamId'];
        const awayTeamId = gameData['awayTeamId'];
        const homeScore = gameData['homeScore'];
        const awayScore = gameData['awayScore'];
        const period = gameData['period'];
        
        // Only process games with scores
        if (homeScore !== undefined && awayScore !== undefined) {
          const homeStats = teamStatsMap.get(homeTeamId);
          const awayStats = teamStatsMap.get(awayTeamId);
          
          if (homeStats && awayStats) {
            // Update games played
            homeStats.gamesPlayed++;
            awayStats.gamesPlayed++;
            
            // Update goals
            homeStats.goalsFor += homeScore;
            homeStats.goalsAgainst += awayScore;
            awayStats.goalsFor += awayScore;
            awayStats.goalsAgainst += homeScore;
            
            // Determine winner and update records
            if (homeScore > awayScore) {
              homeStats.wins++;
              if (period === 'OT' || period === 'SO') {
                awayStats.overtimeLosses++;
              } else {
                awayStats.losses++;
              }
            } else if (awayScore > homeScore) {
              awayStats.wins++;
              if (period === 'OT' || period === 'SO') {
                homeStats.overtimeLosses++;
              } else {
                homeStats.losses++;
              }
            }
          }
        }
      });
      
      // Build teams array with calculated stats
      this.teams = teamsSnapshot.docs.map((teamDoc: any) => {
        const data = teamDoc.data();
        const stats = teamStatsMap.get(teamDoc.id) || {
          wins: 0, losses: 0, overtimeLosses: 0,
          goalsFor: 0, goalsAgainst: 0, gamesPlayed: 0
        };
        
        const points = (stats.wins * 2) + stats.overtimeLosses;
        const pointPercentage = stats.gamesPlayed > 0 ? points / (stats.gamesPlayed * 2) : 0;
        
        return {
          id: teamDoc.id,
          name: `${data['city']} ${data['mascot']}`,
          league: data['league'] || 'major',
          conference: data['conference'] || '',
          division: data['division'] || '',
          logoUrl: data['logoUrl'],
          wins: stats.wins,
          losses: stats.losses,
          overtimeLosses: stats.overtimeLosses,
          points,
          gamesPlayed: stats.gamesPlayed,
          goalsFor: stats.goalsFor,
          goalsAgainst: stats.goalsAgainst,
          goalDifferential: stats.goalsFor - stats.goalsAgainst,
          pointPercentage,
          playoffStatus: data['playoffStatus']
        };
      });
      
      // Cache the results
      this.teamsCache = this.teams;
      this.updateCacheTime();
      
      this.filteredTeams = this.teams.filter(team => team.league === this.selectedLeague);
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      this.loadingStandings = false;
    }
  }

  async onLeagueChange() {
    // Use cached data if available
    if (this.teamsCache) {
      this.teams = this.teamsCache;
    }
    this.filteredTeams = this.teams.filter(team => team.league === this.selectedLeague);
  }

  onStandingsViewChange() {
    // View type changed, no additional action needed
  }

  async refreshStandings() {
    // Force refresh by clearing cache
    this.teamsCache = null;
    this.lastCacheTime = 0;
    await this.loadTeamsOptimized();
  }

  clearCache() {
    this.teamsCache = null;
    this.playerStatsCache = null;
    this.gamesCache.clear();
    this.teamStatsCache.clear();
    this.lastCacheTime = 0;
    console.log('Cache cleared');
  }

  getStandingsForDivision(conference: string, division: string): Team[] {
    return this.filteredTeams
      .filter(team => team.conference === conference && team.division === division)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.pointPercentage !== a.pointPercentage) return b.pointPercentage - a.pointPercentage;
        return b.goalDifferential - a.goalDifferential;
      });
  }

  getStandingsForConference(conference: string): Team[] {
    return this.filteredTeams
      .filter(team => team.conference === conference)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.pointPercentage !== a.pointPercentage) return b.pointPercentage - a.pointPercentage;
        return b.goalDifferential - a.goalDifferential;
      });
  }

  getOverallStandings(): Team[] {
    return [...this.filteredTeams].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.pointPercentage !== a.pointPercentage) return b.pointPercentage - a.pointPercentage;
      return b.goalDifferential - a.goalDifferential;
    });
  }

  getTeamPlayoffStatus(teamId: string): string {
    const team = this.teams.find(t => t.id === teamId);
    return team?.playoffStatus || 'none';
  }

  async updateTeamPlayoffStatus(teamId: string, status: string) {
    try {
      const statusValue = status === 'none' ? null : status;
      await updateDoc(doc(this.firestore, 'teams', teamId), {
        playoffStatus: statusValue
      });
      
      // Update local data
      const team = this.teams.find(t => t.id === teamId);
      if (team) {
        team.playoffStatus = statusValue || undefined;
      }
    } catch (error) {
      console.error('Error updating playoff status:', error);
    }
  }

  getPlayoffStatusClass(team: Team): string {
    if (!team.playoffStatus) return '';
    
    switch (team.playoffStatus) {
      case 'league': return 'table-success';
      case 'conference': return 'table-info';
      case 'division': return 'table-warning';
      case 'playoff': return 'table-primary';
      case 'eliminated': return 'table-danger';
      default: return '';
    }
  }

  getPlayoffStatusBadge(team: Team): { text: string; class: string } | null {
    if (!team.playoffStatus) return null;
    
    switch (team.playoffStatus) {
      case 'league': return { text: 'P', class: 'badge bg-success' };
      case 'conference': return { text: 'z', class: 'badge bg-info' };
      case 'division': return { text: 'y', class: 'badge bg-warning' };
      case 'playoff': return { text: 'x', class: 'badge bg-primary' };
      case 'eliminated': return { text: 'e', class: 'badge bg-danger' };
      default: return null;
    }
  }

  // Lazy loading method for player stats tab
  async onPlayerStatsTabClick() {
    this.currentView = 'playerstats';
    if (!this.playerStatsCache || !this.isCacheValid()) {
      await this.loadPlayerStatsOptimized();
    }
  }

  async onTeamSelect() {
    // Use cached data if available
    const cacheKey = `team-analytics-${this.selectedTeamId}`;
    if (this.teamStatsCache.has(cacheKey) && this.isCacheValid()) {
      const cachedAnalytics = this.teamStatsCache.get(cacheKey);
      this.teamAnalytics = cachedAnalytics.teamAnalytics;
      this.selectedTeamName = cachedAnalytics.selectedTeamName;
      return;
    }

    if (!this.selectedTeamId) {
      this.resetAnalytics();
      return;
    }

    const team = this.teams.find(t => t.id === this.selectedTeamId);
    this.selectedTeamName = team?.name || '';

    console.log('🔍 Loading analytics for team:', this.selectedTeamName, 'ID:', this.selectedTeamId);

    try {
      await this.calculateTeamAnalytics();
      
      // Cache the calculated analytics
      this.teamStatsCache.set(cacheKey, {
        teamAnalytics: this.teamAnalytics,
        selectedTeamName: this.selectedTeamName
      });
      
      console.log('✅ Team analytics calculated:', this.teamAnalytics);
    } catch (error) {
      console.error('Error loading team analytics:', error);
    }
  }

  async calculateTeamAnalytics() {
    // Reset analytics
    this.resetAnalytics();
    
    console.log('📊 Calculating analytics for team ID:', this.selectedTeamId);
    
    try {
      // Load all games for this team from main games collection
      const allGamesQuery = query(
        collection(this.firestore, 'games'),
        where('homeTeamId', '==', this.selectedTeamId)
      );
      const awayGamesQuery = query(
        collection(this.firestore, 'games'),
        where('awayTeamId', '==', this.selectedTeamId)
      );
      
      const [homeGamesSnap, awayGamesSnap] = await Promise.all([
        getDocs(allGamesQuery),
        getDocs(awayGamesQuery)
      ]);
      
      console.log(`📈 Found ${homeGamesSnap.docs.length} home games and ${awayGamesSnap.docs.length} away games`);
      
      const allTeamGames: any[] = [
        ...homeGamesSnap.docs.map(doc => ({ 
          ...doc.data(), 
          isHome: true, 
          gameId: doc.id,
        })),
        ...awayGamesSnap.docs.map(doc => ({ 
          ...doc.data(), 
          isHome: false, 
          gameId: doc.id,
        }))
      ];
      
      // Sort games by date for streak calculation
      const sortedGames = allTeamGames
        .filter(game => game.homeScore !== undefined && game.awayScore !== undefined)
        .sort((a, b) => {
          const aDate = a.date?.toDate?.() || new Date(a.date);
          const bDate = b.date?.toDate?.() || new Date(b.date);
          return aDate.getTime() - bDate.getTime();
        });
      
      console.log(`🎯 Processing ${sortedGames.length} completed games`);
      
      this.teamAnalytics.totalGames = sortedGames.length;
      
      if (sortedGames.length === 0) return;
      
      // Process each game
      let currentStreakType = '';
      let currentStreakCount = 0;
      let tempWinStreak = 0;
      let tempLoseStreak = 0;
      let maxWinStreak = 0;
      let maxLoseStreak = 0;
      
      sortedGames.forEach((game, index) => {
        const isHome = game.isHome;
        const teamScore = isHome ? game.homeScore : game.awayScore;
        const opponentScore = isHome ? game.awayScore : game.homeScore;
        const teamStats = isHome ? game.homeStats : game.awayStats;
        const opponentStats = isHome ? game.awayStats : game.homeStats;
        const period = game.period;
        
        // Record tracking
        const isWin = teamScore > opponentScore;
        const isOTLoss = teamScore < opponentScore && (period === 'OT' || period === 'SO');
        
        if (isHome) {
          if (isWin) this.teamAnalytics.homeRecord.wins++;
          else if (isOTLoss) this.teamAnalytics.homeRecord.otl++;
          else this.teamAnalytics.homeRecord.losses++;
        } else {
          if (isWin) this.teamAnalytics.awayRecord.wins++;
          else if (isOTLoss) this.teamAnalytics.awayRecord.otl++;
          else this.teamAnalytics.awayRecord.losses++;
        }
        
        // Streak calculation
        if (isWin) {
          if (currentStreakType === 'W') {
            currentStreakCount++;
          } else {
            currentStreakType = 'W';
            currentStreakCount = 1;
          }
          tempWinStreak++;
          tempLoseStreak = 0;
        } else {
          if (currentStreakType === 'L') {
            currentStreakCount++;
          } else {
            currentStreakType = 'L';
            currentStreakCount = 1;
          }
          tempLoseStreak++;
          tempWinStreak = 0;
        }
        
        maxWinStreak = Math.max(maxWinStreak, tempWinStreak);
        maxLoseStreak = Math.max(maxLoseStreak, tempLoseStreak);
        
        // Offensive stats
        this.teamAnalytics.goals += teamScore;
        this.teamAnalytics.mostGoalsInGame = Math.max(this.teamAnalytics.mostGoalsInGame, teamScore);
        
        // Defensive stats
        this.teamAnalytics.goalsAgainst += opponentScore;
        this.teamAnalytics.mostGoalsAgainstInGame = Math.max(this.teamAnalytics.mostGoalsAgainstInGame, opponentScore);
        
        // Goal differential
        this.teamAnalytics.goalDifferential += (teamScore - opponentScore);
        
        // Team stats from game data
        if (teamStats) {
          this.teamAnalytics.shotAttempts += teamStats.totalShots || 0;
          this.teamAnalytics.shotsAgainst += opponentStats?.totalShots || 0;
          this.teamAnalytics.hits += teamStats.hits || 0;
          
          // Accumulate passing percentage for later averaging
          if (teamStats.passingPercentage !== undefined) {
            this.teamAnalytics.passingPercentage += teamStats.passingPercentage;
          }
          
          this.teamAnalytics.faceoffsWon += teamStats.faceoffsWon || 0;
          this.teamAnalytics.faceoffsTaken += (teamStats.faceoffsWon || 0) + (teamStats.faceoffsLost || 0);
          
          this.teamAnalytics.penaltyKills.total += teamStats.penaltyKills?.total || 0;
          this.teamAnalytics.penaltyKills.successful += teamStats.penaltyKills?.successful || 0;
          this.teamAnalytics.powerplayTimeOnIce += teamStats.powerplayMinutes || 0;
          
          // Time stats (convert to minutes)
          const timeOnAttack = teamStats.timeOnAttack || { minutes: 0, seconds: 0 };
          this.teamAnalytics.timeOnAttack += timeOnAttack.minutes + (timeOnAttack.seconds / 60);
          
          // Estimate time on defense (60 - time on attack - neutral time)
          const attackTime = timeOnAttack.minutes + (timeOnAttack.seconds / 60);
          this.teamAnalytics.timeOnDefense += Math.max(0, 60 - attackTime - 10); // Assume 10 min neutral
          
          this.teamAnalytics.fights += teamStats.fights || 0;
          
          // Calculate even strength goals (total goals minus powerplay and shorthanded)
          const ppGoals = teamStats.powerplayGoals || 0;
          const shGoals = teamStats.shorthandedGoals || 0;
          this.teamAnalytics.evenStrengthGoals += Math.max(0, teamScore - ppGoals - shGoals);
        }
      });
      
      // Set current streak
      this.teamAnalytics.currentStreak = {
        type: currentStreakType,
        count: currentStreakCount
      };
      
      this.teamAnalytics.longestWinStreak = maxWinStreak;
      this.teamAnalytics.longestLoseStreak = maxLoseStreak;
      
      // Calculate averages and percentages
      if (this.teamAnalytics.totalGames > 0) {
        this.teamAnalytics.avgGoalsPerGame = this.teamAnalytics.goals / this.teamAnalytics.totalGames;
        this.teamAnalytics.avgGoalsAgainstPerGame = this.teamAnalytics.goalsAgainst / this.teamAnalytics.totalGames;
        this.teamAnalytics.passingPercentage = this.teamAnalytics.passingPercentage / this.teamAnalytics.totalGames;
      }
      
      if (this.teamAnalytics.shotAttempts > 0) {
        this.teamAnalytics.shootingPercentage = (this.teamAnalytics.goals / this.teamAnalytics.shotAttempts) * 100;
      }
      
      if (this.teamAnalytics.shotsAgainst > 0) {
        this.teamAnalytics.goalsAgainstPercentage = (this.teamAnalytics.goalsAgainst / this.teamAnalytics.shotsAgainst) * 100;
      }
      
      if (this.teamAnalytics.faceoffsTaken > 0) {
        this.teamAnalytics.faceoffPercentage = (this.teamAnalytics.faceoffsWon / this.teamAnalytics.faceoffsTaken) * 100;
      }
      
      if (this.teamAnalytics.penaltyKills.total > 0) {
        this.teamAnalytics.penaltyKillPercentage = (this.teamAnalytics.penaltyKills.successful / this.teamAnalytics.penaltyKills.total) * 100;
      }
      
      if (this.teamAnalytics.goals > 0) {
        this.teamAnalytics.timeOnAttackPerGoal = this.teamAnalytics.timeOnAttack / this.teamAnalytics.goals;
      }
      
      if (this.teamAnalytics.goalsAgainst > 0) {
        this.teamAnalytics.timeOnDefensePerGoal = this.teamAnalytics.timeOnDefense / this.teamAnalytics.goalsAgainst;
      }
      
      console.log('📊 Final team analytics:', this.teamAnalytics);
    } catch (error) {
      console.error('Error calculating team analytics:', error);
    }
  }

  resetAnalytics() {
    this.teamAnalytics = {
      homeRecord: { wins: 0, losses: 0, otl: 0 },
      awayRecord: { wins: 0, losses: 0, otl: 0 },
      currentStreak: { type: '', count: 0 },
      longestWinStreak: 0,
      longestLoseStreak: 0,
      goals: 0,
      evenStrengthGoals: 0,
      mostGoalsInGame: 0,
      shotAttempts: 0,
      shootingPercentage: 0,
      avgGoalsPerGame: 0,
      goalsAgainst: 0,
      mostGoalsAgainstInGame: 0,
      shotsAgainst: 0,
      goalsAgainstPercentage: 0,
      avgGoalsAgainstPerGame: 0,
      goalDifferential: 0,
      hits: 0,
      passingPercentage: 0,
      faceoffsTaken: 0,
      faceoffsWon: 0,
      faceoffPercentage: 0,
      powerplayTimeOnIce: 0,
      penaltyKills: { successful: 0, total: 0 },
      penaltyKillPercentage: 0,
      timeOnAttack: 0,
      timeOnAttackPerGoal: 0,
      timeOnDefense: 0,
      timeOnDefensePerGoal: 0,
      fights: 0,
      totalGames: 0
    };
    this.selectedTeamName = '';
  }

  // Helper methods for formatting
  formatRecord(record: { wins: number; losses: number; otl: number }): string {
    return `${record.wins}-${record.losses}-${record.otl}`;
  }
  
  formatStreak(streak: { type: string; count: number }): string {
    if (!streak.type || streak.count === 0) return 'None';
    return `${streak.type}${streak.count}`;
  }
  
  formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  }
  
  formatDecimal(value: number, decimals: number = 1): string {
    return value.toFixed(decimals);
  }
  
  formatTime(minutes: number): string {
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  formatPenaltyKills(successful: number, total: number): string {
    return `${successful}/${total}`;
  }

  async onExportTeamSelect() {
    if (!this.selectedExportTeamId) {
      this.exportGames = [];
      this.selectedExportGameId = '';
      return;
    }

    try {
      // Load games for the selected team
      const homeGamesQuery = query(
        collection(this.firestore, 'games'),
        where('homeTeamId', '==', this.selectedExportTeamId)
      );
      const awayGamesQuery = query(
        collection(this.firestore, 'games'),
        where('awayTeamId', '==', this.selectedExportTeamId)
      );
      
      const [homeGamesSnap, awayGamesSnap] = await Promise.all([
        getDocs(homeGamesQuery),
        getDocs(awayGamesQuery)
      ]);
      
      const allGames: any[] = [
        ...homeGamesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...awayGamesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      ];
      
      // Sort by date
      this.exportGames = allGames
        .filter((game: any) => game['date']) // Only games with dates
        .sort((a, b) => {
          const aDate = (a as any)['date']?.toDate?.() || new Date((a as any)['date']);
          const bDate = (b as any)['date']?.toDate?.() || new Date((b as any)['date']);
          return bDate.getTime() - aDate.getTime();
        })
        .map((game: any) => ({
          id: game.id,
          teamId: this.selectedExportTeamId,
          opponent: game['opponent'] || 'Unknown',
          date: game['date'],
          players: [] // Will be populated when needed
        } as Game));
    } catch (error) {
      console.error('Error loading games for export:', error);
    }
  }

  async loadPlayerStatsOptimized() {
    // Return cached data if valid
    if (this.playerStatsCache && this.isCacheValid()) {
      this.playerStats = this.playerStatsCache;
      return;
    }

    this.loadingPlayerStats = true;
    try {
      console.log('🔄 Loading player stats from database...');
      
      // OPTIMIZATION: Load all data in parallel
      const [playersSnapshot, allTeamsSnapshot, allGamesSnapshot] = await Promise.all([
        getDocs(query(collection(this.firestore, 'players'), where('status', '==', 'active'))),
        getDocs(collection(this.firestore, 'teams')),
        getDocs(collection(this.firestore, 'games'))
      ]);
      
      // Build team lookup map
      const teamLookup = new Map();
      allTeamsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        teamLookup.set(doc.id, {
          name: `${data['city']} ${data['mascot']}`,
          logo: data['logoUrl'] || ''
        });
      });
      
      // Build comprehensive game stats map for all players
      const playerGameStatsMap = new Map<string, any>();
      
      allGamesSnapshot.docs.forEach(gameDoc => {
        const gameData = gameDoc.data();
        const homePlayerStats = gameData['homePlayerStats'] || {};
        const awayPlayerStats = gameData['awayPlayerStats'] || {};
        
        // Process home team player stats
        Object.entries(homePlayerStats).forEach(([playerId, stats]: [string, any]) => {
          if (!playerGameStatsMap.has(playerId)) {
            playerGameStatsMap.set(playerId, {
              games: 0, goals: 0, assists: 0, shots: 0, hits: 0, pim: 0,
              ppg: 0, shg: 0, plusMinus: 0, totalMinutes: 0, totalSeconds: 0,
              saves: 0, shotsAgainst: 0, shutouts: 0, goalsAgainst: 0, possessionTime: 0
            });
          }
          
          const playerTotals = playerGameStatsMap.get(playerId);
          playerTotals.games++;
          playerTotals.goals += stats.goals || 0;
          playerTotals.assists += stats.assists || 0;
          playerTotals.shots += stats.shots || 0;
          playerTotals.hits += stats.hits || 0;
          playerTotals.pim += stats.pim || 0;
          playerTotals.ppg += stats.ppg || 0;
          playerTotals.shg += stats.shg || 0;
          playerTotals.plusMinus += stats.plusMinus || 0;
          playerTotals.totalMinutes += stats.minutes || 0;
          playerTotals.totalSeconds += stats.seconds || 0;
          playerTotals.saves += stats.saves || 0;
          playerTotals.shotsAgainst += stats.shotsAgainst || 0;
          playerTotals.goalsAgainst += stats.goalsAgainst || 0;
          playerTotals.possessionTime += stats.possessionTime || 0;
          
          // Check for shutouts (goalies only)
          if (stats.position === 'G' && (stats.goalsAgainst || 0) === 0) {
            playerTotals.shutouts++;
          }
        });
        
        // Process away team player stats
        Object.entries(awayPlayerStats).forEach(([playerId, stats]: [string, any]) => {
          if (!playerGameStatsMap.has(playerId)) {
            playerGameStatsMap.set(playerId, {
              games: 0, goals: 0, assists: 0, shots: 0, hits: 0, pim: 0,
              ppg: 0, shg: 0, plusMinus: 0, totalMinutes: 0, totalSeconds: 0,
              saves: 0, shotsAgainst: 0, shutouts: 0, goalsAgainst: 0, possessionTime: 0
            });
          }
          
          const playerTotals = playerGameStatsMap.get(playerId);
          playerTotals.games++;
          playerTotals.goals += stats.goals || 0;
          playerTotals.assists += stats.assists || 0;
          playerTotals.shots += stats.shots || 0;
          playerTotals.hits += stats.hits || 0;
          playerTotals.pim += stats.pim || 0;
          playerTotals.ppg += stats.ppg || 0;
          playerTotals.shg += stats.shg || 0;
          playerTotals.plusMinus += stats.plusMinus || 0;
          playerTotals.totalMinutes += stats.minutes || 0;
          playerTotals.totalSeconds += stats.seconds || 0;
          playerTotals.saves += stats.saves || 0;
          playerTotals.shotsAgainst += stats.shotsAgainst || 0;
          playerTotals.goalsAgainst += stats.goalsAgainst || 0;
          playerTotals.possessionTime += stats.possessionTime || 0;
          
          // Check for shutouts (goalies only)
          if (stats.position === 'G' && (stats.goalsAgainst || 0) === 0) {
            playerTotals.shutouts++;
          }
        });
      });
      
      // Build player stats from the aggregated data
      this.playerStats = playersSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          return data['teamId'] && data['teamId'] !== 'none';
        })
        .map(playerDoc => {
          const playerData = playerDoc.data();
          const playerId = playerDoc.id;
          const gameStats = playerGameStatsMap.get(playerId) || {
            games: 0, goals: 0, assists: 0, shots: 0, hits: 0, pim: 0,
            ppg: 0, shg: 0, plusMinus: 0, totalMinutes: 0, totalSeconds: 0,
            saves: 0, shotsAgainst: 0, shutouts: 0, goalsAgainst: 0, possessionTime: 0
          };
          
          // Get team info
          const teamInfo = teamLookup.get(playerData['teamId']) || { name: 'Free Agent', logo: '' };
          
          // Calculate derived stats
          const points = gameStats.goals + gameStats.assists;
          const totalTimeInMinutes = gameStats.totalMinutes + (gameStats.totalSeconds / 60);
          const points60 = totalTimeInMinutes > 0 ? (points / totalTimeInMinutes) * 60 : 0;
          const savePercentage = gameStats.shotsAgainst > 0 ? (gameStats.saves / gameStats.shotsAgainst) * 100 : 0;
          const gaa = gameStats.games > 0 ? gameStats.goalsAgainst / gameStats.games : 0;
          
          return {
            id: playerId,
            name: `${playerData['firstName']} ${playerData['lastName']}`,
            position: playerData['position'],
            teamName: teamInfo.name,
            teamLogo: teamInfo.logo,
            rookie: playerData['rookie'] || false,
            age: playerData['age'] || 19,
            games: gameStats.games,
            goals: gameStats.goals,
            assists: gameStats.assists,
            points,
            shots: gameStats.shots,
            hits: gameStats.hits,
            pim: gameStats.pim,
            ppg: gameStats.ppg,
            shg: gameStats.shg,
            plusMinus: gameStats.plusMinus,
            saves: gameStats.saves,
            shotsAgainst: gameStats.shotsAgainst,
            shutouts: gameStats.shutouts,
            points60,
            savePercentage,
            gaa,
            timeOnIce: totalTimeInMinutes,
            possessionTime: gameStats.possessionTime
          };
        });
      
      // Cache player stats
      this.playerStatsCache = this.playerStats;
      this.updateCacheTime();
      
      console.log(`✅ Loaded stats for ${this.playerStats.length} players`);
    } catch (error) {
      console.error('Error loading player stats:', error);
    } finally {
      this.loadingPlayerStats = false;
    }
  }

  getFilteredPlayerStats(): any[] {
    let filtered = [...this.playerStats];
    
    // Filter by rookie status
    if (this.showRookieOnly) {
      filtered = filtered.filter(player => player.rookie);
    }
    
    // Sort by selected category
    switch (this.playerStatsView) {
      case 'goals':
        filtered = filtered.sort((a, b) => b.goals - a.goals);
        break;
      case 'assists':
        filtered = filtered.sort((a, b) => b.assists - a.assists);
        break;
      case 'points':
        filtered = filtered.sort((a, b) => b.points - a.points);
        break;
      case 'points60':
        filtered = filtered.sort((a, b) => b.points60 - a.points60);
        break;
      case 'toi':
        filtered = filtered.sort((a, b) => b.timeOnIce - a.timeOnIce);
        break;
      case 'shots':
        filtered = filtered.sort((a, b) => b.shots - a.shots);
        break;
      case 'ppg':
        filtered = filtered.sort((a, b) => b.ppg - a.ppg);
        break;
      case 'shg':
        filtered = filtered.sort((a, b) => b.shg - a.shg);
        break;
      case 'hits':
        filtered = filtered.sort((a, b) => b.hits - a.hits);
        break;
      case 'pim':
        filtered = filtered.sort((a, b) => b.pim - a.pim);
        break;
      case 'possession':
        filtered = filtered.sort((a, b) => b.possessionTime - a.possessionTime);
        break;
      case 'plusminus':
        filtered = filtered.sort((a, b) => b.plusMinus - a.plusMinus);
        break;
      case 'saves':
        filtered = filtered.filter(p => p.position === 'G').sort((a, b) => b.saves - a.saves);
        break;
      case 'savepct':
        filtered = filtered.filter(p => p.position === 'G').sort((a, b) => b.savePercentage - a.savePercentage);
        break;
      case 'shutouts':
        filtered = filtered.filter(p => p.position === 'G').sort((a, b) => b.shutouts - a.shutouts);
        break;
      case 'gaa':
        filtered = filtered.filter(p => p.position === 'G').sort((a, b) => a.gaa - b.gaa);
        break;
    }
    
    return filtered;
  }

  getPaginatedPlayerStats(): any[] {
    const filtered = this.getFilteredPlayerStats();
    const startIndex = this.playerStatsPage * this.playersPerPage;
    return filtered.slice(startIndex, startIndex + this.playersPerPage);
  }

  getTotalPlayerStatsPages(): number {
    return Math.ceil(this.getFilteredPlayerStats().length / this.playersPerPage);
  }

  nextPlayerStatsPage() {
    if (this.playerStatsPage < this.getTotalPlayerStatsPages() - 1) {
      this.playerStatsPage++;
    }
  }

  previousPlayerStatsPage() {
    if (this.playerStatsPage > 0) {
      this.playerStatsPage--;
    }
  }

  onPlayerStatsViewChange() {
    this.playerStatsPage = 0; // Reset to first page when changing category
  }

  onRookieFilterChange() {
    this.playerStatsPage = 0; // Reset to first page when changing filter
  }

  getStatValue(player: any, category: string): string {
    switch (category) {
      case 'goals':
        return player.goals.toString();
      case 'assists':
        return player.assists.toString();
      case 'points':
        return player.points.toString();
      case 'points60':
        return player.points60.toFixed(2);
      case 'toi':
        return player.timeOnIce.toFixed(1) + ' min';
      case 'shots':
        return player.shots.toString();
      case 'ppg':
        return player.ppg.toString();
      case 'shg':
        return player.shg.toString();
      case 'hits':
        return player.hits.toString();
      case 'pim':
        return player.pim.toString();
      case 'possession':
        return player.possessionTime.toFixed(1) + ' min';
      case 'plusminus':
        return (player.plusMinus >= 0 ? '+' : '') + player.plusMinus.toString();
      case 'saves':
        return player.saves.toString();
      case 'savepct':
        return player.savePercentage.toFixed(1) + '%';
      case 'shutouts':
        return player.shutouts.toString();
      case 'gaa':
        return player.gaa.toFixed(2);
      default:
        return '0';
    }
  }

  getCurrentCategoryLabel(): string {
    const category = this.playerStatsCategories.find(c => c.key === this.playerStatsView);
    return category?.label || 'Player Stats';
  }

  // Helper method for position colors
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
}