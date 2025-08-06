import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, getDoc, collection, getDocs, query, where } from '@angular/fire/firestore';
import { Auths } from '../auth-service/auth-service';
import { Contract } from '../services/contract';
import { Trades, TradeOffer } from '../services/trades';
import { FreeAgency } from '../services/free-agency';

interface Player {
  id?: string;
  firstName: string;
  lastName: string;
  position: string;
  number: number;
  selected?: boolean;
  teamId: string;
  overall?: number;
  salary?: number;
  contractYears?: number;
  capHit?: number;
  signingBonus?: number;
  performanceBonus?: number;
  archetype?: string;
  age?: number;
  height?: number;
  weight?: number;
  handedness?: string;
}

interface Team {
  id: string;
  name: string;
  city: string;
  mascot: string;
}

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team-detail.component.html',
  styleUrls: ['./team-detail.component.css']
})
export class TeamDetail implements OnInit {
  teamId: string;
  teamName: string = '';
  teamLogo: string = '';
  canManageTeam = false;
  showManageModal = false;
  currentTab: 'trades' | 'contracts' | 'freeagents' = 'trades';
  isLoading = false;
  roster: Player[] = [];

  // Trade-related properties
  selectedTradePartner: string = '';
  availableTradePartners: Team[] = [];
  yourPlayers: Player[] = [];
  partnerPlayers: Player[] = [];
  incomingTradeOffers: TradeOffer[] = [];
  loadingTrades = false;
  playerCache: Map<string, string> = new Map();

  constructor(
    private route: ActivatedRoute,
    private firestore: Firestore,
    private authService: Auths,
    private contractService: Contract,
    private tradeService: Trades,
    private freeAgencyService: FreeAgency
  ) {
    this.teamId = this.route.snapshot.paramMap.get('id')!;
  }

  async ngOnInit() {
    this.isLoading = true;
    try {
      // Check if user can manage team
      this.authService.effectiveRoles.subscribe(roles => {
        this.canManageTeam = roles.some(role => 
          ['developer', 'commissioner', 'gm'].includes(role)
        );
      });

      if (this.teamId) {
        const teamRef = doc(this.firestore, `teams/${this.teamId}`);
        const teamSnap = await getDoc(teamRef);
        if (teamSnap.exists()) {
          const data = teamSnap.data() as any;
          this.teamName = `${data['city']} ${data['mascot']}`;
          this.teamLogo = data['logoUrl'] || '';
        }

        await this.loadRoster();
        await this.loadTradePartners();
        await this.loadIncomingTradeOffers();
      }
    } finally {
      this.isLoading = false;
    }
  }

  async loadRoster() {
    try {
      const rosterRef = collection(this.firestore, `teams/${this.teamId}/roster`);
      const rosterSnap = await getDocs(rosterRef);
      
      this.roster = await Promise.all(rosterSnap.docs.map(async docSnapshot => {
        const data = docSnapshot.data() as any;
        
        // Get overall rating from attributes
        let overall = 50;
        try {
          const attributesRef = doc(this.firestore, `players/${docSnapshot.id}/meta/attributes`);
          const attributesSnap = await getDoc(attributesRef);
          if (attributesSnap.exists()) {
            overall = (attributesSnap.data() as any)['OVERALL'] || 50;
          }
        } catch (error) {
          console.error('Error loading player attributes:', error);
        }
        
        return {
          id: docSnapshot.id,
          firstName: data['firstName'] || '',
          lastName: data['lastName'] || '',
          position: data['position'] || '',
          number: data['jerseyNumber'] || 0,
          archetype: data['archetype'] || '',
          age: data['age'] || 19,
          height: data['height'] || '',
          weight: data['weight'] || '',
          handedness: data['handedness'] || '',
          teamId: this.teamId,
          overall
        };
      }));
    } catch (error) {
      console.error('Error loading roster:', error);
    }
  }

  async loadTradePartners() {
    const teamsRef = collection(this.firestore, 'teams');
    const snapshot = await getDocs(teamsRef);
    this.availableTradePartners = snapshot.docs
      .map(doc => ({
        id: doc.id,
        name: `${doc.data()['city']} ${doc.data()['mascot']}`,
        city: doc.data()['city'],
        mascot: doc.data()['mascot']
      }))
      .filter(team => team.id !== this.teamId);
  }

