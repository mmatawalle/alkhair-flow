
# Al-Khair Drinks & Snacks — V1 Operations System

## Overview
A clean, functional small-business operations web app with production-side inventory, shop-side inventory, purchases, production batches, transfers, sales, expenses, and gifts tracking. Built with React + Supabase (PostgreSQL).

## Authentication
- Simple email/password admin login via Supabase Auth
- Single admin user — no roles system needed for V1
- Protected routes redirect to login page

## Database Schema (Supabase/PostgreSQL)

### Tables
1. **raw_materials** — name, purchase_unit, usage_unit, current_stock (usage unit), average_cost_per_usage_unit, reorder_level, timestamps
2. **products** — name, bottle_size, category, selling_price, production_stock, shop_stock, latest_cost_per_unit, average_cost_per_unit, is_active, timestamps
3. **purchase_records** — raw_material_id (FK), quantity_purchased, purchase_unit, converted_quantity, total_cost, cost_per_usage_unit, purchase_date, supplier, note
4. **production_batches** — batch_code, product_id (FK), quantity_produced, production_date, total_batch_cost, cost_per_unit, note
5. **production_batch_items** — production_batch_id (FK), raw_material_id (FK), quantity_used, unit_cost_used, total_cost
6. **transfer_records** — product_id (FK), production_batch_id (FK, nullable), quantity_transferred, transfer_date, note
7. **sale_records** — product_id (FK), quantity_sold, selling_price_per_unit, total_revenue, cost_per_unit, total_cogs, profit, sale_type (cash/transfer/POS/debt), sale_date, note
8. **expense_records** — expense_side (shop/production), category_code, amount, expense_date, description, requested_by, payment_nature, linked_item
9. **gift_records** — product_id (FK), source_location (production/shop), quantity, gift_date, recipient, reason_category, note

### RLS Policies
- All tables: authenticated users can read/insert/update/delete (single admin for V1)

## Pages & Layout

### Sidebar Navigation
Clean sidebar with icons for each module: Dashboard, Raw Materials, Products, Purchases, Production, Transfers, Sales, Expenses, Gifts

### 1. Dashboard
- KPI cards: Total Purchases, Total Revenue, Total COGS, Total Profit, Low Stock Alerts count
- Low-stock raw materials list
- Production stock vs shop stock summary
- Recent activity panels: purchases, batches, sales, expenses, gifts (last 5 each)

### 2. Raw Materials Page
- Table: name, purchase unit, usage unit, stock (usage unit), avg cost, stock status badge (high/medium/low based on reorder level)
- Add/Edit dialog with form fields
- Stock status computed from reorder_level comparison

### 3. Products Page
- Table: name, bottle size, category, selling price, production stock, shop stock, latest cost, profit per unit, status badge
- Add/Edit dialog

### 4. Purchases Page
- Record purchase form: select raw material, quantity, purchase unit, total cost → auto-calculates converted quantity and cost per usage unit
- **Business logic**: Updates raw_material stock and weighted average cost
- Purchase history table with date filters

### 5. Production Page
- Record batch form: select product, enter quantity produced, then add rows for each raw material used (material, quantity used)
- Auto-calculates total batch cost (sum of material costs using current avg costs) and cost per unit
- **Business logic**: Deducts raw materials from stock, adds to product's production_stock, updates product cost
- Validation: prevents using more material than available
- Batch history table

### 6. Transfers Page
- Transfer form: select product, quantity to transfer from production → shop
- **Business logic**: Decreases production_stock, increases shop_stock
- Validation: can't transfer more than production stock
- Transfer history table

### 7. Sales Page
- Sale form: select product, quantity, selling price (pre-filled), sale type
- Auto-calculates revenue, COGS (using product's average_cost_per_unit), and profit
- **Business logic**: Reduces shop_stock, records sale metrics
- Validation: can't sell more than shop stock
- Sales history table

### 8. Expenses Page
- Expense form: side (shop/production), category, amount, date, description, payment nature
- Expense history with filter by side

### 9. Gifts Page
- Gift form: select product, source location (production/shop), quantity, recipient, reason category
- **Business logic**: Reduces stock from chosen location
- Validation: can't gift more than available stock
- Gift history table

## Business Logic (implemented in React service layer)
- **Weighted average cost** on purchase: `new_avg = (old_stock * old_avg + new_qty * new_cost) / (old_stock + new_qty)`
- **Production cost**: sum of (qty_used × avg_cost) for each material in batch
- **All stock changes** happen via Supabase transactions to maintain consistency
- **Validation** on all forms: no negative stock, required fields, numeric checks

## Design
- Clean white background, minimal card-based layouts
- Shadcn/UI components (already in project)
- Simple color-coded status badges (green/yellow/red for stock levels)
- Responsive sidebar that collapses on mobile

## Seed Data
Pre-populate with the specified raw materials (milk, sugar, coconut flavour, coconut fruit, water, strawberry extract, bottles, caps, stickers) and products (Coconut Milkshake 50cl/35cl, Strawberry Milkshake 50cl/35cl) with realistic starting values.
