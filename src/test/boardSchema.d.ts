export interface BoardPolicy { imageOrigins: string[]; linkOrigins: string[] }
export interface BoardValidated { id: string; tone: string; form?: string; sizes: string[]; size: string; name: string; show: boolean; [k: string]: unknown }
export interface BoardValidation {
  ok: boolean;
  app: string | null;
  generated_at: string | null;
  tiles: BoardValidated[];
  errors: Array<{ id: unknown; message: string }>;
}
export function validateManifest(manifest: unknown, policy: BoardPolicy): BoardValidation;
export function validateTile(tile: unknown, path: string, policy: BoardPolicy): BoardValidated;
