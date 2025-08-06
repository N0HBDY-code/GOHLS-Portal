import { Component, OnInit, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  getDocs,
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
  template: `
    <div class="analytics-container">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Analytics & Standings</h2>
        <div class="btn-group" role="group">
          <button 
            type="button" 
            class="btn"
            [class.btn-primary]="currentView === 'standings'"
            [class.btn-outline-primary]="currentView !== 'standings'"
            (click)="currentView = 'standings'">
            Standings
          </button>
          <button 
            type="button" 
            class="btn"
            [class.btn-primary]="currentView === 'analytics'"
            [class.btn-outline-primary]="currentView !== 'analytics'"
            (click)="currentView = 'analytics'">
            Analytics
          </button>
          <button 
            type="button" 
            class="btn"
            [class.btn-primary]="currentView === 'reports'"
            [class.btn-outline-primary]="currentView !== 'reports'"
            (click)="currentView = 'reports'">
            Reports
          </button>
        </div>
      </div>

      <!-- Standings View -->
      <div *ngIf="currentView === 'standings'" class="standings-section">
        <div class="row mb-3">
          <div class="col-md-4">
            <label for="leagueSelect" class="form-label">League</label>
            <select 
              id="leagueSelect"
              class="form-select" 
              [(ngModel)]="selectedLeague" 
              (change)="onLeagueChange()">
              <option value="major">Major League</option>
              <option value="minor">Minor League</option>
            </select>
          </div>
          <div class="col-md-4">
            <label for="viewTypeSelect" class="form-label">View</label>
            <select 
              id="viewTypeSelect"
              class="form-select" 
              [(ngModel)]="standingsViewType" 
              (change)="onStandingsViewChange()">
              <option value="division">By Division</option>
              <option value="conference">By Conference</option>
              <option value="overall">Overall</option>
            </select>
          </div>
          <div class="col-md-4 d-flex align-items-end">
            <button class="btn btn-outline-secondary me-2" (click)="refreshStandings()" [disabled]="loadingStandings">
              <span *ngIf="loadingStandings" class="spinner-border spinner-border-sm me-1"></span>
              Refresh
            </button>
            <button *ngIf="canManagePlayoffs" class="btn btn-outline-primary" (click)="showPlayoffManager = !showPlayoffManager">
              Manage Playoffs
            </button>
          </div>
        </div>

        <!-- Playoff Manager -->
        <div *ngIf="showPlayoffManager && canManagePlayoffs" class="card mb-4">
          <div class="card-header">
            <h5>Playoff Status Manager</h5>
          </div>
          <div class="card-body">
            <div class="row">
              <div class="col-md-6" *ngFor="let team of filteredTeams">
                <div class="mb-2">
                  <label class="form-label">{{ team.name }}</label>
                  <select 
                    class="form-select form-select-sm" 
                    [value]="getTeamPlayoffStatus(team.id)"
                      (change)="updateTeamPlayoffStatus(team.id, ($event.target as HTMLSelectElement).value)">
                    <option value="none">No Status</option>
                    <option value="league">League Champion (P)</option>
                    <option value="conference">Conference Champion (z)</option>
                    <option value="division">Division Champion (y)</option>
                    <option value="playoff">Playoff Bound (x)</option>
                    <option value="eliminated">Eliminated (e)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Loading Indicator -->
        <div *ngIf="loadingStandings" class="text-center py-4">
          <div class="spinner-border" role="status">
            <span class="visually-hidden">Loading standings...</span>
          </div>
        </div>

        <!-- Division View -->
        <div *ngIf="standingsViewType === 'division' && !loadingStandings">
          <div *ngFor="let conference of conferences" class="mb-4">
            <h3>{{ conference.name }}</h3>
            <div class="row">
              <div *ngFor="let division of conference.divisions" class="col-lg-4 mb-3">
                <div class="card">
                  <div class="card-header">
                    <h5 class="mb-0">{{ division }}</h5>
                  </div>
                  <div class="table-responsive">
                    <table class="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>GP</th>
                          <th>W</th>
                          <th>L</th>
                          <th>OTL</th>
                          <th>PTS</th>
                          <th>GF</th>
                          <th>GA</th>
                          <th>DIFF</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let team of getStandingsForDivision(conference.name, division)" 
                            [class]="getPlayoffStatusClass(team)">
                          <td>
                            <div class="d-flex align-items-center">
                              <img *ngIf="team.logoUrl" [src]="team.logoUrl" class="team-logo me-2" alt="{{ team.name }}">
                              <span>{{ team.name }}</span>
                              <span *ngIf="getPlayoffStatusBadge(team)" [class]="getPlayoffStatusBadge(team)!.class" class="ms-1">
                                {{ getPlayoffStatusBadge(team)!.text }}
                              </span>
                            </div>
                          </td>
                          <td>{{ team.gamesPlayed }}</td>
                          <td>{{ team.wins }}</td>
                          <td>{{ team.losses }}</td>
                          <td>{{ team.overtimeLosses }}</td>
                          <td><strong>{{ team.points }}</strong></td>
                          <td>{{ team.goalsFor }}</td>
                          <td>{{ team.goalsAgainst }}</td>
                          <td [class.text-success]="team.goalDifferential > 0" [class.text-danger]="team.goalDifferential < 0">
                            {{ team.goalDifferential > 0 ? '+' : '' }}{{ team.goalDifferential }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Conference View -->
        <div *ngIf="standingsViewType === 'conference' && !loadingStandings">
          <div *ngFor="let conference of conferences" class="mb-4">
            <div class="card">
              <div class="card-header">
                <h4 class="mb-0">{{ conference.name }}</h4>
              </div>
              <div class="table-responsive">
                <table class="table table-striped mb-0">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Team</th>
                      <th>GP</th>
                      <th>W</th>
                      <th>L</th>
                      <th>OTL</th>
                      <th>PTS</th>
                      <th>P%</th>
                      <th>GF</th>
                      <th>GA</th>
                      <th>DIFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let team of getStandingsForConference(conference.name); let i = index" 
                        [class]="getPlayoffStatusClass(team)">
                      <td>{{ i + 1 }}</td>
                      <td>
                        <div class="d-flex align-items-center">
                          <img *ngIf="team.logoUrl" [src]="team.logoUrl" class="team-logo me-2" alt="{{ team.name }}">
                          <span>{{ team.name }}</span>
                          <span *ngIf="getPlayoffStatusBadge(team)" [class]="getPlayoffStatusBadge(team)!.class" class="ms-1">
                            {{ getPlayoffStatusBadge(team)!.text }}
                          </span>
                        </div>
                      </td>
                      <td>{{ team.gamesPlayed }}</td>
                      <td>{{ team.wins }}</td>
                      <td>{{ team.losses }}</td>
                      <td>{{ team.overtimeLosses }}</td>
                      <td><strong>{{ team.points }}</strong></td>
                      <td>{{ (team.pointPercentage * 100).toFixed(1) }}%</td>
                      <td>{{ team.goalsFor }}</td>
                      <td>{{ team.goalsAgainst }}</td>
                      <td [class.text-success]="team.goalDifferential > 0" [class.text-danger]="team.goalDifferential < 0">
                        {{ team.goalDifferential > 0 ? '+' : '' }}{{ team.goalDifferential }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Overall View -->
        <div *ngIf="standingsViewType === 'overall' && !loadingStandings">
          <div class="card">
            <div class="card-header">
              <h4 class="mb-0">{{ selectedLeague === 'major' ? 'Major' : 'Minor' }} League Standings</h4>
            </div>
            <div class="table-responsive">
              <table class="table table-striped mb-0">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>GP</th>
                    <th>W</th>
                    <th>L</th>
                    <th>OTL</th>
                    <th>PTS</th>
                    <th>P%</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>DIFF</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let team of getOverallStandings(); let i = index" 
                      [class]="getPlayoffStatusClass(team)">
                    <td>{{ i + 1 }}</td>
                    <td>
                      <div class="d-flex align-items-center">
                        <img *ngIf="team.logoUrl" [src]="team.logoUrl" class="team-logo me-2" alt="{{ team.name }}">
                        <span>{{ team.name }}</span>
                        <span *ngIf="getPlayoffStatusBadge(team)" [class]="getPlayoffStatusBadge(team)!.class" class="ms-1">
                          {{ getPlayoffStatusBadge(team)!.text }}
                        </span>
                      </div>
                    </td>
                    <td>{{ team.gamesPlayed }}</td>
                    <td>{{ team.wins }}</td>
                    <td>{{ team.losses }}</td>
                    <td>{{ team.overtimeLosses }}</td>
                    <td><strong>{{ team.points }}</strong></td>
                    <td>{{ (team.pointPercentage * 100).toFixed(1) }}%</td>
                    <td>{{ team.goalsFor }}</td>
                    <td>{{ team.goalsAgainst }}</td>
                    <td [class.text-success]="team.goalDifferential > 0" [class.text-danger]="team.goalDifferential < 0">
                      {{ team.goalDifferential > 0 ? '+' : '' }}{{ team.goalDifferential }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Analytics View -->
      <div *ngIf="currentView === 'analytics'" class="analytics-section">
        <div class="row mb-4">
          <div class="col-md-6">
            <label for="teamSelect" class="form-label">Select Team</label>
            <select id="teamSelect" class="form-select" [(ngModel)]="selectedTeamId" (change)="onTeamSelect()">
              <option value="">Choose a team...</option>
              <option *ngFor="let team of teams" [value]="team.id">{{ team.name }}</option>
            </select>
          </div>
        </div>

        <div *ngIf="selectedTeamId" class="row">
          <div class="col-md-3">
            <div class="card text-center">
              <div class="card-body">
                <h5 class="card-title">Total Games</h5>
                <h2 class="text-primary">{{ totalGames }}</h2>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center">
              <div class="card-body">
                <h5 class="card-title">Total Points</h5>
                <h2 class="text-success">{{ totalPoints }}</h2>
                <small class="text-muted">Avg: {{ avgPoints }}</small>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center">
              <div class="card-body">
                <h5 class="card-title">Total Assists</h5>
                <h2 class="text-info">{{ totalAssists }}</h2>
                <small class="text-muted">Avg: {{ avgAssists }}</small>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card text-center">
              <div class="card-body">
                <h5 class="card-title">Total Rebounds</h5>
                <h2 class="text-warning">{{ totalRebounds }}</h2>
                <small class="text-muted">Avg: {{ avgRebounds }}</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Reports View -->
      <div *ngIf="currentView === 'reports'" class="reports-section">
        <div class="card">
          <div class="card-header">
            <h5>Export Game Data</h5>
          </div>
          <div class="card-body">
            <div class="row mb-3">
              <div class="col-md-6">
                <label for="exportTeamSelect" class="form-label">Select Team</label>
                <select id="exportTeamSelect" class="form-select" [(ngModel)]="selectedExportTeamId" (change)="onExportTeamSelect()">
                  <option value="">Choose a team...</option>
                  <option *ngFor="let team of teams" [value]="team.id">{{ team.name }}</option>
                </select>
              </div>
              <div class="col-md-6">
                <label for="exportGameSelect" class="form-label">Select Game</label>
                <select id="exportGameSelect" class="form-select" [(ngModel)]="selectedExportGameId" [disabled]="!selectedExportTeamId">
                  <option value="">Choose a game...</option>
                  <option *ngFor="let game of exportGames" [value]="game.id">
                    {{ game.date?.toDate?.() ? (game.date.toDate() | date:'short') : game.date }} vs {{ game.opponent }}
                  </option>
                </select>
              </div>
            </div>
            <button 
              class="btn btn-primary" 
              (click)="exportSelectedGameToCSV()" 
              [disabled]="!selectedExportTeamId || !selectedExportGameId">
              Export to CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .analytics-container {
      padding: 20px;
    }
    
    .team-logo {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }
    
    .table th {
      font-size: 0.875rem;
      font-weight: 600;
    }
    
    .table td {
      font-size: 0.875rem;
    }
    
    .card-header h4,
    .card-header h5 {
      margin-bottom: 0;
    }
    
    .badge {
      font-size: 0.75rem;
    }
    
    .btn-group .btn {
      border-radius: 0;
    }
    
    .btn-group .btn:first-child {
      border-top-left-radius: 0.375rem;
      border-bottom-left-radius: 0.375rem;
    }
    
    .btn-group .btn:last-child {
      border-top-right-radius: 0.375rem;
      border-bottom-right-radius: 0.375rem;
    }
  `]
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
      name: 'Eastern Conference',
      divisions: ['Atlantic', 'Metropolitan']
    },
    {
      name: 'Western Conference', 
      divisions: ['Central', 'Pacific']
    }
  ];

  // Analytics properties
  selectedTeamId = '';
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
    await this.loadTeams();
    await this.checkAdminStatus();
  }

  async checkAdminStatus() {
    const user = this.authService.getCurrentUser;
    if (user) {
      // Subscribe to current user and check admin status
      this.authService.currentUser.subscribe(async (currentUser) => {
        if (currentUser) {
          const userDoc = await getDoc(doc(this.firestore, 'users', currentUser.uid));
          this.canManagePlayoffs = userDoc.data()?.['role'] === 'admin';
        }
      });
    }
  }

  async loadTeams() {
    this.loadingStandings = true;
    try {
      const teamsQuery = query(
        collection(this.firestore, 'teams'),
        where('league', '==', this.selectedLeague),
        orderBy('points', 'desc')
      );
      
      const snapshot = await getDocs(teamsQuery);
      this.teams = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Team));
      
      this.filteredTeams = [...this.teams];
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      this.loadingStandings = false;
    }
  }

  async onLeagueChange() {
    await this.loadTeams();
  }

  onStandingsViewChange() {
    // View type changed, no additional action needed
  }

  async refreshStandings() {
    await this.loadTeams();
  }

  getStandingsForDivision(conference: string, division: string): Team[] {
    return this.teams
      .filter(team => team.conference === conference && team.division === division)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.pointPercentage !== a.pointPercentage) return b.pointPercentage - a.pointPercentage;
        return b.goalDifferential - a.goalDifferential;
      });
  }

  getStandingsForConference(conference: string): Team[] {
    return this.teams
      .filter(team => team.conference === conference)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.pointPercentage !== a.pointPercentage) return b.pointPercentage - a.pointPercentage;
        return b.goalDifferential - a.goalDifferential;
      });
  }

  getOverallStandings(): Team[] {
    return [...this.teams].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.pointPercentage !== a.pointPercentage) return b.pointPercentage - a.pointPercentage;
      return b.goalDifferential - a.goalDifferential;
    });
  }

  getTeamPlayoffStatus(teamId: string): string {
    const team = this.teams.find(t => t.id === teamId);
    return team?.playoffStatus || 'none';
  }

  async updateTeamPlayoffStatus(teamId: string, event: Event) {
    const target = event.target as HTMLSelectElement;
    if (!target) return;
    const status = target.value;
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