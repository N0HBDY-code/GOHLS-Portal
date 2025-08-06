import { Component } from '@angular/core';
import { Firestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, setDoc, getDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auths } from '../auth-service/auth-service';
import { CommonModule } from '@angular/common';

interface Team {
  id?: string;
  city: string;
  mascot: string;
  logoFile: File | null;
  logoUrl?: string;
  conference: string;
  division: string;
  league: string;
  primaryColor?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
}

interface Conference {
  name: string;
  divisions: string[];
}

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teams.html',
  styleUrls: ['./teams.css']
})
export class Teams {
  city = '';
  mascot = '';
  logoFile: File | null = null;
  selectedConference = '';
  selectedDivision = '';
  selectedLeague = '';
  teams: Team[] = [];
  canManageTeams = false;
  primaryColor = '#000000';
  secondaryColor = '#FFFFFF';
  tertiaryColor = '#808080';
  showAddTeamForm = false;
  currentLeagueView: 'major' | 'minor' = 'major';

  showEditTeamModal = false;
  editTeamData?: Team;

  // Conference Management
  showAddConferenceForm = false;
  newConferenceName = '';
  
  // Division Management
  showAddDivisionForm = false;
  selectedConferenceForDivision = '';
  newDivisionName = '';

  // Conference structures - will be loaded from database
  majorLeagueConferences: Conference[] = [];
  minorLeagueConferences: Conference[] = [];

  // Default structures (fallback)
  private defaultMajorLeagueConferences: Conference[] = [
    {
      name: 'Mr. Hockey Conference',
      divisions: ['Europe Division', 'Great Lakes Division', 'Atlantic Division']
    },
    {
      name: 'The Rocket Conference',
      divisions: ['Northwest Division', 'Pacific Division', 'South Division']
    }
  ];

  private defaultMinorLeagueConferences: Conference[] = [
    {
      name: 'Development Conference',
      divisions: ['Eastern Development', 'Western Development', 'Central Development']
    },
    {
      name: 'Prospect Conference',
      divisions: ['Northern Prospects', 'Southern Prospects', 'Coastal Prospects']
    }
  ];

  constructor(
    private firestore: Firestore, 
    private router: Router,
    private authService: Auths
  ) {
    this.initializeComponent();
  }

  async initializeComponent() {
    await this.loadConferenceStructures();
    await this.loadTeams();
    this.authService.effectiveRoles.subscribe(roles => {
      this.canManageTeams = roles.some(role => 
        ['developer', 'commissioner'].includes(role)
      );
    });
  }

  get conferences(): Conference[] {
    return this.currentLeagueView === 'major' ? this.majorLeagueConferences : this.minorLeagueConferences;
  }

  get availableConferences(): Conference[] {
    return this.selectedLeague === 'major' ? this.majorLeagueConferences : this.minorLeagueConferences;
  }

  async loadConferenceStructures() {
    try {
      // Load major league conferences
      const majorRef = doc(this.firestore, 'leagueStructure/major');
      const majorSnap = await getDoc(majorRef);
      
      if (majorSnap.exists()) {
        this.majorLeagueConferences = majorSnap.data()['conferences'] || this.defaultMajorLeagueConferences;
      } else {
        this.majorLeagueConferences = this.defaultMajorLeagueConferences;
        await this.saveConferenceStructure('major');
      }

      // Load minor league conferences
      const minorRef = doc(this.firestore, 'leagueStructure/minor');
      const minorSnap = await getDoc(minorRef);
      
      if (minorSnap.exists()) {
        this.minorLeagueConferences = minorSnap.data()['conferences'] || this.defaultMinorLeagueConferences;
      } else {
        this.minorLeagueConferences = this.defaultMinorLeagueConferences;
        await this.saveConferenceStructure('minor');
      }
    } catch (error) {
      console.error('Error loading conference structures:', error);
      // Fallback to defaults
      this.majorLeagueConferences = this.defaultMajorLeagueConferences;
      this.minorLeagueConferences = this.defaultMinorLeagueConferences;
    }
  }

  async saveConferenceStructure(league: 'major' | 'minor') {
    try {
      const structureRef = doc(this.firestore, `leagueStructure/${league}`);
      const conferences = league === 'major' ? this.majorLeagueConferences : this.minorLeagueConferences;
      
      await setDoc(structureRef, {
        conferences: conferences,
        lastUpdated: new Date()
      });
    } catch (error) {
      console.error(`Error saving ${league} league structure:`, error);
    }
  }

