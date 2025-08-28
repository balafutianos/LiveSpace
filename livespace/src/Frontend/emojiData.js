// emojiData.js
export const CATEGORIES = [
  "Smileys",
  "People",
  "Gestures",
  "Animals",
  "Food",
  "Activities",
  "Travel",
  "Objects",
  "Symbols",
];

export const SKIN_TONES = [
  { id: "1", label: "Light",     swatch: "#FAD9C1" },
  { id: "2", label: "Medium-L",  swatch: "#F1C27D" },
  { id: "3", label: "Medium",    swatch: "#C68642" },
  { id: "4", label: "Medium-D",  swatch: "#8D5524" },
  { id: "5", label: "Dark",      swatch: "#5C3A21" },
];

// Basic tone-able set (base emoji without tone). Add more as you like.
export const TONEABLE = new Set([
  "👍","👎","👏","🙏","🙌","👌","✌️","🤞","🤙","👊","🤛","🤜",
  "👋","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","🤟","🤘",
  "👶","👦","👧","👨","👩","👴","👵",
  "👮","👷","💂","🕵️","👩‍⚕️","👨‍⚕️","👩‍🍳","👨‍🍳","👩‍🏫","👨‍🏫",
]);

// Simple tone apply by Zero Width Joiner (for the above items that support it cleanly)
const TONE_MAP = {
  "1": "\u{1F3FB}",
  "2": "\u{1F3FC}",
  "3": "\u{1F3FD}",
  "4": "\u{1F3FE}",
  "5": "\u{1F3FF}",
};
export function toneApply(base, toneId) {
  // naive approach: append tone modifier if base supports it
  const mod = TONE_MAP[toneId];
  if (!mod) return base;
  // Some emoji are multi-codepoint; default to append when in TONEABLE
  return base + mod;
}

export function normalizeString(s = "") {
  return s.toLowerCase().normalize("NFKD");
}

// Classic emoticon → emoji mapping for search exact hits
export const EMOTICON_MAP = {
  ":)": "🙂",
  ":-)": "🙂",
  ":(": "🙁",
  ":-(": "🙁",
  ":d": "😃",
  ":-d": "😃",
  ";)": "😉",
  ";-)": "😉",
  ":p": "😛",
  ":-p": "😛",
  ":o": "😮",
  ":-o": "😮",
  ":'(": "😢",
  "<3": "❤️",
};

