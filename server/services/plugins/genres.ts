/**
 * Genre taxonomy used by the plugin enrichment layer
 * (server/services/plugins/genrePresets?.ts).
 *
 * 20 genres covering every major family of contemporary and traditional
 * music.  Each plugin type that has a genrePresets entry will, where it
 * makes musical sense, expose a preset for each of these genres.
 *
 * Genre IDs are stable strings — they become PluginPreset?.name values
 * in the DB so renaming them is a breaking change for any saved user
 * recall.  Add new entries at the end; do not reorder or rename.
 */

export type Genre =
  | "hip-hop"
  | "trap"
  | "lofi"
  | "rnb"
  | "pop"
  | "rock"
  | "metal"
  | "indie"
  | "country"
  | "jazz"
  | "funk-soul"
  | "reggae"
  | "latin"
  | "afrobeats"
  | "edm-house"
  | "techno"
  | "dnb"
  | "dubstep"
  | "ambient-cinematic"
  | "classical-orchestral";

export interface GenreInfo {
  id: Genre;
  label: string;
  family: "urban" | "pop-rock" | "roots" | "electronic" | "orchestral";
}

export const GENRES: GenreInfo[] = [
  { id: "hip-hop", label: "Hip-Hop", family: "urban" },
  { id: "trap", label: "Trap", family: "urban" },
  { id: "lofi", label: "Lo-Fi", family: "urban" },
  { id: "rnb", label: "R&B", family: "urban" },
  { id: "pop", label: "Pop", family: "pop-rock" },
  { id: "rock", label: "Rock", family: "pop-rock" },
  { id: "metal", label: "Metal", family: "pop-rock" },
  { id: "indie", label: "Indie / Alt", family: "pop-rock" },
  { id: "country", label: "Country", family: "roots" },
  { id: "jazz", label: "Jazz", family: "roots" },
  { id: "funk-soul", label: "Funk / Soul", family: "roots" },
  { id: "reggae", label: "Reggae / Dancehall", family: "roots" },
  { id: "latin", label: "Latin", family: "roots" },
  { id: "afrobeats", label: "Afrobeats", family: "roots" },
  { id: "edm-house", label: "EDM / House", family: "electronic" },
  { id: "techno", label: "Techno", family: "electronic" },
  { id: "dnb", label: "Drum & Bass", family: "electronic" },
  { id: "dubstep", label: "Dubstep", family: "electronic" },
  {
    id: "ambient-cinematic",
    label: "Ambient / Cinematic",
    family: "orchestral",
  },
  {
    id: "classical-orchestral",
    label: "Classical / Orchestral",
    family: "orchestral",
  },
];

export const GENRE_IDS: Genre[] = GENRES?.map((g) => g?.id);
