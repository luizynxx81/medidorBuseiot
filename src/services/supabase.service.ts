import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

// Define un tipo para nuestros datos de medición para mayor seguridad de tipos
export interface Measurement {
  id: number;
  created_at: string;
  device_id: string;
  datos_sensor: {
    distancia_cm: number;
    alerta: boolean;
  };
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async getInitialData(): Promise<{ latest: Measurement | null; history: Measurement[] }> {
    const { data, error } = await this.supabase
      .from('mediciones_distancia')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching initial data:', error);
      throw error;
    }

    return { latest: data?.[0] ?? null, history: data ?? [] };
  }

  listenToChanges(callback: (payload: Measurement) => void): RealtimeChannel {
    const channel = this.supabase
      .channel('mediciones_distancia_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mediciones_distancia' },
        (payload) => {
          callback(payload.new as Measurement);
        }
      )
      .subscribe();

    return channel;
  }
  
  removeChannel(channel: RealtimeChannel) {
    this.supabase.removeChannel(channel);
  }
}
