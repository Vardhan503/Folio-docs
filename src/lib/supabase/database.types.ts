// Mirrors supabase/migrations/001_initial_schema.sql. Keep in sync with the schema,
// or regenerate with `npx supabase gen types typescript`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DocumentShareRole = "viewer" | "editor";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          content: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title?: string;
          content?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          content?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_shares: {
        Row: {
          document_id: string;
          user_id: string;
          role: DocumentShareRole;
          created_at: string;
        };
        Insert: {
          document_id: string;
          user_id: string;
          role?: DocumentShareRole;
          created_at?: string;
        };
        Update: {
          document_id?: string;
          user_id?: string;
          role?: DocumentShareRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_shares_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database["public"]["Tables"];

export type ProfileRow = PublicTables["profiles"]["Row"];
export type DocumentRow = PublicTables["documents"]["Row"];
export type DocumentShareRow = PublicTables["document_shares"]["Row"];
