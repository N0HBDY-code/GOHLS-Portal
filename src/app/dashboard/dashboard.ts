import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { User as FirebaseUser } from 'firebase/auth';
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

interface AppUser {
  id: string;
  displayName: string;
  email: string;
  createdDate: any;
  player?: {
    firstName: string;
    lastName: string;
    position: string;
    teamName?: string;
  };
}

interface Transaction {
  id: string;
  type: 'trade' | 'signing' | 'retirement';
  description: string;
  timestamp: any;
  playersInvolved: string[];
  teamLogo?: string;
  teamName?: string;
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
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class Dashboard implements OnInit, OnDestroy {
  user: FirebaseUser | null = null;
  private userSub!: Subscription;
  today: Date = new Date();
  
  // New dashboard data
  newestUsers: AppUser[] = [];
  recentTransactions: Transaction[] = [];
  todaysGames: GameLineup[] = [];
  loadingUsers = false;
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
      this.loadNewestUsers(),
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

  async loadNewestUsers(): Promise<void> {
    this.loadingUsers = true;
    try {
      const usersRef = collection(this.firestore, 'users');
      const snapshot = await getDocs(usersRef);
      
      // Get all users and sort by creation date (using uid timestamp as fallback)
      const allUsers = await Promise.all(
        snapshot.docs.map(async (userDoc) => {
          const userData = userDoc.data();
          
          // Try to find their active player
          let player = undefined;
          try {
            const playersQuery = query(
              collection(this.firestore, 'players'),
              where('userId', '==', userDoc.id),
              where('status', '==', 'active'),
              limit(1)
            );
            const playerSnapshot = await getDocs(playersQuery);
            
            if (!playerSnapshot.empty) {
              const playerData = playerSnapshot.docs[0].data();
              let teamName = 'Free Agent';
              
              if (playerData['teamId'] && playerData['teamId'] !== 'none') {
                const teamRef = doc(this.firestore, `teams/${playerData['teamId']}`);
                const teamSnap = await getDoc(teamRef);
                if (teamSnap.exists()) {
                  const teamData = teamSnap.data();
                  teamName = `${teamData['city']} ${teamData['mascot']}`;
                }
              }
              
              player = {
                firstName: playerData['firstName'] || '',
                lastName: playerData['lastName'] || '',
                position: playerData['position'] || '',
                teamName
              };
            }
          } catch (error) {
            console.error('Error loading player for user:', error);
          }
          
          // Use account creation date or fallback to uid timestamp
          const createdDate = userData['createdAt'] || new Date(parseInt(userDoc.id.substring(0, 8), 16) * 1000);
          
          return {
            id: userDoc.id,
            displayName: userData['displayName'] || 'Unknown User',
            email: userData['email'] || '',
            createdDate,
            player
          };
        })
      );
      
      // Sort by creation date (newest first) and take top 5
      this.newestUsers = allUsers
        .sort((a, b) => {
          const aTime = a.createdDate instanceof Date ? a.createdDate : new Date(a.createdDate);
          const bTime = b.createdDate instanceof Date ? b.createdDate : new Date(b.createdDate);
          return bTime.getTime() - aTime.getTime();
        })
        .slice(0, 5);
        
    } catch (error) {
      console.error('Error loading newest users:', error);
    } finally {
      this.loadingUsers = false;
    }
  }

  async loadRecentTransactions(): Promise<void> {
    this.loadingTransactions = true;
    try {
      const allTransactions: Transaction[] = [];
      
      // Create caches to reduce API calls
      const teamCache = new Map<string, any>();
      const playerCache = new Map<string, any>();
      
      // Helper function to get team data with caching
      const getTeamData = async (teamId: string) => {
        if (teamCache.has(teamId)) {
          return teamCache.get(teamId);
        }
        
        try {
          const teamRef = doc(this.firestore, `teams/${teamId}`);
          const teamSnap = await getDoc(teamRef);
          if (teamSnap.exists()) {
            const teamData = teamSnap.data();
            const result = {
              name: `${teamData['city']} ${teamData['mascot']}`,
              logo: teamData['logoUrl'] || ''
            };
            teamCache.set(teamId, result);
            return result;
          }
        } catch (error) {
          console.error('Error loading team:', error);
        }
        return { name: 'Unknown Team', logo: '' };
      };
      
      // Helper function to get player data with caching
      const getPlayerData = async (playerId: string) => {
        if (playerCache.has(playerId)) {
          return playerCache.get(playerId);
        }
        
        try {
          const playerRef = doc(this.firestore, `players/${playerId}`);
          const playerSnap = await getDoc(playerRef);
          if (playerSnap.exists()) {
            const playerData = playerSnap.data();
            const result = `${playerData['firstName']} ${playerData['lastName']}`;
            playerCache.set(playerId, result);
            return result;
          }
        } catch (error) {
          console.error('Error loading player:', error);
        }
        return 'Unknown Player';
      };
      
      // 1. Load player history for signings and retirements
      const playersRef = collection(this.firestore, 'players');
      const playersSnapshot = await getDocs(playersRef);
      
      for (const playerDoc of playersSnapshot.docs) {
        const historyRef = collection(this.firestore, `players/${playerDoc.id}/history`);
        const historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(3));
        const historySnapshot = await getDocs(historyQuery);
        
        for (const historyDoc of historySnapshot.docs) {
          const historyData = historyDoc.data();
          const playerData = playerDoc.data();
          
          if (['signed', 'traded', 'retired'].includes(historyData['action'])) {
            let description = '';
            let teamData = { name: '', logo: '' };
            const playerName = `${playerData['firstName']} ${playerData['lastName']}`;
            
            // Get team info if available
            if (historyData['teamId'] && historyData['teamId'] !== 'none') {
              teamData = await getTeamData(historyData['teamId']);
            }
            
            switch (historyData['action']) {
              case 'signed':
                description = `${playerName} signed with ${teamData.name || 'a team'}`;
                break;
              case 'traded':
                description = `${playerName} was traded to ${teamData.name || 'a team'}`;
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
              playersInvolved: [playerDoc.id],
              teamLogo: teamData.logo,
              teamName: teamData.name
            });
          }
        }
      }
      
      // 2. Load trade offers that have been approved
      try {
        const tradesRef = collection(this.firestore, 'tradeOffers');
        const tradesSnapshot = await getDocs(tradesRef);
        
        // Filter and sort in memory to avoid index requirements
        const approvedTrades = tradesSnapshot.docs
          .filter(doc => doc.data()['status'] === 'approved')
          .sort((a, b) => {
            const aTime = a.data()['timestamp']?.toDate?.() || new Date(a.data()['timestamp']);
            const bTime = b.data()['timestamp']?.toDate?.() || new Date(b.data()['timestamp']);
            return bTime.getTime() - aTime.getTime();
          })
          .slice(0, 10); // Limit to 10 most recent
        
        for (const tradeDoc of approvedTrades) {
          const tradeData = tradeDoc.data();
          
          // Get team data with caching
          const [fromTeamData, toTeamData] = await Promise.all([
            getTeamData(tradeData['fromTeamId']),
            getTeamData(tradeData['toTeamId'])
          ]);
          
          // Get player names with caching
          const offeredPlayerNames: string[] = [];
          const requestedPlayerNames: string[] = [];
          const allPlayerIds = [...(tradeData['playersOffered'] || []), ...(tradeData['playersRequested'] || [])];
          
          // Load offered players
          for (const playerId of (tradeData['playersOffered'] || [])) {
            const playerName = await getPlayerData(playerId);
            offeredPlayerNames.push(playerName);
          }
          
          // Load requested players
          for (const playerId of (tradeData['playersRequested'] || [])) {
            const playerName = await getPlayerData(playerId);
            requestedPlayerNames.push(playerName);
          }
          
          const description = `Trade completed between ${fromTeamData.name} and ${toTeamData.name}`;
          
          allTransactions.push({
            id: tradeDoc.id,
            type: 'trade',
            description,
            timestamp: tradeData['timestamp'],
            playersInvolved: allPlayerIds,
            teamLogo: fromTeamData.logo,
            teamName: fromTeamData.name,
            // Add trade-specific data
            tradeData: {
              fromTeam: fromTeamData,
              toTeam: toTeamData,
              offeredPlayers: offeredPlayerNames,
              requestedPlayers: requestedPlayerNames
            }
          });
        }
      } catch (error) {
        console.error('Error loading trade transactions:', error);
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