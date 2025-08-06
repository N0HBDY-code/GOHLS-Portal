import { Component, inject, OnInit } from '@angular/core';
import { Firestore, collection, getDocs, CollectionReference, DocumentData } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Team {
  id: string;
  name: string;
}

interface Game {
  id: string;
  [key: string]: any;
}

interface Player {
  id: string;
  name?: string;
  number?: number;
  position?: string;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class Reports implements OnInit {
  private firestore: Firestore = inject(Firestore);

  teams: Team[] = [];
  games: Game[] = [];

  selectedTeamId = '';
  selectedGameId = '';

  async ngOnInit() {
    await this.loadTeams();
  }

  async loadTeams() {
    const teamsRef = collection(this.firestore, 'teams') as CollectionReference<DocumentData>;
    const snapshot = await getDocs(teamsRef);
    this.teams = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data()['name'] || 'Unnamed' }));
  }

  async onTeamSelect() {
    if (!this.selectedTeamId) return;
    const gamesRef = collection(this.firestore, `teams/${this.selectedTeamId}/games`) as CollectionReference<DocumentData>;
    const snapshot = await getDocs(gamesRef);
    this.games = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  
    async exportSelectedGameToCSV() {
      if (!this.selectedTeamId || !this.selectedGameId) return;

      const team = this.teams.find(t => t.id === this.selectedTeamId);
      const game = this.games.find(g => g.id === this.selectedGameId);
      if (!game) return;

      const rosterSnap = await getDocs(collection(this.firestore, `teams/${this.selectedTeamId}/roster`));
      const statsSnap = await getDocs(collection(this.firestore, `teams/${this.selectedTeamId}/games/${this.selectedGameId}/stats`));

      const roster = rosterSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const statsMap = Object.fromEntries(statsSnap.docs.map(doc => [doc.id, doc.data()]));

      const headers = ["Team", "Game Date", "Opponent", "Player Name", "Number", "Position", "Points", "Assists", "Rebounds", "Score"];
      const rows: string[] = [];

      let totalPoints = 0;
      for (const player of roster) {
        const stats = statsMap[player.id] || { points: 0, assists: 0, rebounds: 0 };
        totalPoints += stats["points"];

        const dateStr = game["date"]?.toDate?.() ? game["date"].toDate().toISOString().split("T")[0] : game["date"];
        const row = [
          team?.name || "",
          dateStr,
          game["opponent"] || "",
          (player as any)["name"],
          (player as any)["number"],
          (player as any)["position"],
          stats["points"],
          stats["assists"],
          stats["rebounds"],
          ""  // placeholder for score
        ];
        rows.push(row.map(val => `"${val}"`).join(","));
      }

      const score = `${totalPoints}-??`;
      const finalRows = rows.map(r => r.replace(/,""$/, `,"${score}"`));
      const csv = [headers.join(","), ...finalRows].join("\n");
      this.downloadCSV(csv, `game_${this.selectedGameId}_players.csv`);
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
    
}