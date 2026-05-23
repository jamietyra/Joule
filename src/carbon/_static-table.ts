// sources: ML Compute Carbon Footprint paper + Crusoe pricing 2026-05-23

export interface ModelRow {
  grams_per_1k: number;
  usd_per_1k: number;
}

export const STATIC_TABLE: Record<string, ModelRow> = {
  'nano-30b-a3b': { grams_per_1k: 0.45, usd_per_1k: 0.0002 },
  'super-120b-a12b': { grams_per_1k: 4.2, usd_per_1k: 0.0024 },
};

export const DEFAULT_MODEL_ID = 'super-120b-a12b';
