export const genres = [
  {
    id: "indie-folk",
    name: "Indie folk",
    family: "Folk",
    descriptors: [
      "intimate acoustic storytelling",
      "fingerpicked acoustic guitar",
      "organic percussion",
    ],
    bpm: [75, 115],
  },
  {
    id: "dream-pop",
    name: "Dream pop",
    family: "Pop",
    descriptors: [
      "hazy dream-pop atmosphere",
      "shimmering guitar textures",
      "soft ambient pads",
    ],
    bpm: [80, 120],
  },
  {
    id: "alt-pop",
    name: "Alternative pop",
    family: "Pop",
    descriptors: [
      "melodic alternative-pop hooks",
      "warm synthesizer layers",
      "crisp rhythmic accents",
    ],
    bpm: [85, 130],
  },
  {
    id: "rnb",
    name: "Alternative R&B",
    family: "R&B",
    descriptors: [
      "soulful R&B phrasing",
      "rounded sub-bass",
      "syncopated drums",
    ],
    bpm: [65, 105],
  },
  {
    id: "hip-hop",
    name: "Hip-hop",
    family: "Hip-hop",
    descriptors: [
      "rhythmic hip-hop delivery",
      "deep bass grooves",
      "sample-driven percussion",
    ],
    bpm: [75, 110],
  },
  {
    id: "indie-rock",
    name: "Indie rock",
    family: "Rock",
    descriptors: [
      "expressive indie-rock dynamics",
      "layered electric guitars",
      "live drum grooves",
    ],
    bpm: [90, 145],
  },
  {
    id: "ambient",
    name: "Ambient",
    family: "Electronic",
    descriptors: [
      "spacious ambient soundscapes",
      "evolving synthesizer pads",
      "delicate textural details",
    ],
    bpm: [60, 100],
  },
  {
    id: "electronic",
    name: "Electronica",
    family: "Electronic",
    descriptors: [
      "intricate electronic grooves",
      "analog synthesizers",
      "precise programmed drums",
    ],
    bpm: [100, 135],
  },
  {
    id: "soul",
    name: "Neo-soul",
    family: "Soul",
    descriptors: [
      "warm neo-soul harmonies",
      "electric piano chords",
      "laid-back pocket drums",
    ],
    bpm: [70, 110],
  },
  {
    id: "country",
    name: "Alt-country",
    family: "Country",
    descriptors: [
      "earthy country storytelling",
      "gentle pedal steel",
      "brushed acoustic drums",
    ],
    bpm: [75, 120],
  },
];
export const moods = [
  "Reflective",
  "Hopeful",
  "Melancholic",
  "Warm",
  "Dreamy",
  "Energetic",
  "Dark",
  "Intimate",
  "Defiant",
  "Nostalgic",
];
export const instruments = [
  "Acoustic guitar",
  "Ambient pads",
  "Piano",
  "Electric guitar",
  "Strings",
  "Analog synth",
  "Pedal steel",
  "Electric piano",
];
export const productions = [
  "Organic",
  "Warm analog",
  "Spacious",
  "Lo-fi",
  "Polished",
  "Raw",
  "Minimal",
  "Layered",
];
export const textures = [
  "Airy",
  "Warm",
  "Breathy",
  "Raspy",
  "Clear",
  "Soft",
  "Rich",
  "Gravelly",
];
export const deliveries = [
  "Melodic",
  "Conversational",
  "Short / clipped",
  "Dense rhythmic",
  "Triplet",
  "Double-time",
  "Dragged / spacious",
  "Syncopated",
  "Spoken",
];
export const cadenceRanges: Record<string, [number, number]> = {
  Melodic: [7, 11],
  Conversational: [8, 13],
  "Short / clipped": [4, 7],
  "Dense rhythmic": [12, 17],
  Triplet: [9, 15],
  "Double-time": [14, 20],
  "Dragged / spacious": [5, 9],
  Syncopated: [8, 12],
  Spoken: [7, 16],
};
export const themes = [
  "Finding your way",
  "Love & connection",
  "Letting go",
  "Ambition & identity",
  "Home & belonging",
];
export const palette: Record<
  string,
  { objects: string[]; places: string[]; states: string[]; lines: string[] }
