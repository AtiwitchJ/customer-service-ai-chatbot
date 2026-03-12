import { Component, signal, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Sidebar } from './components/sidebar/sidebar';
import { DataService } from './services/data';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Sidebar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('combined-admin-rag');
  protected readonly showSidebar = signal(true);
  private router = inject(Router);

  constructor(private dataService: DataService) {
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe(() => {
      this.showSidebar.set(!this.router.url.includes('/login'));
    });
    this.showSidebar.set(!this.router.url.includes('/login'));
  }

  ngOnInit() {
    // ✅ TRIGGER GLOBAL PRELOAD
  }
}
