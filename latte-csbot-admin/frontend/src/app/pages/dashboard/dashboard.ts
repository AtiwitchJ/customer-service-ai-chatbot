import {
  Component,
  OnInit,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api';
import { DataService, TrendsData, PeakHoursData, TopQuestionsData, UserStatsData, DashboardStats } from '../../services/data';
import Chart from 'chart.js/auto';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';

// ===================
// INTERFACES
// ===================

interface HappinessData {
  score: number;
  status: string;
  emoji: string;
}

// Use DashboardStats from data.ts
interface StatsData extends DashboardStats {
  [key: string]: unknown;
}













interface AnalyticsResponse {
  trends: TrendsData;
  peakHours: PeakHoursData;
  topQuestions: TopQuestionsData;
  userStats: UserStatsData;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface TopQuestionItem {
  question: string;
  text?: string;
  count: number;
  likes?: number;
  dislikes?: number;
}

interface ImportResponse {
  data?: {
    success: number;
    failed: number;
  };
}

// ===================
// COMPONENT
// ===================

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dataService = inject(DataService);

  // ===================
  // SIGNAL STATE
  // ===================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly stats = signal<any>({});
  readonly period = signal<string>('7days');
  readonly loading = signal<boolean>(false);
  readonly happiness = signal<HappinessData>({ score: 0, status: 'N/A', emoji: '😐' });

  // Analytics data signals
  readonly trends = signal<TrendsData>({ sessionTrend: [], feedbackTrend: [] });
  readonly peakHours = signal<PeakHoursData>({ heatmap: [], hourly: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly topQuestions = signal<any[]>([]);
  readonly userStats = signal<UserStatsData>({
    uniqueSessions: 0,
    sessionsPerDay: [],
    avgMessagesPerSession: '0'
  });

  // ===================
  // COMPUTED SIGNALS
  // ===================

  readonly happinessClass = computed(() => {
    const score = this.happiness().score;
    const baseClasses = 'text-xs font-bold px-2 py-1 rounded-lg border flex items-center gap-1';
    return score >= 50
      ? `${baseClasses} bg-green-100 text-green-700 border-green-200`
      : `${baseClasses} bg-red-100 text-red-700 border-red-200`;
  });

  // ===================
  // VIEW CHILDREN
  // ===================

  @ViewChild('wordFreqCanvas') wordFreqCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sessionTrendCanvas') sessionTrendCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('feedbackTrendCanvas') feedbackTrendCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('peakHoursCanvas') peakHoursCanvas!: ElementRef<HTMLCanvasElement>;

  // ===================
  // CHART INSTANCES
  // ===================

  private wordFreqChart: Chart | null = null;
  private sessionTrendChart: Chart | null = null;
  private feedbackTrendChart: Chart | null = null;
  private peakHoursChart: Chart | null = null;

  constructor() {
    // Subscribe to dashboard data with automatic cleanup
    this.dataService.dashboard$
      .pipe(takeUntilDestroyed())
      .subscribe((data) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.stats.set(data as any);
          this.happiness.set(data.happiness ?? { score: 0, status: 'N/A', emoji: '😐' });
          if (data.wordFreq) {
            setTimeout(() => this.renderWordFreqChart(data.wordFreq!), 0);
          }
          this.loading.set(false);
        }
      });
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.loadAnalytics();
  }

  // ===================
  // CHART CLEANUP
  // ===================

  private destroyCharts(): void {
    this.wordFreqChart?.destroy();
    this.sessionTrendChart?.destroy();
    this.feedbackTrendChart?.destroy();
    this.peakHoursChart?.destroy();
    this.wordFreqChart = null;
    this.sessionTrendChart = null;
    this.feedbackTrendChart = null;
    this.peakHoursChart = null;
  }

  // ===================
  // DATA LOADING
  // ===================

  loadAnalytics(): void {
    console.log('[Dashboard] Loading analytics for period:', this.period());
    console.log('[Dashboard] Calling APIs with period:', this.period());

    forkJoin({
      trends: this.dataService.getTrends(this.period()),
      peakHours: this.dataService.getPeakHours(this.period()),
      topQuestions: this.dataService.getTopQuestions(this.period()),
      userStats: this.dataService.getUserStats(this.period())
    }).subscribe({
      next: (res) => {
        console.log('[Dashboard] Analytics loaded:', res);
        this.trends.set(res.trends);
        this.peakHours.set(res.peakHours);
        this.topQuestions.set(res.topQuestions?.topQuestions ?? []);
        this.userStats.set(res.userStats);
        console.log('[Dashboard] trends.sessionTrend:', res.trends?.sessionTrend);
        console.log('[Dashboard] peakHours:', res.peakHours);

        setTimeout(() => {
          console.log('[Dashboard] Rendering charts...');
          this.renderAllCharts();
        }, 100);
      },
      error: (e) => console.error('Analytics load error:', e)
    });
  }

  fetchStats(): void {
    this.dataService.refreshDashboard(this.period());
    this.loadAnalytics();
  }

  refresh(): void {
    this.loading.set(true);
    this.api.post('refresh-stats', {}).subscribe({
      next: () => this.fetchStats(),
      error: () => this.loading.set(false)
    });
  }

  setPeriod(p: string): void {
    console.log('[Dashboard] setPeriod called with:', p);
    this.period.set(p);
    console.log('[Dashboard] period is now:', this.period());
    this.fetchStats();
  }

  // ===================
  // CHART RENDERING
  // ===================

  renderAllCharts(): void {
    this.renderSessionTrendChart();
    this.renderFeedbackTrendChart();
    this.renderPeakHoursChart();
  }

  renderWordFreqChart(data: Record<string, number>): void {
    if (!this.wordFreqCanvas) return;

    const ctx = this.wordFreqCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.wordFreqChart?.destroy();

    const entries = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    this.wordFreqChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: entries.map(([label]) => label),
        datasets: [{
          label: 'Count',
          data: entries.map(([, value]) => value),
          backgroundColor: '#ffe500',
          borderRadius: 6,
          barPercentage: 0.6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { display: false } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  renderSessionTrendChart(): void {
    console.log('[Dashboard] renderSessionTrendChart called');
    console.log('[Dashboard] sessionTrendCanvas:', !!this.sessionTrendCanvas);
    console.log('[Dashboard] sessionTrend:', this.trends().sessionTrend);

    const sessionTrend = this.trends().sessionTrend;
    if (!this.sessionTrendCanvas || sessionTrend.length === 0) {
      console.log('[Dashboard] Skipping session trend chart - no data or canvas');
      return;
    }

    const ctx = this.sessionTrendCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.sessionTrendChart?.destroy();

    this.sessionTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        labels: sessionTrend.map((d: any) => d.date),
        datasets: [{
          label: 'Sessions',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: sessionTrend.map((d: any) => d.count),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  renderFeedbackTrendChart(): void {
    if (!this.feedbackTrendCanvas) return;

    const ctx = this.feedbackTrendCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.feedbackTrendChart?.destroy();

    const currentStats = this.stats();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statsAny = currentStats as any;
    const totalLikes = statsAny.totalLikes ?? 0;
    const totalDislikes = statsAny.totalDislikes ?? 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.feedbackTrendChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Likes', 'Dislikes'],
        datasets: [{
          data: [totalLikes, totalDislikes] as number[],
          backgroundColor: ['#22c55e', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    }) as any;
  }

  renderPeakHoursChart(): void {
    const hourly = this.peakHours().hourly;
    if (!this.peakHoursCanvas || hourly.length === 0) return;

    const ctx = this.peakHoursCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.peakHoursChart?.destroy();

    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const data = hours.map((_, i) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = hourly.find((h: any) => h._id === i);
      return found?.count ?? 0;
    });

    this.peakHoursChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hours,
        datasets: [{
          label: 'Messages',
          data,
          backgroundColor: '#8b5cf6',
          borderRadius: 4,
          barPercentage: 0.8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // ===================
  // UTILITY METHODS
  // ===================

  formatTime(time: string): string {
    if (!time) return '';
    return new Date(time).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  truncateText(text: string, maxLength = 50): string {
    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  }

  // ===================
  // IMPORT / EXPORT
  // ===================

  importJson(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];

    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      Swal.fire({
        title: 'Invalid File',
        text: 'Please select a JSON file (.json)',
        icon: 'error'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result as string;
        const jsonContent = JSON.parse(result);
        const chatCount = Array.isArray(jsonContent)
          ? jsonContent.length
          : (jsonContent.chats?.length ?? 1);

        Swal.fire({
          title: 'Import Chats?',
          text: `Found ${chatCount} chat(s) in the file. Import now?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Import',
          confirmButtonColor: '#3085d6'
        }).then((result) => {
          if (result.isConfirmed) {
            this.uploadJson(jsonContent);
          }
        });
      } catch {
        Swal.fire({
          title: 'Invalid JSON',
          text: 'The file contains invalid JSON data',
          icon: 'error'
        });
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  private uploadJson(data: unknown): void {
    this.loading.set(true);

    this.api.post<ImportResponse>('chats/import', data).subscribe({
      next: (res) => {
        this.loading.set(false);
        const { success = 0, failed = 0 } = res.data ?? {};

        Swal.fire({
          title: 'Import Complete',
          html: `✅ ${success} imported successfully<br>❌ ${failed} failed`,
          icon: failed > 0 ? 'warning' : 'success'
        });

        this.fetchStats();
      },
      error: (err: { message?: string }) => {
        this.loading.set(false);
        Swal.fire({
          title: 'Import Failed',
          text: err.message ?? 'Failed to import chats',
          icon: 'error'
        });
      }
    });
  }

  exportJson(): void {
    this.api.get<unknown>('chats/export').subscribe({
      next: (data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `chats_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      error: (err: { message?: string }) => {
        Swal.fire({
          title: 'Export Failed',
          text: err.message ?? 'Failed to export chats',
          icon: 'error'
        });
      }
    });
  }
}
