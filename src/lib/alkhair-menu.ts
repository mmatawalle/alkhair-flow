import { supabase } from "@/integrations/supabase/client";
import { setMaterialImageFallback } from "@/lib/raw-material-images";

export interface MenuItemSeed {
  name: string;
  category: string;
  type: "drinks" | "snacks";
  bottle_size: string;
  selling_price: number;
  image_url: string;
  description?: string;
  // Standard production recipe: which raw materials and default amounts per 1 unit produced
  default_recipe?: Array<{
    material_name: string;
    quantity_per_unit: number; // e.g. 0.04 mudu per bottle
    usage_unit: string;
  }>;
}

export const ALL_MENU_CATEGORIES = [
  // Drinks
  "Signature Milkshake Series",
  "Milk Series",
  "Yoghurt Series",
  "Fresh & Natural Series",
  "Native Series",
  "Healthy Series",
  "Slush Series",
  // Snacks
  "Classic Snacks",
  "Native Snacks",
  "Ice Cream",
] as const;

export const DRINK_CATEGORIES = [
  "Signature Milkshake Series",
  "Milk Series",
  "Yoghurt Series",
  "Fresh & Natural Series",
  "Native Series",
  "Healthy Series",
  "Slush Series",
];

export const SNACK_CATEGORIES = [
  "Classic Snacks",
  "Native Snacks",
  "Ice Cream",
];

