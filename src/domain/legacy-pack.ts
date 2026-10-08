/** Existing v0.1 pronunciation, rhyme, and dialect data, extracted unchanged. */
export const exceptions: Record<string, number> = {
  fire: 1,
  hour: 1,
  our: 1,
  every: 2,
  different: 3,
  quiet: 2,
  familiar: 3,
  towards: 1,
  poem: 2,
  poetry: 3,
  rhythm: 2,
  little: 2,
  people: 2,
  something: 2,
  evening: 2,
  memories: 3,
  promises: 3,
};
export const rhymeSets = [
  ["light", "night", "bright", "sight", "right", "flight"],
  ["go", "slow", "know", "grow", "show", "flow", "glow"],
  ["own", "known", "alone", "home", "stone"],
  ["say", "away", "day", "way", "stay"],
  ["rain", "train", "pain", "again"],
  ["keep", "sleep", "deep"],
  ["wall", "fall", "call"],
  ["name", "game", "same", "flame", "frame"],
  ["me", "see", "free", "sea", "be"],
  ["door", "more", "before", "floor"],
  ["hand", "stand", "land"],
  ["you", "too", "true", "shoe"],
  ["back", "track", "black"],
  ["coat", "note", "boat", "float"],
  ["road", "hold", "old", "cold"],
];
export const dialectMaps: Record<string, Record<string, string>> = {
    "British English": {
      apartment: "flat",
      sidewalk: "pavement",
      elevator: "lift",
      downtown: "the town centre",
    },
    "American English": {
      flat: "apartment",
      pavement: "sidewalk",
      lift: "elevator",
    },
  };

export const claims: Record<string, string> = {
    "Finding your way": "I can be uncertain and still go",
    "Love & connection": "I choose the quiet way we learn to stay",
    "Letting go": "I can let you go and keep the care",
    "Ambition & identity": "I get to choose the meaning of my name",
    "Home & belonging": "I make a home in what I choose to keep",
  };
