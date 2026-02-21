import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ApiService } from '../../services/api';
import { DataService, FileItem } from '../../services/data';
import Swal, { SweetAlertResult } from 'sweetalert2';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

type UploadStatus = 'uploading' | 'processing' | 'embedding' | 'done' | 'error';

interface UploadProgress {
  filename: string;
  percent: number;
  status: UploadStatus;
  error?: string;
  chunkInfo?: string; // e.g. "5/10"
}

interface BulkDeleteResponse {
  deletedCount: number;
}

interface UploadResponse {
  success: boolean;
  count?: number;
}

@Component({
  selector: 'app-files',
  imports: [CommonModule, DatePipe],
  templateUrl: './files.html',
  styleUrl: './files.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesComponent {
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dataService = inject(DataService);

  // Signals for component state
  readonly files = this.dataService.files;
  readonly loading = signal<boolean>(false);
  readonly showUploadModal = signal<boolean>(false);
  readonly isUploading = signal<boolean>(false);

  // Progress State
  readonly fileProgresses = signal<UploadProgress[]>([]);
  readonly overallStatus = signal<string>('');
  readonly successCount = signal<number>(0);
  readonly errorCount = signal<number>(0);

  // Preview
  readonly showPreviewModal = signal<boolean>(false);
  readonly previewTitle = signal<string>('');
  readonly previewContent = signal<SafeResourceUrl | string>('');
  readonly previewType = signal<'image' | 'pdf' | 'other'>('other');
  readonly previewUrl = signal<string>('');

  // Bulk selection
  readonly selectedIds = signal<string[]>([]);

  // Computed signals for derived state
  readonly processingFiles = computed<FileItem[]>(() => {
    const currentFiles = this.files();
    const progresses = this.fileProgresses();

    // Map local progress to match file interface
    const local: FileItem[] = progresses.map(p => ({
      id: 'local-' + p.filename,
      name: p.filename,
      file_path: '',
      status: p.status as FileItem['status'],
      error_message: p.error
    }));

    const remote = currentFiles.filter(
      f => f.status && f.status !== 'done' && f.status !== 'error'
    ).concat(currentFiles.filter(f => f.status === 'error'));

    // Deduplicate: If remote has the file, don't show local
    const allRemoteNames = new Set(currentFiles.map(r => r.name));
    const uniqueLocal = local.filter(l => !allRemoteNames.has(l.name));

    return [...uniqueLocal, ...remote];
  });

  readonly isAllSelected = computed<boolean>(
    () => this.selectedIds().length === this.files().length && this.files().length > 0
  );

  constructor() {
    this.loading.set(true);

    // Subscribe to files updates
    this.dataService.files$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.loading.set(false);
      });

    // Subscribe to loading state when no files
    this.dataService.loading$
      .pipe(takeUntilDestroyed())
      .subscribe((isLoading: boolean) => {
        if (this.files().length === 0) {
          this.loading.set(isLoading);
        }
      });

    // Fallback Polling: Refresh every 3s if files are processing
    interval(3000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        const hasActive = this.files().some(
          f => f.status && f.status !== 'done' && f.status !== 'error'
        );
        if (hasActive) {
          console.log('🔄 Polling for file updates...');
          this.fetchFiles();
        }
      });
  }

  fetchFiles(): void {
    this.dataService.refreshFiles();
  }

  getFileUrl(path: string): string {
    return this.api.apiBaseUrl + '/api/view/' + path;
  }

  // ===================
  // SELECTION
  // ===================

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleSelect(id: string): void {
    const current = this.selectedIds();
    const idx = current.indexOf(id);
    if (idx > -1) {
      this.selectedIds.set([...current.slice(0, idx), ...current.slice(idx + 1)]);
    } else {
      this.selectedIds.set([...current, id]);
    }
  }

  toggleSelectAll(): void {
    const currentFiles = this.files();
    if (this.selectedIds().length === currentFiles.length) {
      this.selectedIds.set([]);
    } else {
      this.selectedIds.set(currentFiles.map(f => f.id));
    }
  }

  // ===================
  // DELETE
  // ===================

  deleteFile(file: FileItem): void {
    Swal.fire({
      title: 'Delete?',
      text: file.name,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        this.api.delete<void>(`files/${file.id}`).subscribe(() => {
          // Remove from local progress to update Queue UI
          this.fileProgresses.update(progresses =>
            progresses.filter(p => p.filename !== file.name)
          );

          this.fetchFiles();
          Swal.fire('Deleted!', '', 'success');
        });
      }
    });
  }

  bulkDelete(): void {
    if (this.selectedIds().length === 0) return;

    Swal.fire({
      title: `Delete ${this.selectedIds().length} files?`,
      text: 'This will also delete associated embeddings',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33'
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        // Get names of files to be deleted for local cleanup
        const currentFiles = this.files();
        const currentSelectedIds = this.selectedIds();
        const filesToDelete = currentFiles.filter(f =>
          currentSelectedIds.includes(f.id)
        );
        const namesToDelete = new Set(filesToDelete.map(f => f.name));

        this.api
          .post<BulkDeleteResponse, { ids: string[] }>('files/bulk-delete', {
            ids: currentSelectedIds
          })
          .subscribe({
            next: (res) => {
              // Remove from local progress
              this.fileProgresses.update(progresses =>
                progresses.filter(p => !namesToDelete.has(p.filename))
              );

              this.selectedIds.set([]);
              this.fetchFiles();
              Swal.fire('Deleted!', `${res.deletedCount} files deleted`, 'success');
            },
            error: (err: Error) => Swal.fire('Error', err.message, 'error')
          });
      }
    });
  }

  preview(file: FileItem): void {
    this.previewTitle.set(file.name);
    const url = this.getFileUrl(file.file_path);
    this.previewUrl.set(url);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    this.showPreviewModal.set(true);

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      this.previewType.set('image');
    } else if (ext === 'pdf') {
      this.previewType.set('pdf');
      this.previewContent.set(
        this.sanitizer.bypassSecurityTrustResourceUrl(url)
      );
    } else {
      this.previewType.set('other');
    }
  }

  closePreview(): void {
    this.showPreviewModal.set(false);
    this.previewContent.set('');
  }

  // ===================
  // UPLOAD
  // ===================

  onFileSelected(input: HTMLInputElement): void {
    if (input.files && input.files.length > 0) {
      // Optional: Auto-scroll to bottom of list or show preview if we implemented it
      // For now, just focus user on the list
    }
  }

  clearCompleted(): void {
    this.fileProgresses.update(progresses =>
      progresses.filter(p => p.status === 'uploading' || p.status === 'embedding')
    );
    if (this.fileProgresses().length === 0) {
      this.successCount.set(0);
      this.errorCount.set(0);
      this.overallStatus.set('');
    }
  }

  async startUpload(fileInput: HTMLInputElement): Promise<void> {
    const files = fileInput.files;
    if (!files?.length) {
      await Swal.fire('Error', 'Please select at least 1 file', 'error');
      return;
    }

    this.isUploading.set(true);
    this.overallStatus.set('Starting upload...');
    const totalFiles = files.length;

    // 1. Create optimistic local progress
    const initialProgresses: UploadProgress[] = [];
    for (let i = 0; i < totalFiles; i++) {
      initialProgresses.push({
        filename: files[i].name,
        percent: 0,
        status: 'uploading'
      });
    }
    this.fileProgresses.set(initialProgresses);

    const formData = new FormData();
    for (let i = 0; i < totalFiles; i++) {
      formData.append('files', files[i]);
    }

    this.api.post<UploadResponse, FormData>('upload/multiple', formData).subscribe({
      next: (res: UploadResponse) => {
        this.isUploading.set(false);

        // Update local status to processing, but DON'T remove yet
        this.fileProgresses.update(progresses =>
          progresses.map(p => ({ ...p, status: 'processing' }))
        );

        this.fetchFiles(); // Force refresh to get new 'processing' records

        if (res.success) {
          Swal.fire({
            title: 'Upload Started',
            text: `Started processing ${res.count} files. You can track status in the list.`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
        } else {
          Swal.fire('Warning', 'Some files might have failed to start', 'warning');
        }
        fileInput.value = '';
        this.overallStatus.set('');
      },
      error: (err: Error) => {
        console.error(err);
        this.isUploading.set(false);

        // Mark local as error instead of clearing, so user sees failure
        this.fileProgresses.update(progresses =>
          progresses.map(p => ({
            ...p,
            status: 'error',
            error: 'Upload request failed'
          }))
        );

        Swal.fire('Error', 'Upload failed to start', 'error');
        this.overallStatus.set('Error starting upload');
      }
    });
  }
}
