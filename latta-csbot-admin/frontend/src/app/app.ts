import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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

  constructor(private dataService: DataService) { }

  ngOnInit() {
    // ✅ TRIGGER GLOBAL PRELOAD
    // this.dataService.loadAllData(); // Handled in DataService constructor
  }
}
