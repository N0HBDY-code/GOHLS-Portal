import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Dashboard } from './dashboard/dashboard';
import { Register } from './register/register';
import { VerifyEmail } from './verify-email/verify-email';
import { ForgotPassword} from './forgot-password/forgot-password';
import { Games } from './games/games';
import { Analytics} from './analytics/analytics';
import { Teams } from './teams/teams';
import { Players } from './players/players';
import { PlayerManager } from './player-manager/player-manager';
import { ProgressionTracker } from './progression-tracker/progression-tracker';
import { GameDetail } from './game-detail/game-detail';
import { Headquarters } from './headquarters/headquarters';
import { Draft } from './draft/draft';
import { RoleGuard } from './role.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo:'login',
        pathMatch: 'full'
    },
    {
        path: 'login',
        component: Login,
        title: 'Login'
    },
    {
        path: 'dashboard',
        component: Dashboard,
        title: 'Dashboard'
    },
    {
        path: 'register',
        component: Register,
        title: 'Register'
    },
    {
        path: 'verify-email',
        component: VerifyEmail
    },
    {
        path: 'forgot-password',
        component: ForgotPassword
    },
    {
        path:'analytics',
        component: Analytics,
        title: 'Stats and Standings'
    },
    {
        path:'games',
        component: Games,
        title: 'Games'
    },
    {
        path: 'games/:teamId/:gameId',
        component: GameDetail,
        title: 'Game Details'
    },
    {
        path: 'teams',
        loadComponent: () => import('./teams/teams').then(m => m.Teams),
        title: 'Teams'
    },
    {
        path: 'teams/:id',
        loadComponent: () =>
          import('./team-detail/team-detail').then(m => m.TeamDetail),
        title: 'Team Details'
    },
    {
        path:'player',
        component: Players,
        title:'Player'
    },
    {
        path: 'headquarters',
        loadComponent: () => import('./headquarters/headquarters').then(m => m.Headquarters),
        title: 'Headquarters',
        canActivate: [RoleGuard(['developer', 'commissioner'])]  
    },
    {
        path: 'progression-tracker',
        loadComponent: () => import('./progression-tracker/progression-tracker').then(m => m.ProgressionTracker),
        title: 'Progression Tracker',
        canActivate: [RoleGuard(['developer', 'commissioner', 'progression tracker'])]
    },
    {
        path: 'draft',
        loadComponent: () => import('./draft/draft').then(m => m.Draft),
        title: 'Draft Central',
        canActivate: [RoleGuard(['developer', 'commissioner', 'gm'])]
    }
];