import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private readonly sessionSignal = signal<Session | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.sessionSignal());

  constructor() {
    const url = environment.supabaseUrl || 'http://localhost:8000';
    const key = environment.supabaseKey || '';
    this.supabase = createClient(url, key);
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this.sessionSignal.set(session);
    });
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.sessionSignal.set(session);
    });
  }

  async signIn(email: string, password: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  async checkSession(): Promise<boolean> {
    const { data: { session } } = await this.supabase.auth.getSession();
    return !!session;
  }

  getAccessToken(): string | null {
    return this.sessionSignal()?.access_token ?? null;
  }

  getUser(): User | null {
    return this.sessionSignal()?.user ?? null;
  }
}
