import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Firestore, doc, getDoc, updateDoc, collection, getDocs } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auths } from '../auth-service/auth-service';

type GamePeriod = '1st' | '2nd' | '3rd' | 'OT' | 'Final';

interface GameStats {
  totalShots: number;
  hits: number;
  timeOnAttack: { minutes: number; seconds: number };
  passingPercentage: number;
  faceoffsWon: number;
  penaltyMinutes: number;
  powerplays: { successful: number; total: number };
  powerplayMinutes: number;
  shorthandedGoals: number;
}

interface PlayerStats {
  id: string;
  number: number;
  name: string;
  position: string;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  shots: number;
  shotPercentage: number;
  pim: number;
  hits: number;
  ppg: number;
  shg: number;
  fot: number;
  fow: number;
  foPercentage: number;
  minutes: number;
  seconds: number;
}

interface RosterData {
  ['jerseyNumber']: number;
  ['firstName']: string;
  ['lastName']: string;
  ['position']: string;
}

@Component({
  selector: 'app-game-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-detail.html',
  styleUrls: ['./game-detail.css']
})
export class GameDetail implements OnInit {
  gameId: string;
  teamId: string;
  game: any;
  loading = true;
  awayTeamLogo: string = '';
  awayTeamName: string = '';
  homeTeamLogo: string = '';
  homeTeamName: string = '';
  awayScore: number = 0;
  homeScore: number = 0;
  canEditScores = false;
  isEditing = false;
  currentPeriod: GamePeriod = '1st';
  periods: GamePeriod[] = ['1st', '2nd', '3rd', 'OT', 'Final'];
  selectedTeamView: 'home' | 'away' = 'home';

  homeStats: GameStats = {
    totalShots: 0,
    hits: 0,
    timeOnAttack: { minutes: 0, seconds: 0 },
    passingPercentage: 0,
    faceoffsWon: 0,
    penaltyMinutes: 0,
    powerplays: { successful: 0, total: 0 },
    powerplayMinutes: 0,
    shorthandedGoals: 0
  };

  awayStats: GameStats = {
    totalShots: 0,
    hits: 0,
    timeOnAttack: { minutes: 0, seconds: 0 },
    passingPercentage: 0,
    faceoffsWon: 0,
    penaltyMinutes: 0,
    powerplays: { successful: 0, total: 0 },
    powerplayMinutes: 0,
    shorthandedGoals: 0
  };

