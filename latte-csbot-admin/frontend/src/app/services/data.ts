import { Injectable, inject, signal, computed } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ApiService } from './api';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

// ===================
// TYPE DEFINITIONS
// ===================

export interface Message {
  msgId: string;
  sender: 'user' | 'bot';
  text: string;
  image_urls?: string[];
  time: string;
  createdAt?: string;
  feedback?: 'like' | 'dislike' | null;
  _id?: string;
}

export interface Chat {
  _id?: string;
  sessionId: string;
  messages: Message[];
  updatedAt: string;
  createdAt?: string;
  __v?: number;
}

export interface Happiness {
  score: number;
  status: string;
  emoji: string;
}

export interface WordFreq {
  [word: string]: number;
}

export interface DashboardStats {
  totalMessages: number;
  totalLikes: number;
  totalDislikes: number;
  avgResponseTime: string;
  avgSessionDuration: string;
  happiness: Happiness;
  wordFreq: WordFreq;
}

export interface FileItem {
  id: string;
  name: string;
  file_path: string;
  status?: 'uploading' | 'processing' | 'embedding' | 'done' | 'error';
  error_message?: string;
  created_at?: string;
  file_size?: number;
}

export interface SessionTrend {
  date: string;
  count: number;
}

export interface TrendsData {
  sessionTrend: SessionTrend[];
  feedbackTrend: unknown[];
}

export interface PeakHourData {
  _id: number;
  count: number;
}

export interface PeakHoursData {
  heatmap: unknown[];
  hourly: PeakHourData[];
}

export interface TopQuestion {
  question: string;
  text?: string;
  count: number;
  likes?: number;
  dislikes?: number;
}

export interface TopQuestionsData {
  topQuestions: TopQuestion[];
}

export interface SessionsPerDay {
  date: string;
  count: number;
}

export interface UserStatsData {
  uniqueSessions: number;
  sessionsPerDay: SessionsPerDay[];
  avgMessagesPerSession: string;
}

export interface ChatsResponse {
  data: Chat[];
  overview?: {
    totalMessages: number;
    [key: string]: unknown;
  };
}

// ===================
// DEFAULT VALUES
// ===================

const DEFAULT_DASHBOARD: DashboardStats = {
  totalMessages: 0,
  totalLikes: 0,
  totalDislikes: 0,
  avgResponseTime: '0.00',
  avgSessionDuration: '0.00s',
  happiness: { score: 0, status: 'N/A', emoji: '😐' },
  wordFreq: {}
};

const DEFAULT_ANALYTICS = {
  trends: { sessionTrend: [], feedbackTrend: [] } as TrendsData,
  peakHours: { heatmap: [], hourly: [] } as PeakHoursData,
  topQuestions: { topQuestions: [] } as TopQuestionsData,
  users: { uniqueSessions: 0, sessionsPerDay: [], avgMessagesPerSession: '0' } as UserStatsData
};

// ===================
// SERVICE
// ===================

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private readonly api = inject(ApiService);

  // Private writable signals
  private readonly chatsState = signal<Chat[]>([]);
  private readonly filesState = signal<FileItem[]>([]);
  private readonly dashboardState = signal<DashboardStats>(DEFAULT_DASHBOARD);
  private readonly loadingState = signal<boolean>(false);
  private readonly totalChatsState = signal<number>(0);

  // Public readonly signals
  readonly chats = this.chatsState.asReadonly();
  readonly files = this.filesState.asReadonly();
  readonly dashboard = this.dashboardState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly totalChats = this.totalChatsState.asReadonly();

  // Observable exports for backward compatibility (converts signals to observables)
  readonly chats$ = toObservable(this.chatsState);
  readonly files$ = toObservable(this.filesState);
  readonly dashboard$ = toObservable(this.dashboardState);
  readonly loading$ = toObservable(this.loadingState);
  readonly totalChats$ = toObservable(this.totalChatsState);

  // Computed signals for derived state
  readonly hasChats = computed(() => this.chatsState().length > 0);
  readonly chatCount = computed(() => this.chatsState().length);
  readonly hasFiles = computed(() => this.filesState().length > 0);
  readonly fileCount = computed(() => this.filesState().length);
  readonly happinessPercentage = computed(() => Math.round(this.dashboardState().happiness.score * 100));
  readonly hasDashboardData = computed(() => this.dashboardState().totalMessages > 0);

  constructor() {
    this.loadAllData();
  }

  // ===================
  // DATA LOADING
  // ===================

  loadAllData(): void {
    this.setLoading(true);

    this.refreshDashboard();
    this.refreshFiles();
    this.loadChatsWithLimit(10000);
  }

  private loadChatsWithLimit(limit: number): void {
    this.api.get<ChatsResponse>('chats', { limit })
      .pipe(
        catchError(() => of({ data: [], overview: null }))
      )
      .subscribe({
        next: (res) => {
          this.updateChatsState(res.data ?? [], res.overview?.totalMessages ?? 0);
          this.setLoading(false);
        },
        error: () => this.setLoading(false)
      });
  }

  private updateChatsState(chats: Chat[], total: number): void {
    this.chatsState.set(chats);
    this.totalChatsState.set(total);
  }

  private setLoading(isLoading: boolean): void {
    this.loadingState.set(isLoading);
  }

  // ===================
  // REFRESH METHODS
  // ===================

  refreshChats(): void {
    this.loadChatsWithLimit(10000);
  }

  loadMoreChats(currentCount: number, additional: number): void {
    const newLimit = currentCount + additional;
    this.setLoading(true);
    this.api.get<ChatsResponse>('chats', { limit: newLimit }).subscribe({
      next: (res) => {
        this.updateChatsState(res.data ?? [], res.overview?.totalMessages ?? 0);
        this.setLoading(false);
      },
      error: () => this.setLoading(false)
    });
  }

  refreshFiles(): void {
    this.api.get<FileItem[]>('files', { limit: 1000 }).subscribe({
      next: (res) => this.filesState.set(res ?? []),
      error: (err: Error) => console.error('Files load error:', err)
    });
  }

  refreshDashboard(period = '7days'): void {
    this.api.get<DashboardStats>('overview', { period }).subscribe({
      next: (res) => this.dashboardState.set(res ?? DEFAULT_DASHBOARD),
      error: (err: Error) => console.error('Dashboard load error:', err)
    });
  }

  // ===================
  // ANALYTICS APIs
  // ===================

  getTrends(period = '7days'): Observable<TrendsData> {
    return this.api.get<TrendsData>('analytics/trends', { period }).pipe(
      catchError(() => of(DEFAULT_ANALYTICS.trends))
    );
  }

  getPeakHours(period = '7days'): Observable<PeakHoursData> {
    return this.api.get<PeakHoursData>('analytics/peak-hours', { period }).pipe(
      catchError(() => of(DEFAULT_ANALYTICS.peakHours))
    );
  }

  getTopQuestions(period = '7days', limit = 10): Observable<TopQuestionsData> {
    return this.api.get<TopQuestionsData>('analytics/top-questions', { period, limit }).pipe(
      catchError(() => of(DEFAULT_ANALYTICS.topQuestions))
    );
  }

  getUserStats(period = '7days'): Observable<UserStatsData> {
    return this.api.get<UserStatsData>('analytics/users', { period }).pipe(
      catchError(() => of(DEFAULT_ANALYTICS.users))
    );
  }
}
