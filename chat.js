// Chat filter. Kids play this game, so we block swearing, links and personal info.
// Blocked words are replaced with ###. Add words to the lists below if you need to.

// Words that are blocked even inside other words (they never appear in normal words).
const STRONG = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'porn', 'retard', 'rape',
  'kurw', 'pierdol', 'jebac', 'jebi', 'pizd', 'chuj', 'huj', 'skurw', 'spierdal', 'zajeb', 'wypierd',
  'бля', 'хуй', 'пизд', 'ебат', 'ебан', 'сука', 'нахуй', 'blyat', 'blyad', 'suka',
];
// Words that are only blocked as a whole word (so "class" or "cocktail" are fine).
const WHOLE = new Set([
  'ass', 'asshole', 'dick', 'cock', 'pussy', 'sex', 'sexy', 'nude', 'nudes', 'fag', 'hoe', 'bastard',
  'dumbass', 'jackass', 'penis', 'vagina', 'boobs', 'tits', 'stfu', 'wtf', 'kys', 'nazi', 'hitler',
  'dupek', 'cwel', 'debil', 'pedal', 'kutas', 'cipa', 'szmata',
]);
const PHRASES = [/kill\s*your\s*self/gi, /kill\s*urself/gi, /zabij\s*si[eę]/gi];

// turn "f.u.c.k", "fuuuck", "sh1t" into something we can check
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
function normalize(w) {
  return w.toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LEET[c])
    .replace(/[^\p{L}]/gu, '')
    .replace(/(\p{L})\1+/gu, '$1'); // collapse repeated letters
}
const STRONG_N = STRONG.map((w) => normalize(w));
const WHOLE_N = new Set([...WHOLE].map((w) => normalize(w)));

const LINK = /(https?:\/\/|www\.|\b[\w-]+\.(com|net|org|pl|gg|io|ru|de|uk|tv|xyz|me|link|app)\b|discord|d\.i\.s\.c|t\.me|@[\w.]+\.\w+)/i;

export function filterChat(raw) {
  let text = String(raw || '').replace(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e]/g, '').trim().slice(0, 120);
  if (!text) return '';
  for (const p of PHRASES) text = text.replace(p, '###');
  // phone numbers / long number codes (5+ digits, even with spaces or dashes between them)
  text = text.replace(/(\d[\s\-.]*){5,}/g, '### ');
  const words = text.split(/(\s+)/).map((w) => {
    if (/^\s+$/.test(w)) return w;
    if (LINK.test(w)) return '###';
    const n = normalize(w);
    if (!n) return w;
    if (WHOLE_N.has(n) || STRONG_N.some((s) => s && n.includes(s))) return '#'.repeat(Math.min(6, Math.max(3, w.length)));
    return w;
  });
  // words split up letter by letter ("f u c k", "s.h.i.t") — join those runs and check them too
  let out = words.join('');
  out = out.replace(/(?:(?<![\p{L}\d])[\p{L}\d](?:[\s.\-_*]+|$)){3,}/gu, (run) => {
    const n = normalize(run);
    return WHOLE_N.has(n) || STRONG_N.some((st) => n.includes(st)) ? '### ' : run;
  });
  return out.trim();
}