// Curated emoji list with category + searchable names/aliases/synonyms.
// Add/remove to taste. Each entry should have { char, name, aliases?:[], category }
const RAW = [
  // Smileys
  { char: "😀", name: "grinning face", aliases: [":D","grin"], category: "Smileys" },
  { char: "😃", name: "grinning face with big eyes", aliases: [":D","big grin"], category: "Smileys" },
  { char: "😄", name: "grinning face with smiling eyes", aliases: [], category: "Smileys" },
  { char: "😁", name: "beaming face with smiling eyes", aliases: [], category: "Smileys" },
  { char: "😆", name: "grinning squinting face", aliases: [], category: "Smileys" },
  { char: "😅", name: "grinning face with sweat", aliases: [], category: "Smileys" },
  { char: "🤣", name: "rolling on the floor laughing", aliases: ["rofl"], category: "Smileys" },
  { char: "😂", name: "face with tears of joy", aliases: ["lol"], category: "Smileys" },
  { char: "🙂", name: "slightly smiling face", aliases: [":)"], category: "Smileys" },
  { char: "🙃", name: "upside-down face", aliases: [], category: "Smileys" },
  { char: "😉", name: "winking face", aliases: [";)"], category: "Smileys" },
  { char: "😊", name: "smiling face with smiling eyes", aliases: [], category: "Smileys" },
  { char: "😍", name: "smiling face with heart-eyes", aliases: ["<3","love"], category: "Smileys" },
  { char: "😘", name: "face blowing a kiss", aliases: [], category: "Smileys" },
  { char: "😛", name: "face with tongue", aliases: [":P"], category: "Smileys" },
  { char: "😜", name: "winking face with tongue", aliases: [], category: "Smileys" },
  { char: "😎", name: "smiling face with sunglasses", aliases: ["cool"], category: "Smileys" },
  { char: "🤔", name: "thinking face", aliases: ["hmm"], category: "Smileys" },
  { char: "😮", name: "face with open mouth", aliases: [":O"], category: "Smileys" },
  { char: "😢", name: "crying face", aliases: [":'("], category: "Smileys" },
  { char: "😭", name: "loudly crying face", aliases: [], category: "Smileys" },
  { char: "😡", name: "enraged face", aliases: ["angry"], category: "Smileys" },
  { char: "😴", name: "sleeping face", aliases: [], category: "Smileys" },
  { char: "😇", name: "smiling face with halo", aliases: [], category: "Smileys" },

  // People (a few)
  { char: "👶", name: "baby", aliases: [], category: "People" },
  { char: "👦", name: "boy", aliases: [], category: "People" },
  { char: "👧", name: "girl", aliases: [], category: "People" },
  { char: "👨", name: "man", aliases: [], category: "People" },
  { char: "👩", name: "woman", aliases: [], category: "People" },
  { char: "👴", name: "old man", aliases: [], category: "People" },
  { char: "👵", name: "old woman", aliases: [], category: "People" },

  // Gestures
  { char: "👍", name: "thumbs up", aliases: ["+1","like"], category: "Gestures" },
  { char: "👎", name: "thumbs down", aliases: ["-1","dislike"], category: "Gestures" },
  { char: "👏", name: "clapping hands", aliases: ["clap"], category: "Gestures" },
  { char: "🙏", name: "folded hands", aliases: ["please","thanks"], category: "Gestures" },
  { char: "🙌", name: "raising hands", aliases: ["hooray"], category: "Gestures" },
  { char: "👌", name: "OK hand", aliases: ["ok"], category: "Gestures" },
  { char: "✌️", name: "victory hand", aliases: ["peace"], category: "Gestures" },
  { char: "🤞", name: "crossed fingers", aliases: [], category: "Gestures" },
  { char: "🤙", name: "call me hand", aliases: [], category: "Gestures" },
  { char: "👊", name: "oncoming fist", aliases: ["fist"], category: "Gestures" },
  { char: "👋", name: "waving hand", aliases: ["hello","hi"], category: "Gestures" },

  // Animals
  { char: "🐶", name: "dog", aliases: ["puppy"], category: "Animals" },
  { char: "🐱", name: "cat", aliases: ["kitty"], category: "Animals" },
  { char: "🐭", name: "mouse", aliases: [], category: "Animals" },
  { char: "🐻", name: "bear", aliases: [], category: "Animals" },
  { char: "🐨", name: "koala", aliases: [], category: "Animals" },
  { char: "🐼", name: "panda", aliases: [], category: "Animals" },
  { char: "🐧", name: "penguin", aliases: [], category: "Animals" },
  { char: "🐸", name: "frog", aliases: [], category: "Animals" },

  // Food
  { char: "🍎", name: "red apple", aliases: ["apple"], category: "Food" },
  { char: "🍔", name: "hamburger", aliases: ["burger"], category: "Food" },
  { char: "🍕", name: "pizza", aliases: [], category: "Food" },
  { char: "🍣", name: "sushi", aliases: [], category: "Food" },
  { char: "🍪", name: "cookie", aliases: [], category: "Food" },
  { char: "🍰", name: "cake", aliases: [], category: "Food" },
  { char: "☕",  name: "hot beverage", aliases: ["coffee"], category: "Food" },
  { char: "🍺", name: "beer mug", aliases: ["beer"], category: "Food" },

  // Activities
  { char: "⚽",  name: "soccer ball", aliases: ["football"], category: "Activities" },
  { char: "🏀", name: "basketball", aliases: [], category: "Activities" },
  { char: "🎮", name: "video game", aliases: ["controller"], category: "Activities" },
  { char: "🎲", name: "game die", aliases: ["dice"], category: "Activities" },
  { char: "🎵", name: "musical note", aliases: ["music"], category: "Activities" },
  { char: "🎉", name: "party popper", aliases: ["tada"], category: "Activities" },

  // Travel
  { char: "✈️", name: "airplane", aliases: ["plane"], category: "Travel" },
  { char: "🚗", name: "automobile", aliases: ["car"], category: "Travel" },
  { char: "🚀", name: "rocket", aliases: [], category: "Travel" },
  { char: "🗺️", name: "world map", aliases: ["map"], category: "Travel" },

  // Objects
  { char: "💡", name: "light bulb", aliases: ["idea"], category: "Objects" },
  { char: "⏰", name: "alarm clock", aliases: ["clock"], category: "Objects" },
  { char: "💻", name: "laptop", aliases: ["computer"], category: "Objects" },
  { char: "📱", name: "mobile phone", aliases: ["phone"], category: "Objects" },
  { char: "🎁", name: "wrapped gift", aliases: ["gift"], category: "Objects" },

  // Symbols
  { char: "❤️", name: "red heart", aliases: ["love","<3"], category: "Symbols" },
  { char: "🔥", name: "fire", aliases: [], category: "Symbols" },
  { char: "✨", name: "sparkles", aliases: [], category: "Symbols" },
  { char: "✅", name: "check mark button", aliases: ["check"], category: "Symbols" },
  { char: "❌", name: "cross mark", aliases: ["x"], category: "Symbols" },
];

// precompute search haystack
const EMOJI_DATA = RAW.map((e) => ({
  ...e,
  _search: normalizeString([e.name, ...(e.aliases || [])].join(" ")),
}));

export default EMOJI_DATA;
