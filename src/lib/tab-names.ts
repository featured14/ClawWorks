const adjectives = [
  "cosmic", "silent", "neon", "quantum", "swift",
  "golden", "phantom", "crystal", "blazing", "lunar",
  "shadow", "electric", "frozen", "stellar", "crimson",
];

const nouns = [
  "phoenix", "nebula", "falcon", "horizon", "vortex",
  "spark", "cipher", "comet", "prism", "titan",
  "pulse", "drift", "aurora", "vertex", "orbit",
];

export function generateTabName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}-${noun}`;
}
