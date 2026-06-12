/**
 * Placeholder for future image generation job
 * Will use vehicle jellybean images, RGB gradients/image backgrounds, and offer data
 * Architecture supports adding this without schema changes
 */

export interface ImageGenerationJobData {
  offerId: string;
  templateId?: string;
  backgroundType?: 'gradient' | 'image';
  backgroundConfig?: unknown;
}

// TODO: Implement image generation
// This will generate offer-specific images using:
// - Vehicle jellybean images (from modelpager assets)
// - RGB gradients or image backgrounds
// - Offer data (pricing, text overlays)
