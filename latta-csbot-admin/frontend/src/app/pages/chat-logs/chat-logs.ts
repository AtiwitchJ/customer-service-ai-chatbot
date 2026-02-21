/**
 * CHAT LOGS PAGE COMPONENT
 * ========================
 * Features: View, Delete, Bulk Delete chat logs
 * ฟีเจอร์: ดู, ลบ, ลบหลายรายการ
 */

import {
    Component,
    ChangeDetectionStrategy,
    signal,
    computed,
    inject
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ApiService } from '../../services/api';
import { DataService, Chat, Message } from '../../services/data';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';

interface MonthGroup {
    name: string;
    chats: Chat[];
}

type GroupedChat =
    | { type: 'day'; title: string; chats: Chat[] }
    | { type: 'year'; title: string; months: MonthGroup[]; count: number };

@Component({
    selector: 'app-chat-logs',
    imports: [CommonModule, FormsModule, DatePipe],
    templateUrl: './chat-logs.html',
    styleUrl: './chat-logs.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatLogsComponent {
    private readonly api = inject(ApiService);
    private readonly dataService = inject(DataService);

    // State signals
    readonly allChats = signal<Chat[]>([]);
    readonly chats = signal<Chat[]>([]);
    readonly selectedChat = signal<Chat | null>(null);
    readonly loading = signal<boolean>(true);
    readonly selectedIds = signal<string[]>([]);
    readonly filterStart = signal<string>('');
    readonly filterEnd = signal<string>('');
    readonly filterFeedback = signal<string>('');
    readonly mobileFilterOpen = signal<boolean>(false);
    readonly showMobileDetail = signal<boolean>(false);
    readonly totalAvailable = signal<number>(0);

    readonly page = 1;
    readonly limit = 10000;

    // Computed signals
    readonly groupedChats = computed<GroupedChat[]>(() => this.buildGroupedChats());
    readonly filteredMessages = computed<Message[]>(() => {
        const chat = this.selectedChat();
        const feedbackFilter = this.filterFeedback();

        if (!chat) return [];

        let msgs = chat.messages || [];

        if (feedbackFilter && feedbackFilter !== '') {
            msgs = msgs.filter((m: Message) => m.feedback === feedbackFilter);
        }

        return msgs;
    });

    constructor() {
        this.setDefaultDate();

        this.dataService.chats$
            .pipe(takeUntilDestroyed())
            .subscribe(data => {
                this.allChats.set(data || []);
                this.applyLocalFilter();
                this.loading.set(false);
            });

        this.dataService.totalChats$
            .pipe(takeUntilDestroyed())
            .subscribe(total => {
                this.totalAvailable.set(total);
            });

        this.dataService.loading$
            .pipe(takeUntilDestroyed())
            .subscribe(isLoading => {
                if (this.allChats().length === 0) {
                    this.loading.set(isLoading);
                }
            });
    }

    setDefaultDate(): void {
        const now = new Date();
        this.filterEnd.set(now.toLocaleString('sv').split(' ')[0]);
    }

    // ===================
    // FILTERING
    // ===================

    applyLocalFilter(): void {
        const all = this.allChats();
        const start = this.filterStart();
        const end = this.filterEnd();
        const feedback = this.filterFeedback();

        let filtered = [...all];

        if (start || end) {
            const startTime = start ? new Date(start).getTime() : 0;
            const endTime = end ? new Date(end).setHours(23, 59, 59, 999) : 9999999999999;
            filtered = filtered.filter(c => {
                const time = new Date(c.updatedAt).getTime();
                return time >= startTime && time <= endTime;
            });
        }

        if (feedback && feedback !== '') {
            filtered = filtered.filter(c =>
                c.messages.some((m: Message) => m.feedback === feedback)
            );
        }

        this.chats.set(filtered);
    }

    applyFilter(): void {
        this.applyLocalFilter();
        this.mobileFilterOpen.set(false);
    }

    resetFilter(): void {
        this.filterStart.set('');
        this.filterFeedback.set('');
        this.setDefaultDate();
        this.applyLocalFilter();
    }

    // ===================
    // SELECTION
    // ===================

    isSelected(id: string): boolean {
        return this.selectedIds().includes(id);
    }

    toggleSelect(id: string): void {
        this.selectedIds.update(ids => {
            const idx = ids.indexOf(id);
            if (idx > -1) {
                return [...ids.slice(0, idx), ...ids.slice(idx + 1)];
            }
            return [...ids, id];
        });
    }

    // ===================
    // DELETE
    // ===================

    deleteChat(sessionId: string): void {
        Swal.fire({
            title: 'Delete this chat?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33'
        }).then((result) => {
            if (result.isConfirmed) {
                this.api.delete(`chats/${sessionId}`).subscribe({
                    next: () => {
                        this.selectedChat.set(null);
                        this.dataService.refreshChats();
                        Swal.fire('Deleted!', '', 'success');
                    },
                    error: (err: Error) => Swal.fire('Error', err.message, 'error')
                });
            }
        });
    }

    bulkDelete(): void {
        const ids = this.selectedIds();
        if (ids.length === 0) return;

        // selectedIds เก็บ sessionId อยู่แล้ว
        const sessionIds = ids;

        Swal.fire({
            title: `Delete ${sessionIds.length} chats?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33'
        }).then((result) => {
            if (result.isConfirmed) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.api.post<any>('chats/bulk-delete', { ids: sessionIds }).subscribe({
                    next: (res) => {
                        this.selectedIds.set([]);
                        this.selectedChat.set(null);
                        this.dataService.refreshChats();
                        Swal.fire('Deleted!', `${res.deletedCount} chats deleted`, 'success');
                    },
                    error: (err: Error) => Swal.fire('Error', err.message, 'error')
                });
            }
        });
    }

    // ===================
    // GROUPING
    // ===================

    private buildGroupedChats(): GroupedChat[] {
        const currentChats = this.chats();
        if (!currentChats.length) return [];

        const specialGroups: Record<string, Chat[]> = {};
        const yearGroups: Record<number, Record<number, Chat[]>> = {};
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA');
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');
        const monthNames = [
            "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
            "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
        ];

        currentChats.forEach(chat => {
            const chatDate = new Date(chat.updatedAt);
            const dateStr = chatDate.toLocaleDateString('en-CA');
            const year = chatDate.getFullYear();
            const monthIdx = chatDate.getMonth();

            if (dateStr === todayStr) {
                if (!specialGroups['วันนี้']) specialGroups['วันนี้'] = [];
                specialGroups['วันนี้'].push(chat);
            } else if (dateStr === yesterdayStr) {
                if (!specialGroups['เมื่อวาน']) specialGroups['เมื่อวาน'] = [];
                specialGroups['เมื่อวาน'].push(chat);
            } else {
                if (!yearGroups[year]) yearGroups[year] = {};
                if (!yearGroups[year][monthIdx]) yearGroups[year][monthIdx] = [];
                yearGroups[year][monthIdx].push(chat);
            }
        });

        const grouped: GroupedChat[] = [];
        ['วันนี้', 'เมื่อวาน'].forEach(key => {
            if (specialGroups[key]) {
                grouped.push({ type: 'day', title: key, chats: specialGroups[key] });
            }
        });

        Object.keys(yearGroups)
            .sort((a, b) => parseInt(b) - parseInt(a))
            .forEach(year => {
                const months: MonthGroup[] = [];
                Object.keys(yearGroups[Number(year)])
                    .sort((a, b) => parseInt(b) - parseInt(a))
                    .forEach(monthIdx => {
                        months.push({
                            name: monthNames[parseInt(monthIdx)],
                            chats: yearGroups[Number(year)][Number(monthIdx)]
                        });
                    });
                const totalYearChats = months.reduce((acc, m) => acc + m.chats.length, 0);
                grouped.push({
                    type: 'year',
                    title: year,
                    months,
                    count: totalYearChats
                });
            });

        return grouped;
    }

    // ===================
    // NAVIGATION
    // ===================

    selectChat(chat: Chat): void {
        this.selectedChat.set(chat);
        this.showMobileDetail.set(true);
    }

    closeMobileDetail(): void {
        this.showMobileDetail.set(false);
    }

    loadChats(reset = false): void {
        this.dataService.refreshChats();
    }

    loadMore(): void {
        this.dataService.loadMoreChats(this.allChats().length, 2000);
    }

    // Helpers for template to avoid arrow functions
    hasFeedback(chat: Chat): boolean {
        return chat.messages?.some((m: Message) => m.feedback) ?? false;
    }

    hasLike(chat: Chat): boolean {
        return chat.messages?.some((m: Message) => m.feedback === 'like') ?? false;
    }

    hasDislike(chat: Chat): boolean {
        return chat.messages?.some((m: Message) => m.feedback === 'dislike') ?? false;
    }
}
