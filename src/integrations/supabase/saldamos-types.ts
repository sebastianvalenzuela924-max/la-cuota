// Minimal Saldamos DB types needed for La Cuota integration
export type SaldamosDatabase = {
  public: {
    Tables: {
      groups: {
        Row: { id: string; name: string; currency: string; owner_id: string; created_at: string; updated_at: string };
        Insert: { name: string; currency?: string; owner_id: string; created_at?: string; updated_at?: string };
        Update: { name?: string; currency?: string; owner_id?: string; updated_at?: string };
        Relationships: [];
      };
      group_members: {
        Row: { id: string; group_id: string; name: string; joined_at: string; created_at: string };
        Insert: { group_id: string; name: string; joined_at?: string; created_at?: string };
        Update: { name?: string };
        Relationships: [];
      };
      expenses: {
        Row: { id: string; group_id: string; description: string; total_amount: number; expense_date: string; is_settlement: boolean; is_personal: boolean; category_id: string | null; track_payments: boolean; created_at: string; updated_at: string };
        Insert: { group_id: string; description: string; total_amount: number; expense_date?: string; is_settlement?: boolean; is_personal?: boolean; category_id?: string | null; track_payments?: boolean; created_at?: string; updated_at?: string };
        Update: { description?: string; total_amount?: number; expense_date?: string; is_settlement?: boolean; category_id?: string | null; track_payments?: boolean; updated_at?: string };
        Relationships: [];
      };
      expense_contributions: {
        Row: { id: string; expense_id: string; member_id: string; amount_paid: number; amount_owed: number; is_settled: boolean; created_at: string };
        Insert: { expense_id: string; member_id: string; amount_paid?: number; amount_owed?: number; is_settled?: boolean; created_at?: string };
        Update: { amount_paid?: number; amount_owed?: number; is_settled?: boolean };
        Relationships: [];
      };
      group_collaborators: {
        Row: { id: string; group_id: string; user_id: string; role: string; created_at: string };
        Insert: { group_id: string; user_id: string; role?: string; created_at?: string };
        Update: { role?: string };
        Relationships: [];
      };
      group_activity: {
        Row: { id: string; group_id: string; user_id: string | null; user_name: string; action: string; details: any; created_at: string };
        Insert: { group_id: string; user_id?: string | null; user_name: string; action: string; details?: any; created_at?: string };
        Update: { action?: string; details?: any };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