> = {
  "Finding your way": {
    objects: ["fading map", "morning light", "compass", "open window"],
    places: ["quiet streets", "the shoreline", "an unfamiliar road"],
    states: ["uncertain", "hopeful", "restless"],
    lines: [
      "I trace the morning on a fading map",
      "The quiet streets are teaching me to slow",
      "I leave a little space for looking back",
      "And let the open window tell me where to go",
      "I used to wait for signs along the road",
      "Now every step becomes a way to know",
      "The light is not a thing that I can hold",
      "But something I can follow as I grow",
    ],
  },
  "Love & connection": {
    objects: ["coffee cup", "folded note", "shared umbrella", "porch light"],
    places: ["the kitchen", "a crowded train", "the doorstep"],
    states: ["tender", "vulnerable", "close"],
    lines: [
      "I leave a coffee cup beside your own",
      "The kitchen holds the words we never say",
      "Your folded note reminds me I am known",
      "A porch light keeps the distance far away",
      "I hear your laughter through the crowded train",
      "We find a little room inside the noise",
      "Our shared umbrella softens all the rain",
      "And every quiet moment finds a voice",
    ],
  },
  "Letting go": {
    objects: ["empty frame", "last letter", "fallen leaf", "old key"],
    places: ["the station", "an empty room", "the riverbank"],
    states: ["bittersweet", "accepting", "free"],
    lines: [
      "I take the empty frame down from the wall",
      "The river carries what I cannot keep",
      "I read the last letter before the fall",
      "And lay the older promises to sleep",
      "The station looks much smaller in the rain",
      "I set the old key down beside the door",
      "I make a little room inside the pain",
      "For things I never knew to look for before",
    ],
  },
  "Ambition & identity": {
    objects: ["worn notebook", "neon sign", "glass tower", "work boots"],
    places: ["the rooftop", "an empty office", "the city"],
    states: ["driven", "conflicted", "resolute"],
    lines: [
      "I fill a worn notebook before the dawn",
      "The glass towers reflect a borrowed name",
      "I keep my work boots steady moving on",
      "And ask myself who wins this waiting game",
      "The rooftop puts the city in my hand",
      "But all its lights cannot decide my worth",
      "I learn to choose the place where I will stand",
      "And give the quiet parts of me a berth",
    ],
  },
  "Home & belonging": {
    objects: [
      "kitchen table",
      "old photograph",
      "garden gate",
      "familiar coat",
    ],
    places: ["the front porch", "a country lane", "the hometown"],
    states: ["rooted", "nostalgic", "welcome"],
    lines: [
      "I set my coat beside the garden gate",
      "The kitchen table keeps a place for me",
      "The old photograph has learned to wait",
      "For all the things that I forgot to see",
      "The country lane remembers how I ran",
      "I hear the porch boards welcome every shoe",
      "I am still becoming who I am",
      "But this familiar place can hold me too",
    ],
  },
};
export const sectionPurposes: Record<string, string> = {
  intro: "Set the atmosphere",
  verse: "Establish the story",
  "pre-chorus": "Build anticipation",
  chorus: "Express the central idea",
  bridge: "Offer a new perspective",
  outro: "Leave a lasting feeling",
  custom: "Develop the idea",
};
export const traitConflicts = [
  {
    domain: "moods" as const,
    pair: ["Hopeful", "Dark"],
    guidance:
      "Hopeful and dark create an emotional contrast. Keep it intentional.",
  },
  {
    domain: "production" as const,
    pair: ["Raw", "Polished"],
    guidance:
      "Raw and polished production pull in different directions. Choose one or use them in different sections.",
  },
  {
    domain: "production" as const,
    pair: ["Minimal", "Layered"],
    guidance:
      "Minimal and layered arrangements conflict; consider a sparse verse and fuller chorus.",
  },
];