  async loadIncomingTradeOffers() {
    this.loadingTrades = true;
    try {
      const offers = await this.tradeService.getTradeOffersForTeam(this.teamId);
      this.incomingTradeOffers = offers.filter(offer => offer.status === 'pending');

      // Pre-load player names for trade offers
      const playerIds = new Set([
        ...this.incomingTradeOffers.flatMap(o => o.playersOffered),
        ...this.incomingTradeOffers.flatMap(o => o.playersRequested)
      ]);

      // Only query if there are player IDs to look up
      if (playerIds.size > 0) {
        for (const playerId of playerIds) {
          const playerRef = doc(this.firestore, `players/${playerId}`);
          const playerSnap = await getDoc(playerRef);
          if (playerSnap.exists()) {
            const data = playerSnap.data() as any;
            this.playerCache.set(playerId, `${data['firstName']} ${data['lastName']}`);
          }
        }
      }
    } finally {
      this.loadingTrades = false;
    }
  }

  async onTradePartnerSelect() {
    if (!this.selectedTradePartner) return;

    this.isLoading = true;
    try {
      // Load rosters in parallel
      const [yourRosterSnap, partnerRosterSnap] = await Promise.all([
        getDocs(collection(this.firestore, `teams/${this.teamId}/roster`)),
        getDocs(collection(this.firestore, `teams/${this.selectedTradePartner}/roster`))
      ]);

      this.yourPlayers = yourRosterSnap.docs.map(doc => ({
        ...doc.data() as Player,
        id: doc.id,
        selected: false
      }));

      this.partnerPlayers = partnerRosterSnap.docs.map(doc => ({
        ...doc.data() as Player,
        id: doc.id,
        selected: false
      }));
    } finally {
      this.isLoading = false;
    }
  }

  getTeamName(teamId: string): string {
    if (teamId === this.teamId) return this.teamName;
    const team = this.availableTradePartners.find(t => t.id === teamId);
    return team ? `${team.city} ${team.mascot}` : 'Unknown Team';
  }

  getPlayerName(playerId: string): string {
    return this.playerCache.get(playerId) || 'Loading...';
  }

  getSelectedYourPlayers(): Player[] {
    return this.yourPlayers.filter(p => p.selected);
  }

  getSelectedPartnerPlayers(): Player[] {
    return this.partnerPlayers.filter(p => p.selected);
  }

  updateTradeSummary() {
    // This method is called when checkboxes are changed
    // The template will automatically update based on the selected players
  }

  canProposeTrade(): boolean {
    return this.getSelectedYourPlayers().length > 0 || 
           this.getSelectedPartnerPlayers().length > 0;
  }

  async proposeTrade() {
    if (!this.selectedTradePartner) return;

    this.isLoading = true;
    try {
      const tradeOffer = {
        fromTeamId: this.teamId,
        toTeamId: this.selectedTradePartner,
        playersOffered: this.getSelectedYourPlayers().map(p => p.id!),
        playersRequested: this.getSelectedPartnerPlayers().map(p => p.id!)
      };

      await this.tradeService.proposeTrade(tradeOffer);
      
      // Reset selections
      this.yourPlayers.forEach(p => p.selected = false);
      this.partnerPlayers.forEach(p => p.selected = false);
      
      alert('Trade proposal sent successfully!');
    } catch (error) {
      console.error('Error proposing trade:', error);
      alert('Failed to propose trade. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  async acceptTrade(offer: TradeOffer) {
    this.isLoading = true;
    try {
      await this.tradeService.acceptTrade(offer);
      await this.loadIncomingTradeOffers();
      alert('Trade accepted successfully!');
    } catch (error) {
      console.error('Error accepting trade:', error);
      alert('Failed to accept trade. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  async rejectTrade(offer: TradeOffer) {
    this.isLoading = true;
    try {
      await this.tradeService.rejectTrade(offer);
      await this.loadIncomingTradeOffers();
      alert('Trade rejected successfully!');
    } catch (error) {
      console.error('Error rejecting trade:', error);
      alert('Failed to reject trade. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  // Helper methods for UI
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
  
  getOverallColor(overall: number): string {
    // Clamp the value between 50 and 99
    const clampedOverall = Math.max(50, Math.min(99, overall));
    
    // Calculate the percentage from 50 to 99 (0% to 100%)
    const percentage = (clampedOverall - 50) / (99 - 50);
    
    // Use a more vibrant red to green interpolation
    const red = Math.round(220 - (220 - 34) * percentage);
    const green = Math.round(38 + (197 - 38) * percentage);
    const blue = Math.round(38 + (94 - 38) * percentage);
    
    return `rgb(${red}, ${green}, ${blue})`;
  }
}