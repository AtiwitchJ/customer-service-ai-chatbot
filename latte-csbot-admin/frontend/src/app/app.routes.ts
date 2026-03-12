import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { ChatLogsComponent } from './pages/chat-logs/chat-logs';
import { FilesComponent } from './pages/files/files';
import { LoginComponent } from './pages/login/login';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
    { path: 'chats', component: ChatLogsComponent, canActivate: [authGuard] },
    { path: 'files', component: FilesComponent, canActivate: [authGuard] },
    { path: '**', redirectTo: 'dashboard' }
];