  async loadTeams() {
    const teamsRef = collection(this.firestore, 'teams');
    const snapshot = await getDocs(teamsRef);
    this.teams = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      league: doc.data()['league'] || 'major' // Default to major league for existing teams
    } as Team));
  }

  onFileSelected(event: any) {
    this.logoFile = event.target.files[0] || null;
  }

  onEditLogoSelected(event: any) {
    if (this.editTeamData) {
      this.editTeamData.logoFile = event.target.files[0] || null;
    }
  }

  onLeagueChange() {
    // Reset conference and division when league changes
    this.selectedConference = '';
    this.selectedDivision = '';
  }

  async addTeam() {
    if (!this.canManageTeams) return;

    // Check required fields (logo is now optional)
    if (!this.city || !this.mascot || !this.selectedConference || !this.selectedDivision || !this.selectedLeague) {
      alert('City, Mascot, League, Conference, and Division are required.');
      return;
    }

    // Function to create and save team
    const createTeam = async (logoUrl?: string) => {
      const newTeam: Team = {
        city: this.city,
        mascot: this.mascot,
        logoFile: this.logoFile,
        logoUrl: logoUrl || '', // Empty string if no logo
        conference: this.selectedConference,
        division: this.selectedDivision,
        league: this.selectedLeague,
        primaryColor: this.primaryColor,
        secondaryColor: this.secondaryColor,
        tertiaryColor: this.tertiaryColor
      };

      await addDoc(collection(this.firestore, 'teams'), {
        city: newTeam.city,
        mascot: newTeam.mascot,
        logoUrl: newTeam.logoUrl,
        conference: newTeam.conference,
        division: newTeam.division,
        league: newTeam.league,
        name: `${newTeam.city} ${newTeam.mascot}`,
        primaryColor: newTeam.primaryColor,
        secondaryColor: newTeam.secondaryColor,
        tertiaryColor: newTeam.tertiaryColor
      });

      // Reset form
      this.resetForm();
      await this.loadTeams();
    };

    // If logo file is provided, read it and create team with logo
    if (this.logoFile) {
      const reader = new FileReader();
      reader.onload = async () => {
        await createTeam(reader.result as string);
      };
      reader.readAsDataURL(this.logoFile);
    } else {
      // Create team without logo
      await createTeam();
    }
  }

  private resetForm() {
    this.city = '';
    this.mascot = '';
    this.logoFile = null;
    this.selectedConference = '';
    this.selectedDivision = '';
    this.selectedLeague = '';
    this.primaryColor = '#000000';
    this.secondaryColor = '#FFFFFF';
    this.tertiaryColor = '#808080';
    this.showAddTeamForm = false;
  }

  async deleteTeam(id: string) {
    if (!this.canManageTeams) return;

    const team = this.teams.find(t => t.id === id);
    if (!team) return;

    const confirmMessage = `Are you sure you want to delete ${team.city} ${team.mascot}? This action cannot be undone.`;
    if (!confirm(confirmMessage)) return;

    await deleteDoc(doc(this.firestore, `teams/${id}`));
    await this.loadTeams();
  }

  viewTeam(teamId: string) {
    this.router.navigate(['/teams', teamId]);
  }

  getTeamsByDivisionAndLeague(conference: string, division: string, league: string): Team[] {
    return this.teams.filter(t => 
      t.conference === conference && 
      t.division === division && 
      (t.league || 'major') === league
    );
  }

  openEditTeamModal(team: Team) {
    if (!this.canManageTeams) return;
    this.editTeamData = { 
      ...team, 
      logoFile: null,
      league: team.league || 'major',
      primaryColor: team.primaryColor || '#000000',
      secondaryColor: team.secondaryColor || '#FFFFFF',
      tertiaryColor: team.tertiaryColor || '#808080'
    };
    this.showEditTeamModal = true;
  }

  async saveTeamChanges() {
    if (!this.canManageTeams || !this.editTeamData?.id) return;

    const updates: any = {
      city: this.editTeamData.city,
      mascot: this.editTeamData.mascot,
      conference: this.editTeamData.conference,
      division: this.editTeamData.division,
      league: this.editTeamData.league,
      name: `${this.editTeamData.city} ${this.editTeamData.mascot}`,
      primaryColor: this.editTeamData.primaryColor,
      secondaryColor: this.editTeamData.secondaryColor,
      tertiaryColor: this.editTeamData.tertiaryColor
    };

    if (this.editTeamData.logoFile) {
      const reader = new FileReader();
      reader.onload = async () => {
        updates.logoUrl = reader.result as string;
        await updateDoc(doc(this.firestore, `teams/${this.editTeamData!.id}`), updates);
        this.showEditTeamModal = false;
        this.editTeamData = undefined;
        await this.loadTeams();
      };
      reader.readAsDataURL(this.editTeamData.logoFile);
    } else {
      await updateDoc(doc(this.firestore, `teams/${this.editTeamData.id}`), updates);
      this.showEditTeamModal = false;
      this.editTeamData = undefined;
      await this.loadTeams();
    }
  }

  getDivisionsForConference(confName: string): string[] {
    const currentConferences = this.editTeamData?.league === 'minor' ? this.minorLeagueConferences : this.majorLeagueConferences;
    const conf = currentConferences.find(c => c.name === confName);
    return conf?.divisions ?? [];
  }

  async addConference() {
    if (!this.canManageTeams || !this.newConferenceName.trim()) return;
    
    const targetConferences = this.currentLeagueView === 'major' ? this.majorLeagueConferences : this.minorLeagueConferences;
    
    // Check if conference already exists
    if (targetConferences.some(c => c.name === this.newConferenceName)) {
      alert('A conference with this name already exists.');
      return;
    }
    
    targetConferences.push({
      name: this.newConferenceName,
      divisions: []
    });
    
    // Save to database
    await this.saveConferenceStructure(this.currentLeagueView);
    
    this.newConferenceName = '';
    this.showAddConferenceForm = false;
  }

  async addDivision() {
    if (!this.canManageTeams || !this.newDivisionName.trim() || !this.selectedConferenceForDivision) return;
    
    const targetConferences = this.currentLeagueView === 'major' ? this.majorLeagueConferences : this.minorLeagueConferences;
    const conference = targetConferences.find(c => c.name === this.selectedConferenceForDivision);
    
    if (conference) {
      // Check if division already exists in this conference
      if (conference.divisions.includes(this.newDivisionName)) {
        alert('A division with this name already exists in this conference.');
        return;
      }
      
      conference.divisions.push(this.newDivisionName);
      
      // Save to database
      await this.saveConferenceStructure(this.currentLeagueView);
    }
    
    this.newDivisionName = '';
    this.selectedConferenceForDivision = '';
    this.showAddDivisionForm = false;
  }

  async deleteConference(conferenceName: string) {
    if (!this.canManageTeams) return;
    
    const currentLeague = this.currentLeagueView;
    
    // Check if any teams exist in this conference
    if (this.teams.some(t => t.conference === conferenceName && (t.league || 'major') === currentLeague)) {
      alert('Cannot delete conference with existing teams. Please move or delete all teams first.');
      return;
    }

    const confirmMessage = `Are you sure you want to delete the ${conferenceName} from ${currentLeague} league? This action cannot be undone.`;
    if (!confirm(confirmMessage)) return;
    
    if (currentLeague === 'major') {
      this.majorLeagueConferences = this.majorLeagueConferences.filter(c => c.name !== conferenceName);
    } else {
      this.minorLeagueConferences = this.minorLeagueConferences.filter(c => c.name !== conferenceName);
    }
    
    // Save to database
    await this.saveConferenceStructure(currentLeague);
  }

  async deleteDivision(conferenceName: string, divisionName: string) {
    if (!this.canManageTeams) return;
    
    const currentLeague = this.currentLeagueView;
    
    // Check if any teams exist in this division
    if (this.teams.some(t => t.conference === conferenceName && t.division === divisionName && (t.league || 'major') === currentLeague)) {
      alert('Cannot delete division with existing teams. Please move or delete all teams first.');
      return;
    }

    const confirmMessage = `Are you sure you want to delete the ${divisionName} from ${conferenceName} in ${currentLeague} league? This action cannot be undone.`;
    if (!confirm(confirmMessage)) return;
    
    const targetConferences = currentLeague === 'major' ? this.majorLeagueConferences : this.minorLeagueConferences;
    const conference = targetConferences.find(c => c.name === conferenceName);
    
    if (conference) {
      conference.divisions = conference.divisions.filter(d => d !== divisionName);
      
      // Save to database
      await this.saveConferenceStructure(currentLeague);
    }
  }
}