  homePlayerStats: PlayerStats[] = [];
  awayPlayerStats: PlayerStats[] = [];

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private authService: Auths
  ) {
    this.gameId = this.route.snapshot.paramMap.get('gameId') || '';
    this.teamId = this.route.snapshot.paramMap.get('teamId') || '';
  }

  async ngOnInit() {
    this.authService.effectiveRoles.subscribe(roles => {
      this.canEditScores = roles.some(role => 
        ['developer', 'commissioner', 'stats monkey', 'gm'].includes(role)
      );
    });

    await this.loadGameData();
  }

  async loadGameData() {
    if (this.gameId && this.teamId) {
      const gameRef = doc(this.firestore, `teams/${this.teamId}/games/${this.gameId}`);
      const gameSnap = await getDoc(gameRef);
      
      if (gameSnap.exists()) {
        this.game = { id: gameSnap.id, ...gameSnap.data() };
        
        this.awayScore = this.game.awayScore || 0;
        this.homeScore = this.game.homeScore || 0;
        this.currentPeriod = this.game.period || '1st';
        
        if (this.game.homeStats) {
          this.homeStats = { ...this.homeStats, ...this.game.homeStats };
        }
        if (this.game.awayStats) {
          this.awayStats = { ...this.awayStats, ...this.game.awayStats };
        }
        
        // Load team data
        const homeTeamRef = doc(this.firestore, `teams/${this.game.homeTeamId}`);
        const homeTeamSnap = await getDoc(homeTeamRef);
        if (homeTeamSnap.exists()) {
          const homeTeamData = homeTeamSnap.data();
          this.homeTeamLogo = homeTeamData['logoUrl'] || '';
          this.homeTeamName = homeTeamData['mascot'] || '';
        }

        const awayTeamRef = doc(this.firestore, `teams/${this.game.awayTeamId}`);
        const awayTeamSnap = await getDoc(awayTeamRef);
        if (awayTeamSnap.exists()) {
          const awayTeamData = awayTeamSnap.data();
          this.awayTeamLogo = awayTeamData['logoUrl'] || '';
          this.awayTeamName = awayTeamData['mascot'] || '';
        }

        // Load player stats
        await this.loadPlayerStats();
      }
    }
    this.loading = false;
  }

  async loadPlayerStats() {
    // Load home team roster
    const homeRosterRef = collection(this.firestore, `teams/${this.game.homeTeamId}/roster`);
    const homeRosterSnap = await getDocs(homeRosterRef);
    
    this.homePlayerStats = homeRosterSnap.docs.map(doc => {
      const data = doc.data() as RosterData;
      const gameStats = this.game.homePlayerStats?.[doc.id] || {};
      const fow = gameStats.fow || 0;
      const fot = gameStats.fot || 0;
      
      return {
        id: doc.id,
        number: data['jerseyNumber'] || 0,
        name: `${data['firstName']} ${data['lastName']}`,
        position: data['position'] || '',
        goals: gameStats.goals || 0,
        assists: gameStats.assists || 0,
        points: (gameStats.goals || 0) + (gameStats.assists || 0),
        plusMinus: gameStats.plusMinus || 0,
        shots: gameStats.shots || 0,
        shotPercentage: gameStats.shots ? ((gameStats.goals || 0) / gameStats.shots) * 100 : 0,
        pim: gameStats.pim || 0,
        hits: gameStats.hits || 0,
        ppg: gameStats.ppg || 0,
        shg: gameStats.shg || 0,
        fot: fot,
        fow: fow,
        foPercentage: fot > 0 ? (fow / fot) * 100 : 0
      };
    }).sort((a, b) => a.number - b.number);

    // Load away team roster
    const awayRosterRef = collection(this.firestore, `teams/${this.game.awayTeamId}/roster`);
    const awayRosterSnap = await getDocs(awayRosterRef);
    
    this.awayPlayerStats = awayRosterSnap.docs.map(doc => {
      const data = doc.data() as RosterData;
      const gameStats = this.game.awayPlayerStats?.[doc.id] || {};
      const fow = gameStats.fow || 0;
      const fot = gameStats.fot || 0;
      
      return {
        id: doc.id,
        number: data['jerseyNumber'] || 0,
        name: `${data['firstName']} ${data['lastName']}`,
        position: data['position'] || '',
        goals: gameStats.goals || 0,
        assists: gameStats.assists || 0,
        points: (gameStats.goals || 0) + (gameStats.assists || 0),
        plusMinus: gameStats.plusMinus || 0,
        shots: gameStats.shots || 0,
        shotPercentage: gameStats.shots ? ((gameStats.goals || 0) / gameStats.shots) * 100 : 0,
        pim: gameStats.pim || 0,
        hits: gameStats.hits || 0,
        ppg: gameStats.ppg || 0,
        shg: gameStats.shg || 0,
        fot: fot,
        fow: fow,
        foPercentage: fot > 0 ? (fow / fot) * 100 : 0
      };
    }).sort((a, b) => a.number - b.number);
  }

  async saveGameData() {
    if (!this.game || !this.canEditScores) return;

    const gameData = {
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      period: this.currentPeriod,
      homeStats: this.homeStats,
      awayStats: this.awayStats,
      homePlayerStats: this.createPlayerStatsMap(this.homePlayerStats),
      awayPlayerStats: this.createPlayerStatsMap(this.awayPlayerStats)
    };

    const homeGameRef = doc(this.firestore, `teams/${this.game.homeTeamId}/games/${this.gameId}`);
    const awayGameRef = doc(this.firestore, `teams/${this.game.awayTeamId}/games/${this.gameId}`);

    await Promise.all([
      updateDoc(homeGameRef, gameData),
      updateDoc(awayGameRef, gameData)
    ]);

    await this.loadGameData();
    this.isEditing = false;
  }

  createPlayerStatsMap(playerStats: PlayerStats[]): Record<string, any> {
    const statsMap: Record<string, any> = {};
    
    playerStats.forEach(player => {
      statsMap[player.id] = {
        goals: player.goals,
        assists: player.assists,
        plusMinus: player.plusMinus,
        shots: player.shots,
        pim: player.pim,
        hits: player.hits,
        ppg: player.ppg,
        shg: player.shg,
        fot: player.fot,
        fow: player.fow,
        minutes: player.minutes,
        seconds: player.seconds
      };
    });

    return statsMap;
  }

  toggleEdit() {
    if (!this.canEditScores) return;
    
    if (this.isEditing) {
      this.saveGameData();
    } else {
      this.isEditing = true;
    }
  }

  async updatePeriod(period: GamePeriod) {
    if (!this.canEditScores) return;
    
    this.currentPeriod = period;
    await this.saveGameData();
  }

  formatTime(minutes: number, seconds: number): string {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  formatPowerplays(successful: number, total: number): string {
    return `${successful}/${total}`;
  }

  formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  getDisplayPlayerStats(): PlayerStats[] {
    return this.selectedTeamView === 'home' ? this.homePlayerStats : this.awayPlayerStats;
  }

  getDisplayTeamName(): string {
    return this.selectedTeamView === 'home' ? this.homeTeamName : this.awayTeamName;
  }
}