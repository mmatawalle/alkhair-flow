import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Upload,
  Link as LinkIcon,
  Sparkles,
  X,
  Image as ImageIcon,
  Check,
  ZoomIn,
  Camera,
} from "lucide-react";
import {
  RAW_MATERIAL_PRESETS,
  MaterialPreset,
  compressImageFile,
} from "@/lib/raw-material-images";

interface Props {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  materialName?: string;
}

export default function RawMaterialImagePicker({
  value,
  onChange,
  materialName = "",
}: Props) {
  const [activeTab, setActiveTab] = useState<"preset" | "upload" | "url">("preset");
  const [urlInput, setUrlInput] = useState(value && !value.startsWith("data:") ? value : "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const compressedDataUrl = await compressImageFile(file, 640, 0.85);
      onChange(compressedDataUrl);
    } catch (err) {
      console.error("Failed to process image:", err);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleApplyUrl = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
    }
  };

  const handleSelectPreset = (preset: MaterialPreset) => {
    onChange(preset.image);
  };

  const handleRemove = () => {
    onChange(null);
    setUrlInput("");
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4 text-primary" />
          Material Photo / Visual Showcase
        </label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="mr-1 h-3.5 w-3.5" /> Remove Photo
          </Button>
        )}
      </div>

      {/* Prominent Hero Image Showcase */}
      <div className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden border-2 border-dashed border-border/80 bg-background/60 shadow-inner group flex items-center justify-center transition-all">
        {value ? (
          <>
            <img
              src={value}
              alt={materialName || "Material preview"}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/* Gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 opacity-70 group-hover:opacity-50 transition-opacity" />

            {/* Top badges */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1">
                <Check className="h-3 w-3 text-emerald-400" /> Active Image
              </span>
            </div>

            <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="h-7 text-xs bg-black/60 text-white hover:bg-black/80 backdrop-blur-md px-2.5 shadow-sm"
              >
                <ZoomIn className="mr-1 h-3.5 w-3.5" /> Fullscreen
              </Button>
            </div>

            {/* Bottom info */}
            <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white">
              <p className="text-xs font-semibold truncate drop-shadow-sm">
                {materialName || "Material Image"}
              </p>
              <span className="text-[10px] opacity-80">Choose another option below to replace</span>
            </div>
          </>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2 shadow-xs group-hover:scale-110 transition-transform">
              <Camera className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">Click to upload photo or take picture</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
              Or pick from one of the ready-made ingredient presets below
            </p>
          </div>
        )}
      </div>

      {/* Input Controls */}
      <div className="w-full pt-1">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="w-full"
        >
          <TabsList className="grid grid-cols-3 h-9 w-full mb-3">
            <TabsTrigger value="preset" className="text-xs font-medium flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Presets
            </TabsTrigger>
            <TabsTrigger value="upload" className="text-xs font-medium flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Upload File
            </TabsTrigger>
            <TabsTrigger value="url" className="text-xs font-medium flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" /> Image URL
            </TabsTrigger>
          </TabsList>

          {/* Presets Grid */}
          <TabsContent value="preset" className="mt-0">
            <div className="max-h-48 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-2 scrollbar-thin">
              {RAW_MATERIAL_PRESETS.map((preset) => {
                const isSelected = value === preset.image;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/15 ring-2 ring-primary/40 shadow-xs"
                        : "border-border/70 hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <img
                      src={preset.image}
                      alt={preset.name}
                      className="w-9 h-9 rounded-md object-cover shrink-0 border border-border/50 shadow-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-tight truncate text-foreground">
                        {preset.name.split(" (")[0]}
                      </p>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {preset.category}
                      </span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </TabsContent>

          {/* Device Upload */}
          <TabsContent value="upload" className="mt-0 space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
              id="raw-material-file-upload"
            />
            <Button
              type="button"
              variant="outline"
              size="default"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="w-full text-xs font-semibold h-11 border-primary/30 hover:border-primary hover:bg-primary/5"
            >
              <Camera className="mr-2 h-4 w-4 text-primary" />
              {isProcessing ? "Optimizing & processing photo..." : "Snap Camera Photo or Upload File"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Photos are automatically compressed to clean lightweight WebP format for fast loading.
            </p>
          </TabsContent>

          {/* Web Image URL */}
          <TabsContent value="url" className="mt-0 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="https://images.unsplash.com/... or web image link"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="h-9 text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleApplyUrl}
                className="h-9 text-xs px-4 shrink-0 font-semibold"
              >
                Apply URL
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Paste any online image URL from supplier catalogs or image hosting.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Lightbox Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md p-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {materialName || "Material Image"}
            </DialogTitle>
          </DialogHeader>
          {value && (
            <div className="overflow-hidden rounded-xl border border-border bg-black/5 mt-2 shadow-inner">
              <img
                src={value}
                alt={materialName || "Full size preview"}
                className="w-full max-h-[380px] object-contain mx-auto"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
