/**
 * Words for the Christmas skin. Decoration only: which joke a cracker holds is
 * picked from the seed and the cracker's place in the order, never from its
 * result, and a bingo call is just a nickname for the number drawn.
 */
import { createRng } from "../../rng";

/** Cheesy cracker jokes, grown-up but clean. No toys, children, nativity or school. */
export const CRACKER_JOKES: readonly { q: string; a: string }[] = [
  { q: "What do you call a reindeer with no eyes?", a: "No idea." },
  { q: "Why are Christmas trees bad at knitting?", a: "They keep dropping their needles." },
  { q: "What's the best thing to put into a mince pie?", a: "Your teeth." },
  { q: "Why did the turkey join the band?", a: "It had the drumsticks." },
  { q: "What do you call a rude reindeer?", a: "Rude-olph." },
  { q: "How does a snowman get about?", a: "By icicle." },
  { q: "What did the stamp say to the Christmas card?", a: "Stick with me and we'll go places." },
  { q: "Why did the Christmas tree go to the barber?", a: "It needed a trim." },
  { q: "What falls at the North Pole but never gets hurt?", a: "Snow." },
  { q: "Who hides in the bakery at Christmas?", a: "A mince spy." },
  { q: "What do sheep say at Christmas?", a: "Fleece Navidad." },
  { q: "What do you call a cat on the beach at Christmas?", a: "Sandy Claws." },
  { q: "Why was the snowman rummaging in the carrots?", a: "He was picking his nose." },
  { q: "What do you get if you cross a bell with a skunk?", a: "Jingle smells." },
  { q: "What's a sprout's favourite party game?", a: "Brussels musical chairs." },
  { q: "What do you call Santa's helpers?", a: "Subordinate Clauses." },
];

/** The joke in the Nth cracker pulled. The same purchase always gives the same jokes. */
export function crackerJoke(seed: string, order: number): { q: string; a: string } {
  const rng = createRng(`cracker-joke:${seed}:${order}`);
  return CRACKER_JOKES[Math.floor(rng() * CRACKER_JOKES.length)];
}

/** Festive caller lines. Numbers without one are called plainly ("B 14"). */
const CALLS: Readonly<Record<number, string>> = {
  1: "A partridge in a pear tree",
  2: "Two turtle doves",
  3: "Three French hens",
  4: "Four calling birds",
  5: "Five gold rings",
  6: "Six geese a-laying",
  7: "Seven swans a-swimming",
  8: "Eight maids a-milking",
  9: "Nine ladies dancing",
  10: "Ten lords a-leaping",
  11: "Eleven pipers piping",
  12: "Twelve drummers drumming",
  22: "Two little turtle doves",
  24: "Christmas Eve",
  25: "Christmas Day",
  26: "Boxing Day",
  31: "New Year's Eve",
  44: "Carol singers at the door",
  50: "Half a century of sprouts",
  66: "Clickety click, here's St Nick",
  71: "Seventy-one, the sprouts are done",
  75: "Last bauble on the tree",
};

export const festiveCall = (n: number): string | null => CALLS[n] ?? null;
