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
import { saveAs } from 'file-saver';
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
  currentView: 'standings' | 'analytics' | 'reports' = 'standings';
  
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

  async ngOnInit() {
    // Check permissions
    this.authService.effectiveRoles.subscribe(roles => {
      this.canManagePlayoffs = roles.some(role => 
        ['developer', 'commissioner'].includes(role)
      );
    });

    await this.loadTeams();
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
    saveAs(blob, fileName);
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
}