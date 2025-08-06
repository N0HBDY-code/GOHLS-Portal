import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { User } from 'firebase/auth';
import { Subscription, Observable } from 'rxjs';
import { Firestore, collection, getDocs, doc, getDoc, query, orderBy, limit, where } from '@angular/fire/firestore';
import { Auths } from '../auth-service/auth-service';
interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  archetype: string;
  age: number;
  createdDate: any;
  teamId: string;
  teamName?: string;
}

interface Transaction {
  id: string;
  type: 'trade' | 'signing' | 'retirement';
  description: string;
  timestamp: any;
  playersInvolved: string[];
}

interface GameLineup {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  week: number;
  day: string;
  time?: string;
  homeScore?: number;
  awayScore?: number;
  period?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class Dashboard implements OnInit, OnDestroy {
  user: User | null = null;
  private userSub!: Subscription;
  today: Date = new Date();
  
  // New dashboard data
  newestPlayers: Player[] = [];
  recentTransactions: Transaction[] = [];
  todaysGames: GameLineup[] = [];
  loadingPlayers = false;
  loadingTransactions = false;
  loadingGames = false;

  // FIXED Carousel properties - Now properly shows ONE game every 3 seconds
  currentGameIndex = 0;
  private autoRotateTimer?: any;
  private readonly ROTATION_INTERVAL = 3000; // 3 seconds - EXACTLY 3 seconds per game

  constructor(
    private authService: Auths, 
    private firestore: Firestore,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.userSub = this.authService.currentUser.subscribe(user => {
      this.user = user;
    });

    await Promise.all([
      this.loadNewestPlayers(),
      this.loadRecentTransactions(),
      this.loadTodaysGames()
    ]);

    // Start auto-rotation ONLY if there are multiple games
    this.startAutoRotation();
  }

  ngOnDestroy(): void {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
    this.stopAutoRotation();
  }

  // FIXED Carousel methods - Now properly rotates ONE game every 3 seconds
  private startAutoRotation(): void {
    // Clear any existing timer first
    this.stopAutoRotation();
    
    // Only start rotation if there are multiple games
    if (this.todaysGames.length > 1) {
      console.log(`🎠 Starting carousel rotation: ${this.todaysGames.length} games, ${this.ROTATION_INTERVAL}ms interval`);
      
      this.autoRotateTimer = setInterval(() => {
        const previousIndex = this.currentGameIndex;
        this.nextGame();
        console.log(`🔄 Carousel rotated from game ${previousIndex} to game ${this.currentGameIndex}`);
      }, this.ROTATION_INTERVAL);
    } else {
      console.log(`🎠 Not starting carousel rotation: only ${this.todaysGames.length} game(s)`);
    }
  }

  private stopAutoRotation(): void {
    if (this.autoRotateTimer) {
      console.log('⏹️ Stopping carousel auto-rotation');
      clearInterval(this.autoRotateTimer);
      this.autoRotateTimer = null;
    }
  }

  nextGame(): void {
    if (this.todaysGames.length > 1) {
      // Move to next game, wrap around to 0 if at the end
      this.currentGameIndex = (this.currentGameIndex + 1) % this.todaysGames.length;
    }
  }

  previousGame(): void {
    if (this.todaysGames.length > 1) {
      // Move to previous game, wrap around to last if at the beginning
      this.currentGameIndex = this.currentGameIndex === 0 
        ? this.todaysGames.length - 1 
        : this.currentGameIndex - 1;
      
      // Restart auto-rotation when user manually navigates
      this.startAutoRotation();
    }
  }

  goToGame(index: number): void {
    if (index >= 0 && index < this.todaysGames.length) {
      this.currentGameIndex = index;
      // Restart auto-rotation when user manually navigates
      this.startAutoRotation();
    }
  }

  // Navigate to specific game instead of just games page
  navigateToSpecificGame(): void {
    const currentGame = this.todaysGames[this.currentGameIndex];
    if (currentGame && currentGame.gameId && currentGame.homeTeamId) {
      this.router.navigate(['/games', currentGame.homeTeamId, currentGame.gameId]);
    } else {
      // Fallback to games page if no specific game data
      this.router.navigate(['/games']);
    }
  }

  async loadNewestPlayers(): Promise<void> {
    this.loadingPlayers = true;
    try {
      const playersRef = collection(this.firestore, 'players');
      const q = query(
        playersRef, 
        where('status', '==', 'active'),
        orderBy('createdDate', 'desc'), 
        limit(5) // Limit to 5 most recent
      );
      const snapshot = await getDocs(q);
      
      this.newestPlayers = await Promise.all(
        snapshot.docs.map(async (playerDoc) => {
          const data = playerDoc.data();
          let teamName = 'Free Agent';
          
          if (data['teamId'] && data['teamId'] !== 'none') {
            const teamRef = doc(this.firestore, `teams/${data['teamId']}`);
            const teamSnap = await getDoc(teamRef);
            if (teamSnap.exists()) {
              const teamData = teamSnap.data();
              teamName = `${teamData['city']} ${teamData['mascot']}`;
            }
          }
          
          return {
            id: playerDoc.id,
            firstName: data['firstName'] || '',
            lastName: data['lastName'] || '',
            position: data['position'] || '',
            archetype: data['archetype'] || '',
            age: data['age'] || 19,
            createdDate: data['createdDate'],
            teamId: data['teamId'] || 'none',
            teamName
          };
        })
      );
    } catch (error) {
      console.error('Error loading newest players:', error);
    } finally {
      this.loadingPlayers = false;
    }
  }

  async loadRecentTransactions(): Promise<void> {
    this.loadingTransactions = true;
    try {
      // Load recent player history entries for transactions
      const allTransactions: Transaction[] = [];
      
      // Get recent player history entries
      const playersRef = collection(this.firestore, 'players');
      const playersSnapshot = await getDocs(playersRef);
      
      for (const playerDoc of playersSnapshot.docs) {
        const historyRef = collection(this.firestore, `players/${playerDoc.id}/history`);
        const historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(2)); // Reduced from 3 to 2
        const historySnapshot = await getDocs(historyQuery);
        
        for (const historyDoc of historySnapshot.docs) {
          const historyData = historyDoc.data();
          const playerData = playerDoc.data();
          
          if (['signed', 'traded', 'retired'].includes(historyData['action'])) {
            let description = '';
            const playerName = `${playerData['firstName']} ${playerData['lastName']}`;
            
            switch (historyData['action']) {
              case 'signed':
                description = `${playerName} signed with a team`;
                break;
              case 'traded':
                description = `${playerName} was traded`;
                break;
              case 'retired':
                description = `${playerName} announced retirement`;
                break;
            }
            
            allTransactions.push({
              id: historyDoc.id,
              type: historyData['action'] as 'trade' | 'signing' | 'retirement',
              description,
              timestamp: historyData['timestamp'],
              playersInvolved: [playerDoc.id]
            });
          }
        }
      }
      
      // Sort all transactions by timestamp and take the 5 most recent
      this.recentTransactions = allTransactions
        .sort((a, b) => {
          const aTime = a.timestamp?.toDate?.() || new Date(a.timestamp);
          const bTime = b.timestamp?.toDate?.() || new Date(b.timestamp);
          return bTime.getTime() - aTime.getTime();
        })
        .slice(0, 5); // Limit to 5 most recent
        
    } catch (error) {
      console.error('Error loading recent transactions:', error);
    } finally {
      this.loadingTransactions = false;
    }
  }

