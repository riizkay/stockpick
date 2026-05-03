import type { Generated } from "kysely";

export interface UsersTable {
  id: string;
  user_type: "public" | "internal";
  role_id: string | null;
  email: string;
  full_name: string;
  google_sub: string | null;
  password_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface RolesTable {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermissionsTable {
  id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RolePermissionsTable {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface ItemsTable {
  id: string;
  sku: string;
  name: string;
  minimum_stock: number;
  current_stock: number;
  created_at: string;
  updated_at: string;
}

export interface StockMovementsTable {
  id: string;
  item_id: string;
  movement_type: "in" | "out" | "adjustment";
  quantity: number;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface TopicsTable {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationsTable {
  id: string;
  user_id: string;
  topic_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessagesTable {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  /** kolom JSON: driver bisa kembalikan object setelah dibaca */
  metadata: string | Record<string, unknown> | null;
  created_at: string;
}

export interface StocksTable {
  stock_code: string;
  stock_name: string | null;
  trading_date: string | null;
  previous_price: number | null;
  open_price: number | null;
  first_trade_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number | null;
  change_price: number | null;
  volume: number | null;
  trade_value: number | null;
  frequency: number | null;
  bid_price: number | null;
  bid_volume: number | null;
  offer_price: number | null;
  offer_volume: number | null;
  foreign_buy: number | null;
  foreign_sell: number | null;
  percentage: number | null;
  created_at: string;
  updated_at: string;
}

export interface SectorTable {
  id: Generated<number>;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockSectorTable {
  id: Generated<number>;
  sector_id: number;
  stock_code: string;
  created_at: string;
  updated_at: string;
}

export interface IndustryTable {
  id: Generated<number>;
  sector_id: number | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockIndustryTable {
  id: Generated<number>;
  industry_id: number;
  stock_code: string;
  created_at: string;
  updated_at: string;
}

export interface NewsTable {
  id: number;
  title: string;
  content: string;
  url: string;
  source: string;
  published_date: string;
  category: string;
  summary: string | null;
  author: string | null;
  image_url: string | null;
  qdrant_saved: number;
  created_at: string;
  updated_at: string;
}

export interface Database {
  users: UsersTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  items: ItemsTable;
  stock_movements: StockMovementsTable;
  topics: TopicsTable;
  conversations: ConversationsTable;
  messages: MessagesTable;
  stocks: StocksTable;
  sector: SectorTable;
  stock_sector: StockSectorTable;
  industry: IndustryTable;
  stock_industry: StockIndustryTable;
  news: NewsTable;
}
