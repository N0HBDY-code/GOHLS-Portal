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
  currentView: 'standings' | 'playerstats' | 'analytics' | 'reports' = 'standings';
  
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
  totalGames = 0;
  totalPoints = 0;
  totalAssists = 0;
  totalRebounds = 0;
  avgPoints = '0.0';
  avgAssists = '0.0';
  avgRebounds = '0.0';

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

    await this.loadTeams();
    await this.loadPlayerStats();
  }

  async loadTeams() {
    this.loadingStandings = true;
    try {
      const teamsRef = collection(this.firestore, 'teams');
      const snapshot = await getDocs(teamsRef);
      
      this.teams = await Promise.all(snapshot.docs.map(async (teamDoc) => {
        const data = teamDoc.data();
        
        // Calculate team stats from games
        const gamesRef = collection(this.firestore, 'games');
        const homeGamesQuery = query(gamesRef, where('homeTeamId', '==', teamDoc.id));
        const awayGamesQuery = query(gamesRef, where('awayTeamId', '==', teamDoc.id));
        
        const [homeGamesSnap, awayGamesSnap] = await Promise.all([
          getDocs(homeGamesQuery),
          getDocs(awayGamesQuery)
        ]);
        
        let wins = 0;
        let losses = 0;
        let overtimeLosses = 0;
        let goalsFor = 0;
        let goalsAgainst = 0;
        let gamesPlayed = 0;
        
        // Process home games
        homeGamesSnap.docs.forEach(gameDoc => {
          const gameData = gameDoc.data();
          if (gameData['homeScore'] !== undefined && gameData['awayScore'] !== undefined) {
            gamesPlayed++;
            const homeScore = gameData['homeScore'] || 0;
            const awayScore = gameData['awayScore'] || 0;
            
            goalsFor += homeScore;
            goalsAgainst += awayScore;
            
            if (homeScore > awayScore) {
              wins++;
            } else if (gameData['period'] === 'OT' || gameData['period'] === 'SO') {
              overtimeLosses++;
            } else {
              losses++;
            }
          }
        });
        
        // Process away games
        awayGamesSnap.docs.forEach(gameDoc => {
          const gameData = gameDoc.data();
          if (gameData['homeScore'] !== undefined && gameData['awayScore'] !== undefined) {
            gamesPlayed++;
            const homeScore = gameData['homeScore'] || 0;
            const awayScore = gameData['awayScore'] || 0;
            
            goalsFor += awayScore;
            goalsAgainst += homeScore;
            
            if (awayScore > homeScore) {
              wins++;
            } else if (gameData['period'] === 'OT' || gameData['period'] === 'SO') {
              overtimeLosses++;
            } else {
              losses++;
            }
          }
        });
        
        const points = (wins * 2) + overtimeLosses;
        const pointPercentage = gamesPlayed > 0 ? points / (gamesPlayed * 2) : 0;
        
        return {
          id: teamDoc.id,
          name: `${data['city']} ${data['mascot']}`,
          league: data['league'] || 'major',
          conference: data['conference'] || '',
          division: data['division'] || '',
          logoUrl: data['logoUrl'],
          wins,
          losses,
          overtimeLosses,
          points,
          gamesPlayed,
          goalsFor,
          goalsAgainst,
          goalDifferential: goalsFor - goalsAgainst,
          pointPercentage,
          playoffStatus: data['playoffStatus']
        };
      }));
      
      this.filteredTeams = this.teams.filter(team => team.league === this.selectedLeague);
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      this.loadingStandings = false;
    }
  }

  async onLeagueChange() {
    this.filteredTeams = this.teams.filter(team => team.league === this.selectedLeague);
  }

  onStandingsViewChange() {
    // View type changed, no additional action needed
  }

  async refreshStandings() {
    await this.loadTeams();
  }

  clearCache() {
    // Clear any cached data if needed
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

  async onTeamSelect() {
    if (!this.selectedTeamId) {
      this.resetAnalytics();
      return;
    }

    const team = this.teams.find(t => t.id === this.selectedTeamId);
    this.selectedTeamName = team?.name || '';

    try {
      const gamesQuery = query(
        collection(this.firestore, 'games'),
        where('teamId', '==', this.selectedTeamId)
      );
      
      const snapshot = await getDocs(gamesQuery);
      const games = snapshot.docs.map(doc => doc.data() as Game);
      
      this.calculateAnalytics(games);
    } catch (error) {
      console.error('Error loading team analytics:', error);
    }
  }

  calculateAnalytics(games: Game[]) {
    this.totalGames = games.length;
    
    let totalPoints = 0;
    let totalAssists = 0;
    let totalRebounds = 0;
    
    games.forEach(game => {
      game.players.forEach(player => {
        totalPoints += player.points;
        totalAssists += player.assists;
        totalRebounds += player.rebounds;
      });
    });
    
    this.totalPoints = totalPoints;
    this.totalAssists = totalAssists;
    this.totalRebounds = totalRebounds;
    
    this.avgPoints = this.totalGames > 0 ? (totalPoints / this.totalGames).toFixed(1) : '0.0';
    this.avgAssists = this.totalGames > 0 ? (totalAssists / this.totalGames).toFixed(1) : '0.0';
    this.avgRebounds = this.totalGames > 0 ? (totalRebounds / this.totalGames).toFixed(1) : '0.0';
  }

  resetAnalytics() {
    this.totalGames = 0;
    this.totalPoints = 0;
    this.totalAssists = 0;
    this.totalRebounds = 0;
    this.avgPoints = '0.0';
    this.avgAssists = '0.0';
    this.avgRebounds = '0.0';
    this.selectedTeamName = '';
  }

  async onExportTeamSelect() {
    if (!this.selectedExportTeamId) {
      this.exportGames = [];
      this.selectedExportGameId = '';
      return;
    }

    try {
      const gamesQuery = query(
        collection(this.firestore, 'games'),
        where('teamId', '==', this.selectedExportTeamId),
        orderBy('date', 'desc')
      );
      
      const snapshot = await getDocs(gamesQuery);
      this.exportGames = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Game));
    } catch (error) {
      console.error('Error loading games for export:', error);
    }
  }

  exportSelectedGameToCSV() {
    if (!this.selectedExportGameId) return;
    
    const game = this.exportGames.find(g => g.id === this.selectedExportGameId);
    if (!game) return;
    
    const csvContent = this.generateCSV(game);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `game-${game.id}-${game.date?.toDate?.() ? game.date.toDate().toISOString().split('T')[0] : 'unknown'}.csv`;
    this.downloadCSV(csvContent, fileName);
  }

  private generateCSV(game: Game): string {
    const headers = ['Player Name', 'Points', 'Assists', 'Rebounds'];
    const rows = game.players.map(player => [
      player.name,
      player.points.toString(),
      player.assists.toString(),
      player.rebounds.toString()
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    return csvContent;
  }

  async loadPlayerStats() {
    this.loadingPlayerStats = true;
    try {
      // Load all active players with their game stats
      const playersRef = collection(this.firestore, 'players');
      const playersQuery = query(
        playersRef,
        where('status', '==', 'active'),
        where('teamId', '!=', 'none')
      );
      const playersSnap = await getDocs(playersQuery);
      
      // Calculate stats for each player
      const playerStatsPromises = playersSnap.docs.map(async (playerDoc) => {
        const playerData = playerDoc.data();
        const playerId = playerDoc.id;
        
        // Get team info
        let teamName = 'Free Agent';
        let teamLogo = '';
        if (playerData['teamId'] && playerData['teamId'] !== 'none') {
          const team = this.teams.find(t => t.id === playerData['teamId']);
          if (team) {
            teamName = team.name;
            teamLogo = team.logoUrl || '';
          }
        }
        
        // Initialize stats
        let totalStats = {
          games: 0,
          goals: 0,
          assists: 0,
          points: 0,
          shots: 0,
          hits: 0,
          pim: 0,
          ppg: 0,
          shg: 0,
          plusMinus: 0,
          totalMinutes: 0,
          totalSeconds: 0,
          saves: 0,
          shotsAgainst: 0,
          shutouts: 0,
          goalsAgainst: 0,
          possessionTime: 0
        };
        
        // Load game stats from all teams (in case player was traded)
        const allTeamsSnap = await getDocs(collection(this.firestore, 'teams'));
        
        for (const teamDoc of allTeamsSnap.docs) {
          const gamesRef = collection(this.firestore, `teams/${teamDoc.id}/games`);
          const gamesSnap = await getDocs(gamesRef);
          
          for (const gameDoc of gamesSnap.docs) {
            const gameData = gameDoc.data();
            
            // Check if player has stats in this game
            const homePlayerStats = gameData['homePlayerStats']?.[playerId];
            const awayPlayerStats = gameData['awayPlayerStats']?.[playerId];
            const playerGameStats = homePlayerStats || awayPlayerStats;
            
            if (playerGameStats) {
              totalStats.games++;
              totalStats.goals += playerGameStats.goals || 0;
              totalStats.assists += playerGameStats.assists || 0;
              totalStats.shots += playerGameStats.shots || 0;
              totalStats.hits += playerGameStats.hits || 0;
              totalStats.pim += playerGameStats.pim || 0;
              totalStats.ppg += playerGameStats.ppg || 0;
              totalStats.shg += playerGameStats.shg || 0;
              totalStats.plusMinus += playerGameStats.plusMinus || 0;
              totalStats.totalMinutes += playerGameStats.minutes || 0;
              totalStats.totalSeconds += playerGameStats.seconds || 0;
              totalStats.saves += playerGameStats.saves || 0;
              totalStats.shotsAgainst += playerGameStats.shotsAgainst || 0;
              totalStats.goalsAgainst += playerGameStats.goalsAgainst || 0;
              totalStats.possessionTime += playerGameStats.possessionTime || 0;
              
              // Check for shutouts (goalies only)
              if (playerData['position'] === 'G' && (playerGameStats.goalsAgainst || 0) === 0) {
                totalStats.shutouts++;
              }
            }
          }
        }
        
        // Calculate derived stats
        totalStats.points = totalStats.goals + totalStats.assists;
        const totalTimeInMinutes = totalStats.totalMinutes + (totalStats.totalSeconds / 60);
        const points60 = totalTimeInMinutes > 0 ? (totalStats.points / totalTimeInMinutes) * 60 : 0;
        const savePercentage = totalStats.shotsAgainst > 0 ? (totalStats.saves / totalStats.shotsAgainst) * 100 : 0;
        const gaa = totalStats.games > 0 ? totalStats.goalsAgainst / totalStats.games : 0;
        
        return {
          id: playerId,
          name: `${playerData['firstName']} ${playerData['lastName']}`,
          position: playerData['position'],
          teamName,
          teamLogo,
          rookie: playerData['rookie'] || false,
          age: playerData['age'] || 19,
          ...totalStats,
          points60,
          savePercentage,
          gaa,
          timeOnIce: totalTimeInMinutes
        };
      });
      
      this.playerStats = await Promise.all(playerStatsPromises);
    } catch (error) {
      console.error('Error loading player stats:', error);
    } finally {
      this.loadingPlayerStats = false;
    }
  }

  getFilteredPlayerStats(): any[] {
    let filtered = this.showRookieOnly 
      ? this.playerStats.filter(p => p.rookie) 
      : this.playerStats;
    
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

  private downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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