  async loadTodaysGames(): Promise<void> {
    this.loadingGames = true;
    try {
      // Get current game schedule settings from headquarters
      const settingsRef = doc(this.firestore, 'gameScheduleSettings/current');
      const settingsSnap = await getDoc(settingsRef);
      
      if (!settingsSnap.exists()) {
        this.todaysGames = [];
        return;
      }
      
      const settings = settingsSnap.data();
      const currentWeek = settings['week'] || 1;
      const currentDay = settings['day'] || 'D1';
      
      // Load games for the current week and day
      const gamesRef = collection(this.firestore, 'games');
      const gamesQuery = query(
        gamesRef,
        where('week', '==', currentWeek),
        where('day', '==', currentDay)
      );
      const gamesSnapshot = await getDocs(gamesQuery);
      
      this.todaysGames = await Promise.all(
        gamesSnapshot.docs.map(async (gameDoc) => {
          const gameData = gameDoc.data();
          
          // Get team information
          const [homeTeamSnap, awayTeamSnap] = await Promise.all([
            getDoc(doc(this.firestore, `teams/${gameData['homeTeamId']}`)),
            getDoc(doc(this.firestore, `teams/${gameData['awayTeamId']}`))
          ]);
          
          const homeTeamData = homeTeamSnap.exists() ? homeTeamSnap.data() : {};
          const awayTeamData = awayTeamSnap.exists() ? awayTeamSnap.data() : {};
          
          return {
            gameId: gameDoc.id,
            homeTeam: `${homeTeamData['city']} ${homeTeamData['mascot']}`,
            awayTeam: `${awayTeamData['city']} ${awayTeamData['mascot']}`,
            homeTeamId: gameData['homeTeamId'],
            awayTeamId: gameData['awayTeamId'],
            homeTeamLogo: homeTeamData['logoUrl'],
            awayTeamLogo: awayTeamData['logoUrl'],
            week: gameData['week'],
            day: gameData['day'],
            time: gameData['time'] || 'TBD',
            homeScore: gameData['homeScore'],
            awayScore: gameData['awayScore'],
            period: gameData['period']
          };
        })
      );

      // Reset carousel index when games are loaded
      this.currentGameIndex = 0;
      
      console.log(`🎮 Loaded ${this.todaysGames.length} games for Week ${currentWeek}, ${currentDay}`);
      
      // Restart auto-rotation after games are loaded
      this.startAutoRotation();
      
    } catch (error) {
      console.error('Error loading today\'s games:', error);
    } finally {
      this.loadingGames = false;
    }
  }

  getTimeAgo(timestamp: any): string {
    const date = timestamp?.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);
    
    if (diffInDays > 0) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    } else if (diffInHours > 0) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      return 'Less than an hour ago';
    }
  }

  getTransactionIcon(type: string): string {
    switch (type) {
      case 'trade': return 'fas fa-exchange-alt';
      case 'signing': return 'fas fa-pen-nib';
      case 'retirement': return 'fas fa-medal';
      default: return 'fas fa-info-circle';
    }
  }

  getTransactionColor(type: string): string {
    switch (type) {
      case 'trade': return 'text-primary';
      case 'signing': return 'text-success';
      case 'retirement': return 'text-warning';
      default: return 'text-muted';
    }
  }

  // Helper method to check if game has score
  hasScore(game: GameLineup): boolean {
    return (game.homeScore !== undefined && game.homeScore !== null) || 
           (game.awayScore !== undefined && game.awayScore !== null);
  }

  // Getter for auto-rotation interval display
  get autoRotateInterval(): number {
    return this.ROTATION_INTERVAL;
  }
}