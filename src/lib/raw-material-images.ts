export interface MaterialPreset {
  id: string;
  name: string;
  category: "ingredient" | "packaging" | "spice" | "flavor";
  image: string;
  description: string;
}

export const RAW_MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: "hibiscus_zobo",
    name: "Zobo / Hibiscus (Karkadeh)",
    category: "ingredient",
    image: "/presets/raw-materials/hibiscus_zobo.jpg",
    description: "Dried crimson hibiscus calyces for zobo & herbal tea",
  },
  {
    id: "ginger_root",
    name: "Fresh Ginger (Citta)",
    category: "spice",
    image: "/presets/raw-materials/ginger_root.jpg",
    description: "Whole fresh ginger root & dried spice for kick and heat",
  },
  {
    id: "cloves_spice",
    name: "Cloves (Kanunfari)",
    category: "spice",
    image: "/presets/raw-materials/cloves_spice.jpg",
    description: "Aromatic dried clove buds for drinks and spiced snacks",
  },
  {
    id: "granulated_sugar",
    name: "Granulated Sugar (Sukari)",
    category: "ingredient",
    image: "/presets/raw-materials/granulated_sugar.jpg",
    description: "Pure refined white or cane sweetener",
  },
  {
    id: "pet_bottles",
    name: "PET Beverage Bottles",
    category: "packaging",
    image: "/presets/raw-materials/pet_bottles.jpg",
    description: "Empty food-grade PET bottles for bottling juices & zobo",
  },
  {
    id: "bottle_caps",
    name: "Bottle Caps & Seal Liners",
    category: "packaging",
    image: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=500&q=80",
    description: "Tamper-evident screw caps and seal rings",
  },
  {
    id: "packaging_labels",
    name: "Roll Labels & Stickers",
    category: "packaging",
    image: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=500&q=80",
    description: "Brand stickers, nutrition badges and shrink wraps",
  },
  {
    id: "flavor_essence",
    name: "Vanilla & Fruit Flavor Essence",
    category: "flavor",
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=500&q=80",
    description: "Concentrated aroma drops (pineapple, vanilla, strawberry)",
  },
  {
    id: "citrus_lemon",
    name: "Fresh Lemon / Lime",
    category: "ingredient",
    image: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=500&q=80",
    description: "Fresh citrus juice and natural preservative",
  },
  {
    id: "natural_honey",
    name: "Pure Natural Honey",
    category: "ingredient",
    image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=500&q=80",
    description: "Raw organic bee honey sweetener",
  },
  {
    id: "tiger_nuts",
    name: "Tiger Nuts (Aya)",
    category: "ingredient",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80",
    description: "High-fiber sweet tubers for tiger nut milk (Kunun Aya)",
  },
  {
    id: "dates_dabino",
    name: "Dried Dates (Dabino)",
    category: "ingredient",
    image: "https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&w=500&q=80",
    description: "Natural fruit sweetener and snack additive",
  },
];

const LOCAL_STORAGE_KEY = "alkhair_raw_material_images";

export function getAllMaterialImageFallbacks(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getMaterialImageFallback(id: string): string | null {
  const map = getAllMaterialImageFallbacks();
  return map[id] || null;
}

export function setMaterialImageFallback(id: string, url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const map = getAllMaterialImageFallbacks();
    if (url) {
      map[id] = url;
    } else {
      delete map[id];
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

/**
 * Resizes and compresses any uploaded image file to max width/height with WebP/JPEG format
 * Returns a clean data URI suitable for storage or immediate preview.
 */
export async function compressImageFile(file: File, maxDim = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Clean white background for transparency fallback
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Try webp, fallback to jpeg
        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
