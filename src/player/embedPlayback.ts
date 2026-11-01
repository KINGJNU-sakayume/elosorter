/** Only one Spotify Embed may be active across comparison cards. */
export interface ControllableEmbed { pause(): void }
let active: ControllableEmbed | null = null;

export function claimEmbed(player: ControllableEmbed): void {
  if (active === player) return;
  active?.pause();
  active = player;
}

export function releaseEmbed(player: ControllableEmbed): void {
  if (active === player) active = null;
}

export function stopEmbed(player: ControllableEmbed): void {
  player.pause();
  releaseEmbed(player);
}

/** Stop sound when the comparison changes or the ranking phase closes. */
export function pauseActiveEmbed(): void {
  if (!active) return;
  const player = active;
  active = null;
  player.pause();
}
