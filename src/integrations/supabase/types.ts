export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      expense_records: {
        Row: {
          amount: number
          category_code: string
          created_at: string
          description: string | null
          expense_date: string
          expense_side: string
          id: string
          linked_item: string | null
          payment_nature: string
          requested_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_code?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_side?: string
          id?: string
          linked_item?: string | null
          payment_nature?: string
          requested_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_code?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_side?: string
          id?: string
          linked_item?: string | null
          payment_nature?: string
          requested_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gift_records: {
        Row: {
          created_at: string
          gift_date: string
          id: string
          note: string | null
          product_id: string
          quantity: number
          reason_category: string
          recipient: string | null
          source_location: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gift_date?: string
          id?: string
          note?: string | null
          product_id: string
          quantity: number
          reason_category?: string
          recipient?: string | null
          source_location?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gift_date?: string
          id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          reason_category?: string
          recipient?: string | null
          source_location?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_batch_items: {
        Row: {
          created_at: string
          id: string
          production_batch_id: string
          quantity_used: number
          raw_material_id: string
          total_cost: number
          unit_cost_used: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          production_batch_id: string
          quantity_used: number
          raw_material_id: string
          total_cost: number
          unit_cost_used: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          production_batch_id?: string
          quantity_used?: number
          raw_material_id?: string
          total_cost?: number
          unit_cost_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_batch_items_production_batch_id_fkey"
            columns: ["production_batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_batch_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      production_batches: {
        Row: {
          batch_code: string
          cost_per_unit: number
          created_at: string
          id: string
          note: string | null
          product_id: string
          production_date: string
          quantity_produced: number
          total_batch_cost: number
          updated_at: string
        }
        Insert: {
          batch_code: string
          cost_per_unit?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          production_date?: string
          quantity_produced: number
          total_batch_cost?: number
          updated_at?: string
        }
        Update: {
          batch_code?: string
          cost_per_unit?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          production_date?: string
          quantity_produced?: number
          total_batch_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_cost_per_unit: number
          bottle_size: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          latest_cost_per_unit: number
          name: string
          production_stock: number
          selling_price: number
          shop_stock: number
          updated_at: string
        }
        Insert: {
          average_cost_per_unit?: number
          bottle_size?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latest_cost_per_unit?: number
          name: string
          production_stock?: number
          selling_price?: number
          shop_stock?: number
          updated_at?: string
        }
        Update: {
          average_cost_per_unit?: number
          bottle_size?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latest_cost_per_unit?: number
          name?: string
          production_stock?: number
          selling_price?: number
          shop_stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      purchase_records: {
        Row: {
          converted_quantity: number
          cost_per_usage_unit: number
          created_at: string
          id: string
          note: string | null
          purchase_date: string
          purchase_unit: string
          quantity_purchased: number
          raw_material_id: string
          supplier: string | null
          total_cost: number
          updated_at: string
        }
        Insert: {
          converted_quantity: number
          cost_per_usage_unit: number
          created_at?: string
          id?: string
          note?: string | null
          purchase_date?: string
          purchase_unit: string
          quantity_purchased: number
          raw_material_id: string
          supplier?: string | null
          total_cost: number
          updated_at?: string
        }
        Update: {
          converted_quantity?: number
          cost_per_usage_unit?: number
          created_at?: string
          id?: string
          note?: string | null
          purchase_date?: string
          purchase_unit?: string
          quantity_purchased?: number
          raw_material_id?: string
          supplier?: string | null
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_records_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          average_cost_per_usage_unit: number
          created_at: string
          current_stock: number
          id: string
          name: string
          purchase_unit: string
          reorder_level: number
          updated_at: string
          usage_unit: string
        }
        Insert: {
          average_cost_per_usage_unit?: number
          created_at?: string
          current_stock?: number
          id?: string
          name: string
          purchase_unit?: string
          reorder_level?: number
          updated_at?: string
          usage_unit?: string
        }
        Update: {
          average_cost_per_usage_unit?: number
          created_at?: string
          current_stock?: number
          id?: string
          name?: string
          purchase_unit?: string
          reorder_level?: number
          updated_at?: string
          usage_unit?: string
        }
        Relationships: []
      }
      sale_records: {
        Row: {
          cost_per_unit: number
          created_at: string
          id: string
          note: string | null
          product_id: string
          profit: number
          quantity_sold: number
          sale_date: string
          sale_type: string
          selling_price_per_unit: number
          total_cogs: number
          total_revenue: number
          updated_at: string
        }
        Insert: {
          cost_per_unit?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          profit?: number
          quantity_sold: number
          sale_date?: string
          sale_type?: string
          selling_price_per_unit: number
          total_cogs?: number
          total_revenue: number
          updated_at?: string
        }
        Update: {
          cost_per_unit?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          profit?: number
          quantity_sold?: number
          sale_date?: string
          sale_type?: string
          selling_price_per_unit?: number
          total_cogs?: number
          total_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_records: {
        Row: {
          created_at: string
          id: string
          note: string | null
          product_id: string
          production_batch_id: string | null
          quantity_transferred: number
          transfer_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          production_batch_id?: string | null
          quantity_transferred: number
          transfer_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          production_batch_id?: string | null
          quantity_transferred?: number
          transfer_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_records_production_batch_id_fkey"
            columns: ["production_batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
