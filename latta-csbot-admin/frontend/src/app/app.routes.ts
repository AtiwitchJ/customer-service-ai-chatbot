import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { ChatLogsComponent } from './pages/chat-logs/chat-logs';
import { FilesComponent } from './pages/files/files';

export const routes: Routes = [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: 'dashboard', component: DashboardComponent },
    { path: 'chats', component: ChatLogsComponent },
    { path: 'files', component: FilesComponent },
    { path: '**', redirectTo: 'dashboard' }
];
