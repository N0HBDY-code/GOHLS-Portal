import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  Firestore,
  collection,
  getDocs,
  addDoc,
  doc,
  query,
  where,
  deleteDoc,
  getDoc,
  setDoc,
  updateDoc,
  orderBy
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auths } from '../auth-service/auth-service';

interface Team {
  id: string;
  name: string;
  conference: string;
  division: string;
  logoUrl?: string;
}

interface Game {
  id?: string;
  homeTeamId: string;
  awayTeamId: string;
  week: number;
  day: string;
  season: number;
  isRival: boolean;
  homeTeam?: string;
  awayTeam?: string;
  homeLogo?: string;
  awayLogo?: string;
  tags?: string[];
  homeScore?: number;
  awayScore?: number;
  period?: string;
}

@Component({
  selector: 'app-games',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './games.component.html',
  styleUrls: ['./games.component.css']
})
export class Games implements OnInit {
  teams: Team[] = [];
  currentSeason = 1;
  loading = false;
  isClearing = false;
  selectedWeek = 1;
  activeWeeks: number[] = [];
  weekSchedule: Map<number, Game[]> = new Map();
  gamesCache = new Map<string, Game>();
  canManageGames = false;
  isDeveloper = false;

  newGame: {
    homeTeamId: string;
    awayTeamId: string;
    week: number;
    day: number;
    season: number;
    isRival: boolean;
  } = {
    homeTeamId: '',
    awayTeamId: '',
    week: 1,
    day: 1,
    season: 1,
    isRival: false
  };

  constructor(
    private firestore: Firestore, 
    private router: Router,
    private authService: Auths
  ) {}

  async ngOnInit() {
    // Subscribe to role changes
    this.authService.effectiveRoles.subscribe(roles => {
      this.canManageGames = roles.some(role => 
        ['developer', 'commissioner'].includes(role)
      );
      this.isDeveloper = roles.includes('developer');
    });

    // Load current season from headquarters settings
    await this.loadCurrentSeason();

    const teamsRef = collection(this.firestore, 'teams');
    const snapshot = await getDocs(teamsRef);
    this.teams = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Team));

    await this.loadActiveWeeks();
    if (this.activeWeeks.length > 0) {
      this.selectedWeek = this.activeWeeks[0];
      await this.loadWeek(this.selectedWeek);
    }
  }

  async loadCurrentSeason() {
    try {
      const settingsRef = doc(this.firestore, 'gameScheduleSettings/current');
      const settingsSnap = await getDoc(settingsRef);
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        this.currentSeason = data['season'] || 1;
        this.newGame.season = this.currentSeason;
      }
    } catch (error) {
      console.error('Error loading current season:', error);
    }
  }

  async loadActiveWeeks() {
    const gamesQuery = query(
      collection(this.firestore, 'games'),
      where('season', '==', this.currentSeason)
    );
    
    const snapshot = await getDocs(gamesQuery);
    const weeks = new Set(snapshot.docs.map(doc => doc.data()['week']));
    this.activeWeeks = Array.from(weeks).sort((a, b) => a - b);
  }

  async onWeekChange(week: number) {
    this.selectedWeek = week;
    await this.loadWeek(week);
  }

  async loadWeek(weekNumber: number) {
    if (this.loading) return;
    
    this.loading = true;
    try {
      const gamesQuery = query(
        collection(this.firestore, 'games'),
        where('season', '==', this.currentSeason),
        where('week', '==', weekNumber)
      );

      const snapshot = await getDocs(gamesQuery);
      const weekGames = await Promise.all(
        snapshot.docs.map(async doc => {
          const gameData = doc.data();
          const homeTeam = this.teams.find(t => t.id === gameData['homeTeamId']);
          const awayTeam = this.teams.find(t => t.id === gameData['awayTeamId']);
          
          return {
            id: doc.id,
            ...gameData,
            homeTeam: homeTeam?.name || 'Unknown Team',
            awayTeam: awayTeam?.name || 'Unknown Team',
            homeLogo: homeTeam?.logoUrl,
            awayLogo: awayTeam?.logoUrl,
            tags: gameData['tags'] || [],
            homeScore: gameData['homeScore'],
            awayScore: gameData['awayScore'],
            period: gameData['period']
          } as Game;
        })
      );

      this.weekSchedule.set(weekNumber, weekGames);
    } finally {
      this.loading = false;
    }
  }

  getWeekSchedule(week: number): Game[] | undefined {
    return this.weekSchedule.get(week);
  }

  getDays(games: Game[] | undefined): string[] {
    if (!games) return [];
    const days = new Set(games.map(g => g.day));
    return Array.from(days).sort();
  }

  getGamesForDay(games: Game[] | undefined, day: string): Game[] {
    if (!games) return [];
    return games.filter(g => g.day === day);
  }

  formatDay(day: number): string {
    return `D${day}`;
  }

  hasScore(game: Game): boolean {
    return (game.homeScore !== undefined && game.homeScore !== null) || 
           (game.awayScore !== undefined && game.awayScore !== null) ||
           (game.period !== undefined && game.period !== null);
  }

  async addGame() {
    if (!this.canManageGames) return;

    if (!this.newGame.homeTeamId || !this.newGame.awayTeamId || !this.newGame.day) {
      alert('Please fill in all required fields');
      return;
    }

    const homeTeam = this.teams.find(t => t.id === this.newGame.homeTeamId);
    const awayTeam = this.teams.find(t => t.id === this.newGame.awayTeamId);
    
    if (!homeTeam || !awayTeam) return;

    const tags: string[] = [];
    if (this.newGame.isRival) {
      tags.push('rival');
    } else if (homeTeam.division === awayTeam.division) {
      tags.push('division');
    } else if (homeTeam.conference === awayTeam.conference) {
      tags.push('conference');
    }

    const gameData = {
      ...this.newGame,
      day: this.formatDay(this.newGame.day),
      season: this.currentSeason,
      tags
    };

    const gameRef = await addDoc(collection(this.firestore, 'games'), gameData);
    const gameId = gameRef.id;

    await Promise.all([
      setDoc(doc(this.firestore, `teams/${homeTeam.id}/games/${gameId}`), {
        ...gameData,
        isHome: true,
        opponent: awayTeam.name,
        opponentId: awayTeam.id
      }),
      setDoc(doc(this.firestore, `teams/${awayTeam.id}/games/${gameId}`), {
        ...gameData,
        isHome: false,
        opponent: homeTeam.name,
        opponentId: homeTeam.id
      })
    ]);

    this.newGame = {
      homeTeamId: '',
      awayTeamId: '',
      week: this.newGame.week,
      day: 1,
      season: this.currentSeason,
      isRival: false
    };

    await this.loadActiveWeeks();
    await this.loadWeek(this.selectedWeek);
  }

  async clearAllGames() {
    if (!this.isDeveloper) return;

    if (!confirm('Are you sure you want to clear all games? This cannot be undone.')) {
      return;
    }

    this.isClearing = true;
    try {
      const gamesQuery = query(
        collection(this.firestore, 'games'),
        where('season', '==', this.currentSeason)
      );
      
      const snapshot = await getDocs(gamesQuery);
      
      for (const doc of snapshot.docs) {
        await deleteDoc(doc.ref);
      }

      this.weekSchedule.clear();
      this.activeWeeks = [];
      this.selectedWeek = 1;
    } finally {
      this.isClearing = false;
    }
  }

  viewGame(game: Game) {
    if (!game.id || !game.homeTeamId) return;
    this.router.navigate(['/games', game.homeTeamId, game.id]);
  }
}