/**
 * Shared utilities for auto-posting services.
 * Used by both autoPostingService (V1/OAuth) and autoPostingServiceV2 (BoosterQueue).
 */

export function detectHookPattern(text: string): string {
  if (!text) return 'organic';
  const lower = text.toLowerCase();
  if (/nobody told|wait until you|nobody sees|can't believe|hidden in|not what you think/.test(lower)) return 'curiosity_gap';
  if (/pov you|tell me why|not me making|stitch this|duet this/.test(lower)) return 'tiktok_native';
  if (/hot take|unpopular opinion|real talk|hear me out|agree or not|thread on/.test(lower)) return 'twitter_native';
  if (/save this|link in bio|double tap|tagged the|this one hits different/.test(lower)) return 'instagram_native';
  if (/i wrote this|the story behind|i was|this melody|music has always/.test(lower)) return 'storytelling';
  if (/studio at|nobody sees the hours|scrapped|voice memo|raw footage|behind every/.test(lower)) return 'behind_scenes';
  if (/drop.*comment|tell me.*think|rate this|be honest|honest opinion|your reaction/.test(lower)) return 'engagement';
  if (/out now|stream now|available everywhere|day one|first 24|first week/.test(lower)) return 'release_cta';
  if (/pre-save|coming soon|dropping soon|countdown|mark the date/.test(lower)) return 'pre_release';
  if (/can't believe.*numbers|hit.*milestone|thank you.*streams|crossed/.test(lower)) return 'milestone';
  return 'organic';
}
