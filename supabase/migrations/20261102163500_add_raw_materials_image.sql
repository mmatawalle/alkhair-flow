-- Migration: Add image_url to raw_materials
-- Enables adding pictures/photos to raw materials for better visual identification and auditing.

ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.raw_materials.image_url IS 'Optional image URL or compressed photo asset for visual recognition of the raw material';
