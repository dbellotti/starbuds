/**
 * Central render-quality authority (specs/research/07-graphics-quality-tiers).
 *
 * One tier drives every knob so systems never diverge: the renderer reads
 * `maxPixelRatio`, decor reads `particleDensity`, and the FX systems read
 * their budget caps live at spawn time. The tier persists in localStorage,
 * can be forced with `?quality=<tier>` for playtests, and is cycled in-game
 * with the G key (surfaced in the debug overlay's Gfx row).
 */

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  /** Clamp for renderer.setPixelRatio (also respects devicePixelRatio). */
  maxPixelRatio: number;
  /** Multiplier for decor particle/prop counts (ambient dust, grass, props). */
  particleDensity: number;
  /** Concurrent impact-burst budget; oldest bursts are recycled beyond it. */
  maxImpacts: number;
  /** Concurrent psychic-pulse budget. */
  maxPulses: number;
}

const PRESETS: Record<QualityTier, QualitySettings> = {
  low: { tier: 'low', maxPixelRatio: 1, particleDensity: 0.35, maxImpacts: 16, maxPulses: 4 },
  medium: { tier: 'medium', maxPixelRatio: 1.5, particleDensity: 0.7, maxImpacts: 40, maxPulses: 8 },
  high: { tier: 'high', maxPixelRatio: 2, particleDensity: 1, maxImpacts: 96, maxPulses: 16 }
};

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high'];
const STORAGE_KEY = 'starbuds.renderQuality';

type QualityListener = (settings: QualitySettings) => void;

let currentTier: QualityTier = resolveInitialTier();
const listeners = new Set<QualityListener>();

export function getQuality(): QualitySettings {
  return PRESETS[currentTier];
}

export function setQualityTier(tier: QualityTier): void {
  if (tier === currentTier || !(tier in PRESETS)) {
    return;
  }
  currentTier = tier;
  try {
    window.localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    // Storage may be unavailable (private mode); the tier still applies for this session.
  }
  for (const listener of listeners) {
    listener(PRESETS[currentTier]);
  }
}

export function cycleQualityTier(): QualityTier {
  const next = TIER_ORDER[(TIER_ORDER.indexOf(currentTier) + 1) % TIER_ORDER.length];
  setQualityTier(next);
  return next;
}

export function onQualityChange(listener: QualityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function resolveInitialTier(): QualityTier {
  const fromQuery = new URLSearchParams(window.location.search).get('quality');
  if (fromQuery && isTier(fromQuery)) {
    return fromQuery;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isTier(stored)) {
      return stored;
    }
  } catch {
    // Fall through to the default.
  }
  return 'medium';
}

function isTier(value: string): value is QualityTier {
  return value === 'low' || value === 'medium' || value === 'high';
}