export const AL_KHAIR_MENU: MenuItemSeed[] = [
  // ==================== 1. SIGNATURE MILKSHAKE SERIES ====================
  {
    name: "Coconut Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
    description: "Creamy tropical coconut blended shake",
  },
  {
    name: "Cappuccino Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80",
    description: "Rich Italian cappuccino coffee blended shake",
  },
  {
    name: "Chocolate Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80",
    description: "Decadent Dutch cocoa chocolate milkshake",
  },
  {
    name: "Banana Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1553787499-6f9133860278?auto=format&fit=crop&w=600&q=80",
    description: "Smooth ripe banana milkshake",
  },
  {
    name: "Vanilla Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?auto=format&fit=crop&w=600&q=80",
    description: "Classic Madagascar vanilla bean milkshake",
  },
  {
    name: "Strawberry Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&w=600&q=80",
    description: "Fresh strawberry cream milkshake",
  },
  {
    name: "Oreo Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80",
    description: "Cookies and cream crushed Oreo shake",
  },
  {
    name: "Lotus Milkshake",
    category: "Signature Milkshake Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
    description: "Caramelized Lotus Biscoff biscuit shake",
  },

  // ==================== 2. MILK SERIES ====================
  {
    name: "Dates Milk",
    category: "Milk Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80",
    description: "Sweet Arabian dates blended with whole fresh milk",
    default_recipe: [
      { material_name: "Dried Dates (Dabino)", quantity_per_unit: 0.05, usage_unit: "mudu" },
      { material_name: "Fresh Whole Milk", quantity_per_unit: 0.5, usage_unit: "bottle" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },

  // ==================== 3. YOGHURT SERIES ====================
  {
    name: "Strawberry Yoghurt",
    category: "Yoghurt Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80",
    description: "Cultured strawberry drinking yoghurt",
  },
  {
    name: "Vanilla Yoghurt",
    category: "Yoghurt Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1571212515416-fef01fc43637?auto=format&fit=crop&w=600&q=80",
    description: "Sweet vanilla drinking yoghurt",
  },

  // ==================== 4. FRESH & NATURAL SERIES ====================
  {
    name: "Pineapple Juice",
    category: "Fresh & Natural Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?auto=format&fit=crop&w=600&q=80",
    description: "100% natural tropical pineapple juice",
  },
  {
    name: "Mango Juice",
    category: "Fresh & Natural Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80",
    description: "Sweet golden mango puree nectar",
  },
  {
    name: "Orange Juice",
    category: "Fresh & Natural Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80",
    description: "Freshly squeezed citrus orange juice",
  },
  {
    name: "Pineapple & Ginger",
    category: "Fresh & Natural Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?auto=format&fit=crop&w=600&q=80",
    description: "Zesty sweet pineapple infused with fresh ginger kick",
    default_recipe: [
      { material_name: "Fresh Ginger (Citta)", quantity_per_unit: 0.03, usage_unit: "mudu" },
      { material_name: "Granulated Sugar (Sukari)", quantity_per_unit: 0.02, usage_unit: "mudu" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },
  {
    name: "Hydra Cool",
    category: "Fresh & Natural Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1500,
    image_url: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
    description: "Cucumber, lemon & mint hydrator drink",
  },
  {
    name: "Mint",
    category: "Fresh & Natural Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1500,
    image_url: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
    description: "Iced crisp garden mint refresher",
  },
  {
    name: "Melon",
    category: "Fresh & Natural Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1200,
    image_url: "https://images.unsplash.com/photo-1563227812-0ea4c22e6cc8?auto=format&fit=crop&w=600&q=80",
    description: "Cold pressed sweet watermelon cooler",
  },

  // ==================== 5. NATIVE SERIES ====================
  {
    name: "Fura",
    category: "Native Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
    description: "Spiced millet dumplings blended in thick cultured milk (Fura da Nono)",
    default_recipe: [
      { material_name: "Fura Grains / Millet", quantity_per_unit: 0.05, usage_unit: "mudu" },
      { material_name: "Fresh Whole Milk", quantity_per_unit: 0.5, usage_unit: "bottle" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },
  {
    name: "Tiger Milk",
    category: "Native Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1500,
    image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
    description: "Kunun Aya – sweet tiger nut milk with dates and ginger",
    default_recipe: [
      { material_name: "Tiger Nuts (Aya)", quantity_per_unit: 0.06, usage_unit: "mudu" },
      { material_name: "Dried Dates (Dabino)", quantity_per_unit: 0.03, usage_unit: "mudu" },
      { material_name: "Fresh Ginger (Citta)", quantity_per_unit: 0.01, usage_unit: "mudu" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },
  {
    name: "Mr. Zobs",
    category: "Native Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1000,
    image_url: "/presets/raw-materials/hibiscus_zobo.jpg",
    description: "Al-Khair Signature Zobo – brewed crimson hibiscus with ginger and cloves",
    default_recipe: [
      { material_name: "Zobo / Hibiscus (Karkadeh)", quantity_per_unit: 0.04, usage_unit: "mudu" },
      { material_name: "Fresh Ginger (Citta)", quantity_per_unit: 0.015, usage_unit: "mudu" },
      { material_name: "Cloves (Kanunfari)", quantity_per_unit: 0.005, usage_unit: "mudu" },
      { material_name: "Granulated Sugar (Sukari)", quantity_per_unit: 0.03, usage_unit: "mudu" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },
  {
    name: "Ginger",
    category: "Native Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1500,
    image_url: "/presets/raw-materials/ginger_root.jpg",
    description: "Intense natural ginger drink with natural honey and lemon",
    default_recipe: [
      { material_name: "Fresh Ginger (Citta)", quantity_per_unit: 0.08, usage_unit: "mudu" },
      { material_name: "Cloves (Kanunfari)", quantity_per_unit: 0.005, usage_unit: "mudu" },
      { material_name: "Granulated Sugar (Sukari)", quantity_per_unit: 0.03, usage_unit: "mudu" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },
  {
    name: "Tamarind",
    category: "Native Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?auto=format&fit=crop&w=600&q=80",
    description: "Tsamiya – sweet and sour iced tamarind pulp drink",
    default_recipe: [
      { material_name: "Tamarind (Tsamiya)", quantity_per_unit: 0.05, usage_unit: "mudu" },
      { material_name: "Granulated Sugar (Sukari)", quantity_per_unit: 0.03, usage_unit: "mudu" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },
  {
    name: "Baobab",
    category: "Native Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80",
    description: "Kuka – rich cream of baobab fruit pulp with Vitamin C",
    default_recipe: [
      { material_name: "Baobab Pulp (Kuka)", quantity_per_unit: 0.05, usage_unit: "mudu" },
      { material_name: "Granulated Sugar (Sukari)", quantity_per_unit: 0.03, usage_unit: "mudu" },
      { material_name: "PET Beverage Bottles", quantity_per_unit: 1, usage_unit: "bottle" },
      { material_name: "Bottle Caps & Seal Liners", quantity_per_unit: 1, usage_unit: "pcs" },
    ],
  },

  // ==================== 6. HEALTHY SERIES ====================
  {
    name: "Golden Milk",
    category: "Healthy Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
    description: "Turmeric, ginger & warm spiced wholesome milk",
  },
  {
    name: "Dates Royale",
    category: "Healthy Series",
    type: "drinks",
    bottle_size: "50cl",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&w=600&q=80",
    description: "Energy-packed dates and honey infusion",
  },

  // ==================== 7. SLUSH SERIES ====================
  {
    name: "Slush (Small Cup)",
    category: "Slush Series",
    type: "drinks",
    bottle_size: "Small Cup",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80",
    description: "Ice cold blended fruit slushie in small cup",
  },
  {
    name: "Slush (Large Cup)",
    category: "Slush Series",
    type: "drinks",
    bottle_size: "Large Cup",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80",
    description: "Ice cold blended fruit slushie in large jumbo cup",
  },

  // ==================== 8. CLASSIC SNACKS ====================
  {
    name: "Samosa",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 400,
    image_url: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
    description: "Golden fried crispy pastry stuffed with spiced meat",
  },
  {
    name: "Spring Rolls",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 400,
    image_url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80",
    description: "Crispy fried rolls with seasoned vegetables and chicken",
  },
  {
    name: "Cookies",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=600&q=80",
    description: "Freshly baked artisan cookies pack",
  },
  {
    name: "Sandwich",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 1800,
    image_url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80",
    description: "Toasted club sandwich with premium fillings",
  },
  {
    name: "Cupcake",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 1200,
    image_url: "https://images.unsplash.com/photo-1587668178277-295251f900ce?auto=format&fit=crop&w=600&q=80",
    description: "Moist bakery cupcake with rich swirl frosting",
  },
  {
    name: "Shawarma",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=600&q=80",
    description: "Loaded flatbread wrap with grilled spiced meat and creamy sauce",
  },
  {
    name: "Egg Roll",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=600&q=80",
    description: "Fluffy fried dough casing a whole boiled egg",
  },
  {
    name: "Chicken Roll",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=600&q=80",
    description: "Savory seasoned minced chicken baked in pastry",
  },
  {
    name: "Meat Pie",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 1200,
    image_url: "https://images.unsplash.com/photo-1579372786545-d24232daf58c?auto=format&fit=crop&w=600&q=80",
    description: "Flaky golden crust stuffed with spiced minced meat and diced potatoes",
  },
  {
    name: "Doughnut",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "pcs",
    selling_price: 500,
    image_url: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
    description: "Soft glazed ring doughnut",
  },
  {
    name: "Cake Parfait",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "cup",
    selling_price: 2500,
    image_url: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=600&q=80",
    description: "Layered sponge cake cup with whipped cream and fruit coulis",
  },
  {
    name: "Chicken Wings",
    category: "Classic Snacks",
    type: "snacks",
    bottle_size: "portion",
    selling_price: 3500,
    image_url: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80",
    description: "Crispy fried or glazed spicy chicken wings portion",
  },

  // ==================== 9. NATIVE SNACKS ====================
  {
    name: "Gullisuwa",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80",
    description: "Northern dried sweet fried milk candy balls",
  },
  {
    name: "Fara",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "portion",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80",
    description: "Traditional northern seasoned delicacy",
  },
  {
    name: "Tsami Gaye",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
    description: "Sweet spiced native northern crunchy snack",
  },
  {
    name: "Gireva",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 2000,
    image_url: "https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80",
    description: "Traditional northern confection snack",
  },
  {
    name: "Iloka",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?auto=format&fit=crop&w=600&q=80",
    description: "Native northern snack",
  },
  {
    name: "Albishir",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
    description: "Traditional sweet northern snack",
  },
  {
    name: "Aya",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
    description: "Roasted and seasoned dried tiger nuts pack",
  },
  {
    name: "Milk Candy",
    category: "Native Snacks",
    type: "snacks",
    bottle_size: "pack",
    selling_price: 1000,
    image_url: "https://images.unsplash.com/photo-1582293041079-7814c2f12063?auto=format&fit=crop&w=600&q=80",
    description: "Tuwon Madara – chewy sweet whole milk fudge candy",
  },

  // ==================== 10. ICE CREAM ====================
  {
    name: "Ice Cream (Cup)",
    category: "Ice Cream",
    type: "snacks",
    bottle_size: "cup",
    selling_price: 3500,
    image_url: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80",
    description: "Creamy gourmet ice cream cup",
  },
  {
    name: "Ice Cream (Cone)",
    category: "Ice Cream",
    type: "snacks",
    bottle_size: "cone",
    selling_price: 4000,
    image_url: "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=600&q=80",
    description: "Waffle cone double scoop gourmet ice cream",
  },
];

export const CORE_RAW_MATERIALS = [
  {
    name: "Zobo / Hibiscus (Karkadeh)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 50,
    average_cost_per_usage_unit: 1200,
    reorder_level: 10,
    image_url: "/presets/raw-materials/hibiscus_zobo.jpg",
  },
  {
    name: "Fresh Ginger (Citta)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 40,
    average_cost_per_usage_unit: 1500,
    reorder_level: 8,
    image_url: "/presets/raw-materials/ginger_root.jpg",
  },
  {
    name: "Cloves (Kanunfari)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 15,
    average_cost_per_usage_unit: 4500,
    reorder_level: 3,
    image_url: "/presets/raw-materials/cloves_spice.jpg",
  },
  {
    name: "Granulated Sugar (Sukari)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 60,
    average_cost_per_usage_unit: 2200,
    reorder_level: 15,
    image_url: "/presets/raw-materials/granulated_sugar.jpg",
  },
  {
    name: "Tiger Nuts (Aya)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 35,
    average_cost_per_usage_unit: 2000,
    reorder_level: 8,
    image_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80",
  },
  {
    name: "Dried Dates (Dabino)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 25,
    average_cost_per_usage_unit: 3000,
    reorder_level: 5,
    image_url: "https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&w=500&q=80",
  },
  {
    name: "PET Beverage Bottles",
    purchase_unit: "carton",
    usage_unit: "bottle",
    current_stock: 500,
    average_cost_per_usage_unit: 120,
    reorder_level: 100,
    image_url: "/presets/raw-materials/pet_bottles.jpg",
  },
  {
    name: "Bottle Caps & Seal Liners",
    purchase_unit: "bag",
    usage_unit: "pcs",
    current_stock: 800,
    average_cost_per_usage_unit: 25,
    reorder_level: 150,
    image_url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=500&q=80",
  },
  {
    name: "Roll Labels & Stickers",
    purchase_unit: "roll",
    usage_unit: "pcs",
    current_stock: 600,
    average_cost_per_usage_unit: 35,
    reorder_level: 100,
    image_url: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=500&q=80",
  },
  {
    name: "Fresh Whole Milk",
    purchase_unit: "crate",
    usage_unit: "bottle",
    current_stock: 40,
    average_cost_per_usage_unit: 1100,
    reorder_level: 10,
    image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=500&q=80",
  },
  {
    name: "Fura Grains / Millet",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 20,
    average_cost_per_usage_unit: 1400,
    reorder_level: 5,
    image_url: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80",
  },
  {
    name: "Tamarind (Tsamiya)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 15,
    average_cost_per_usage_unit: 1200,
    reorder_level: 4,
    image_url: "https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?auto=format&fit=crop&w=500&q=80",
  },
  {
    name: "Baobab Pulp (Kuka)",
    purchase_unit: "bag",
    usage_unit: "mudu",
    current_stock: 15,
    average_cost_per_usage_unit: 1300,
    reorder_level: 4,
    image_url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80",
  },
];

const PRODUCT_IMAGE_FALLBACK_KEY = "alkhair_product_images";

export function getProductImage(productId: string, productName: string): string {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(PRODUCT_IMAGE_FALLBACK_KEY);
      if (stored) {
        const map = JSON.parse(stored);
        if (map[productId]) return map[productId];
      }
    } catch {}
  }
  // Match by name from menu
  const match = AL_KHAIR_MENU.find(
    (item) => item.name.toLowerCase().trim() === productName.toLowerCase().trim()
  );
  if (match?.image_url) return match.image_url;

  // Partial match
  const lower = productName.toLowerCase();
  const partial = AL_KHAIR_MENU.find((item) => lower.includes(item.name.toLowerCase()));
  if (partial?.image_url) return partial.image_url;

  // Category fallback
  if (lower.includes("zobo") || lower.includes("zobs")) return "/presets/raw-materials/hibiscus_zobo.jpg";
  if (lower.includes("ginger")) return "/presets/raw-materials/ginger_root.jpg";
  if (lower.includes("milkshake") || lower.includes("shake")) {
    return "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80";
  }
  if (lower.includes("yoghurt")) {
    return "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80";
  }
  if (lower.includes("pie") || lower.includes("samosa") || lower.includes("roll")) {
    return "https://images.unsplash.com/photo-1579372786545-d24232daf58c?auto=format&fit=crop&w=600&q=80";
  }
  return "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80";
}

export function setProductImage(productId: string, url: string | null) {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(PRODUCT_IMAGE_FALLBACK_KEY);
    const map = stored ? JSON.parse(stored) : {};
    if (url) map[productId] = url;
    else delete map[productId];
    localStorage.setItem(PRODUCT_IMAGE_FALLBACK_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Seeds or synchronizes the full Al-Khair Menu into the Supabase database.
 * Safe and idempotent.
 */
export async function seedAlKhairCatalog() {
  // 1. Seed Raw Materials
  const rawMaterialsCreated: string[] = [];
  const { data: existingMats } = await supabase.from("raw_materials").select("id, name");
  const existingMatNames = new Set((existingMats || []).map((m: any) => m.name.toLowerCase().trim()));

  for (const mat of CORE_RAW_MATERIALS) {
    if (!existingMatNames.has(mat.name.toLowerCase().trim())) {
      const { image_url, ...matData } = mat;
      let res = await supabase.from("raw_materials").insert(mat as any).select("id").single();
      if (res.error) {
        // Fallback without image_url if column not on remote table
        res = await supabase.from("raw_materials").insert(matData as any).select("id").single();
      }
      if (res.data?.id) {
        setMaterialImageFallback(res.data.id, mat.image_url);
        rawMaterialsCreated.push(mat.name);
      }
    }
  }

  // 2. Seed Products
  const productsCreated: string[] = [];
  const { data: existingProds } = await supabase.from("products").select("id, name");
  const existingProdNames = new Set((existingProds || []).map((p: any) => p.name.toLowerCase().trim()));

  for (const item of AL_KHAIR_MENU) {
    if (!existingProdNames.has(item.name.toLowerCase().trim())) {
      const payload: any = {
        name: item.name,
        category: item.category,
        bottle_size: item.bottle_size,
        selling_price: item.selling_price,
        is_active: true,
      };

      // Try inserting with image_url if supported
      let res = await supabase.from("products").insert({ ...payload, image_url: item.image_url } as any).select("id").single();
      if (res.error) {
        // Fallback without image_url column
        res = await supabase.from("products").insert(payload).select("id").single();
      }
      if (res.data?.id) {
        setProductImage(res.data.id, item.image_url);
        productsCreated.push(item.name);
      }
    }
  }

  return {
    rawMaterialsCount: rawMaterialsCreated.length,
    productsCount: productsCreated.length,
    totalMenuCount: AL_KHAIR_MENU.length,
  };
}
