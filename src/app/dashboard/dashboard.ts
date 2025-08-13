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
  tradeData?: {
    fromTeam: { name: string; logo: string };
    toTeam: { name: string; logo: string };
    offeredPlayers: string[];
    requestedPlayers: string[];
  };
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

  // Dashboard stats properties
  totalUsers = 0;
  totalActivePlayers = 0;
  totalTeams = 0;
  currentLeagueSeason = 1;

  constructor(
    private authService: Auths, 
    private firestore: Firestore,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.userSub = this.authService.currentUser.subscribe(user => {
      this.user = user;
    });

    // Load critical data first (games), then load other data lazily
    await this.loadTodaysGames();
    await this.loadDashboardStats();
    
    // Load non-critical data after a short delay to improve perceived performance
    setTimeout(() => {
      this.loadNewestUsers();
      this.loadRecentTransactions();
    }, 100);

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
      // OPTIMIZATION: Use query with limit to reduce data transfer
      const usersRef = collection(this.firestore, 'users');
      const usersQuery = query(usersRef, limit(10)); // Only get 10 users max
      const snapshot = await getDocs(usersQuery);
      
      // OPTIMIZATION: Load users without player data first, then batch load player data
      const users = snapshot.docs.map(userDoc => {
        const userData = userDoc.data();
        const createdDate = userData['createdAt'] || new Date(parseInt(userDoc.id.substring(0, 8), 16) * 1000);
        
        return {
          id: userDoc.id,
          displayName: userData['displayName'] || 'Unknown User',
          email: userData['email'] || '',
          createdDate,
          player: undefined // Will be loaded separately
        };
      });
      
      // Sort users by creation date first
      const sortedUsers = users.sort((a, b) => {
        const aTime = a.createdDate instanceof Date ? a.createdDate : new Date(a.createdDate);
        const bTime = b.createdDate instanceof Date ? b.createdDate : new Date(b.createdDate);
        return bTime.getTime() - aTime.getTime();
      }).slice(0, 5); // Take top 5
      
      // OPTIMIZATION: Batch load player data for only the top 5 users
      const userIds = sortedUsers.map(u => u.id);
      const playersQuery = query(
        collection(this.firestore, 'players'),
        where('userId', 'in', userIds),
        where('status', '==', 'active')
      );
      const playersSnapshot = await getDocs(playersQuery);
      
      // Create player lookup map
      const playerMap = new Map();
      playersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        playerMap.set(data['userId'], {
          firstName: data['firstName'] || '',
          lastName: data['lastName'] || '',
          position: data['position'] || '',
          teamId: data['teamId']
        });
      });
      
      // OPTIMIZATION: Batch load team data for all unique team IDs
      const teamIds = Array.from(new Set(
        Array.from(playerMap.values())
          .map(p => p.teamId)
          .filter(id => id && id !== 'none')
      ));
      
      const teamMap = new Map();
      if (teamIds.length > 0) {
        // Load teams in batches of 10 (Firestore 'in' query limit)
        for (let i = 0; i < teamIds.length; i += 10) {
          const batchIds = teamIds.slice(i, i + 10);
          const teamsQuery = query(
            collection(this.firestore, 'teams'),
            where('__name__', 'in', batchIds)
          );
          const teamsSnapshot = await getDocs(teamsQuery);
          
          teamsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            teamMap.set(doc.id, `${data['city']} ${data['mascot']}`);
          });
        }
      }
      
      // Combine user and player data
      this.newestUsers = sortedUsers.map(user => {
        const playerData = playerMap.get(user.id);
        if (playerData) {
          const teamName = playerData.teamId && playerData.teamId !== 'none' 
            ? teamMap.get(playerData.teamId) || 'Free Agent'
            : 'Free Agent';
            
          user.player = {
            ...playerData,
            teamName
          };
        }
        return user;
      });
      
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
      
      // OPTIMIZATION: Enhanced caching system
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
      
      // OPTIMIZATION: Load only recent player history (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const playersRef = collection(this.firestore, 'players');
      const recentPlayersQuery = query(
        playersRef,
        where('status', '==', 'active'),
        limit(20) // Limit to 20 most recent players
      );
      const playersSnapshot = await getDocs(recentPlayersQuery);
      
      for (const playerDoc of playersSnapshot.docs) {
        const historyRef = collection(this.firestore, `players/${playerDoc.id}/history`);
        const historyQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(2)); // Reduced from 3 to 2
        const historySnapshot = await getDocs(historyQuery);
        
        for (const historyDoc of historySnapshot.docs) {
          const historyData = historyDoc.data();
          
          // OPTIMIZATION: Skip old transactions
          const transactionDate = historyData['timestamp']?.toDate?.() || new Date(historyData['timestamp']);
          if (transactionDate < thirtyDaysAgo) continue;
          
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
      
      // OPTIMIZATION: Load only recent approved trades
      try {
        const tradesRef = collection(this.firestore, 'tradeOffers');
        const recentTradesQuery = query(
          tradesRef,
          where('status', '==', 'approved'),
          orderBy('timestamp', 'desc'),
          limit(5) // Reduced from 10 to 5
        );
        const tradesSnapshot = await getDocs(recentTradesQuery);
        
        for (const tradeDoc of tradesSnapshot.docs) {
          const tradeData = tradeDoc.data();
          
          // OPTIMIZATION: Skip old trades
          const tradeDate = tradeData['timestamp']?.toDate?.() || new Date(tradeData['timestamp']);
          if (tradeDate < thirtyDaysAgo) continue;
          
          // Get team data with caching
          const [fromTeamData, toTeamData] = await Promise.all([
            getTeamData(tradeData['fromTeamId']),
            getTeamData(tradeData['toTeamId'])
          ]);
          
          // OPTIMIZATION: Batch load player names
          const offeredPlayerNames: string[] = [];
          const requestedPlayerNames: string[] = [];
          const allTradePlayerIds = [...(tradeData['playersOffered'] || []), ...(tradeData['playersRequested'] || [])];
          
          // Batch load all player names for this trade
          const playerPromises = allTradePlayerIds.map(id => getPlayerData(id));
          const playerNames = await Promise.all(playerPromises);
          
          // Split into offered and requested
          const offeredCount = (tradeData['playersOffered'] || []).length;
          for (let i = 0; i < offeredCount; i++) {
            offeredPlayerNames.push(playerNames[i]);
          }
          for (let i = offeredCount; i < playerNames.length; i++) {
            requestedPlayerNames.push(playerNames[i]);
          }
          
          const description = `Trade completed between ${fromTeamData.name} and ${toTeamData.name}`;
          
          allTransactions.push({
            id: tradeDoc.id,
            type: 'trade',
            description,
            timestamp: tradeData['timestamp'],
            playersInvolved: allTradePlayerIds,
            teamLogo: fromTeamData.logo,
            teamName: fromTeamData.name,
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
      // OPTIMIZATION: Load settings and games in parallel
      const settingsRef = doc(this.firestore, 'gameScheduleSettings/current');
      const settingsSnap = await getDoc(settingsRef);
      
      if (!settingsSnap.exists()) {
        console.log('❌ No game schedule settings found');
        this.todaysGames = [];
        this.loadingGames = false;
        return;
      }
      
      const settings = settingsSnap.data();
      const currentSeason = settings['season'] || 1;
      const currentWeek = settings['week'] || 1;
      const currentDay = settings['day'] || 'D1';
      
      console.log(`🎮 Loading games for Season ${currentSeason}, Week ${currentWeek}, ${currentDay}`);
      
      // OPTIMIZATION: More specific query to reduce data transfer
      const gamesRef = collection(this.firestore, 'games');
      const gamesQuery = query(
        gamesRef,
        where('season', '==', currentSeason),
        where('week', '==', currentWeek),
        where('day', '==', currentDay),
        limit(10) // Limit games per day
      );
      const gamesSnapshot = await getDocs(gamesQuery);
      
      console.log(`📊 Found ${gamesSnapshot.docs.length} games matching criteria`);
      
      // OPTIMIZATION: Batch load all unique team IDs
      const uniqueTeamIds = new Set<string>();
      gamesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        uniqueTeamIds.add(data['homeTeamId']);
        uniqueTeamIds.add(data['awayTeamId']);
      });
      
      // Load all teams in one batch query
      const teamDataMap = new Map();
      if (uniqueTeamIds.size > 0) {
        const teamIds = Array.from(uniqueTeamIds);
        // Load teams in batches of 10 (Firestore 'in' query limit)
        for (let i = 0; i < teamIds.length; i += 10) {
          const batchIds = teamIds.slice(i, i + 10);
          const teamsQuery = query(
            collection(this.firestore, 'teams'),
            where('__name__', 'in', batchIds)
          );
          const teamsSnapshot = await getDocs(teamsQuery);
          
          teamsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            teamDataMap.set(doc.id, {
              name: `${data['city']} ${data['mascot']}`,
              logo: data['logoUrl'] || ''
            });
          });
        }
      }
      
      // Process games with cached team data
      this.todaysGames = gamesSnapshot.docs.map(gameDoc => {
        const gameData = gameDoc.data();
        
        const homeTeamData = teamDataMap.get(gameData['homeTeamId']) || { name: 'Unknown Team', logo: '' };
        const awayTeamData = teamDataMap.get(gameData['awayTeamId']) || { name: 'Unknown Team', logo: '' };
        
        return {
          gameId: gameDoc.id,
          homeTeam: homeTeamData.name,
          awayTeam: awayTeamData.name,
          homeTeamId: gameData['homeTeamId'],
          awayTeamId: gameData['awayTeamId'],
          homeTeamLogo: homeTeamData.logo,
          awayTeamLogo: awayTeamData.logo,
          week: gameData['week'],
          day: gameData['day'],
          time: gameData['time'] || 'TBD',
          homeScore: gameData['homeScore'],
          awayScore: gameData['awayScore'],
          period: gameData['period']
        };
      });

      // Reset carousel index when games are loaded
      this.currentGameIndex = 0;
      
      console.log(`🎮 Loaded ${this.todaysGames.length} games for Season ${currentSeason}, Week ${currentWeek}, ${currentDay}`);
      
      // Restart auto-rotation after games are loaded
      this.startAutoRotation();
      
    } catch (error) {
      console.error('Error loading today\'s games:', error);
      this.todaysGames = [];
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

  // OPTIMIZATION: New method to load dashboard stats efficiently
  async loadDashboardStats(): Promise<void> {
    try {
      // OPTIMIZATION: Load stats with counting queries where possible
      const [usersSnap, playersSnap, teamsSnap, seasonSnap] = await Promise.all([
        getDocs(query(collection(this.firestore, 'users'), limit(1000))), // Reasonable limit
        getDocs(query(collection(this.firestore, 'players'), where('status', '==', 'active'), limit(1000))),
        getDocs(query(collection(this.firestore, 'teams'), limit(100))), // Teams are limited anyway
        getDoc(doc(this.firestore, 'leagueSettings/season'))
      ]);
      
      this.totalUsers = usersSnap.docs.length;
      this.totalActivePlayers = playersSnap.docs.length;
      this.totalTeams = teamsSnap.docs.length;
      this.currentLeagueSeason = seasonSnap.exists() ? seasonSnap.data()['currentSeason'] || 1 : 1;
      
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      // Set defaults on error
      this.totalUsers = 0;
      this.totalActivePlayers = 0;
      this.totalTeams = 0;
    }
  }
}