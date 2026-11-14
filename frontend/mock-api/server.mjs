// A stand-in for the Laravel API, following docs/api.md exactly.
//
// Used for front-end development without PHP (`npm run mock-api`, then
// `API_INTERNAL_URL=http://127.0.0.1:8787 npm run dev`) and by the end-to-end
// tests in tests/e2e. It keeps everything in memory and is NEVER deployed.
// Money rules here are simplified: the real ones live in the Laravel backend.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_API_PORT || 8787);
const SITE = (process.env.PUBLIC_SITE_URL || "http://localhost:4321").replace(/\/$/, "");
const SELF = `http://127.0.0.1:${PORT}`;

const DAY = 864e5;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const closes = iso(now + 18 * DAY + 10 * 36e5);
const drawAt = iso(now + 9 * DAY + 10 * 36e5);

const LABELS = { claw_machine: "Claw Machine", slots: "Slots", scratch_card: "Scratch Card", coin_drop: "Coin Drop", balloon_pop: "Balloon Pop", gems: "Gems", hook_a_duck: "Hook a Duck", spin_wheel: "Spin the Wheel", bingo_card: "Bingo Card", classic: "Scratch Card" };
const LADDER = [["King of the Jungle", 75000, 1], ["Golden Grub", 22222, 1], ["Croc Cash", 11111, 3], ["Snake Stash", 5555, 6], ["Spider Silver", 2222, 15], ["Cockroach Coins", 1111, 40], ["Beetle Bonus", 555, 100], ["Witchetty Win", 222, 250], ["Bug Bite", 111, 600], ["Creepy Crawly Cash", 50, 1500]];

function comp(id, slug, title, type, game, skin, img, price, top, sold, subtitle, extra = {}) {
  return { id, slug, title, type, status: "live", game, gameLabel: game ? LABELS[game] : null, skin, image: `${SELF}/media/${img}.webp`, imageSmall: `${SELF}/media/${img}.webp`, imageSrcset: null, pricePence: price, topPrizePence: top, subtitle, soldPercent: sold, prizeCount: type === "instant" ? 2516 : null, endPrize: null, maxTickets: type === "draw" ? 5000 : 100000, opensAt: null, closesAt: type === "draw" ? drawAt : closes, drawAt: type === "draw" ? drawAt : null, featured: false, tags: [], ...extra };
}
const COMPS = [
  comp("c-bush", "bush-bucks-jungle-trial", "Bush Bucks – Jungle Trial", "instant", "claw_machine", "classic", "bush-lg", 25, 75000, 2, "2,516 wins", { featured: true }),
  comp("c-fruity", "fruity-fortunes", "Fruity Fortunes", "instant", "slots", "classic", "fruity", 4, 44444, 2, "Instant wins"),
  comp("c-scratch", "gimme-a-scratch", "Gimme A Scratch", "instant", "scratch_card", "classic", "scratch", 10, 50000, 3, "Instant wins"),
  comp("c-penny", "penny-pusher-payday", "Penny Pusher Payday", "instant", "coin_drop", "classic", "penny", 2, 50000, 1, "Instant wins"),
  comp("c-pop", "pop-for-pennies", "Pop For Pennies", "instant", "balloon_pop", "classic", "pop", 1, 33333, 3, "Instant wins", { presets: [100, 200, 300, 400, 500, 1000, 2000], popularPreset: 200, minTickets: 100, endPrize: { name: "The Big Pop", valuePence: 15000, count: 2 } }),
  comp("c-gems", "demis-diamond-dosh", "Demi’s Diamond Dosh", "instant", "gems", "classic", "diamond", 39, 11111, 3, "Every gem wins"),
  comp("c-ducks", "liams-lucky-ducks", "Liam’s Lucky Ducks", "instant", "hook_a_duck", "classic", "ducks", 25, 25000, 8, "Every duck wins"),
  comp("c-dasher", "dashers-dosh-drop", "Dasher’s Dosh Drop", "instant", "spin_wheel", "christmas", "dasher", 25, 44444, 7, "Instant wins"),
  comp("c-bingo", "jingle-bell-bingo-bonanza", "Jingle Bell Bingo Bonanza", "instant", "bingo_card", "christmas", "bingo", 10, 33333, 7, "Instant wins"),
  comp("c-cracker", "chris-crackers-cash-bang", "Chris Cracker’s Cash Bang", "instant", "balloon_pop", "christmas", "cracker", 5, 22222, 8, "Instant wins"),
  comp("c-scrooge", "scrooges-secret-stash", "Scrooge’s Secret Stash", "instant", "scratch_card", "christmas", "scrooge", 49, 33333, 2, "Instant wins"),
  comp("c-lush", "lush-snow-fairy-wonderland", "Lush Snow Fairy Wonderland Set", "draw", null, "classic", "lush", 59, 5000, 8, "£50 cash alternative", { cashAlternativePence: 5000 }),
  comp("c-cash", "250-tax-free-cash", "£250 Tax-Free Cash", "draw", null, "classic", "cash", 99, 25000, 14, "Cash prize"),
  comp("c-ninja", "ninja-possiblecooker", "Ninja PossibleCooker Plus 6-in-1", "draw", null, "classic", "ninja", 79, 15000, 11, "£100 cash alternative", { cashAlternativePence: 10000 }),
];
const byId = new Map(COMPS.map((c) => [c.id, c]));
const bySlug = new Map(COMPS.map((c) => [c.slug, c]));

function detail(c, user) {
  const held = user ? user.tickets.filter((t) => t.competitionId === c.id).length : 0;
  return {
    ...c,
    description: c.type === "draw" ? `Win the ${c.title}. One winner picked at random, live.` : `Are you brave enough? ${c.title} — every ticket plays one go, with instant prizes up to £${(c.topPrizePence / 100).toFixed(2)}.`,
    howToPlay: c.type === "instant" ? "Buy tickets and each one plays one game. Your result is locked in at purchase — the game just reveals it." : null,
    maxPerPerson: c.type === "draw" ? 100 : 2000,
    heldByMe: held,
    cashAlternativePence: c.cashAlternativePence ?? null,
    prizes: c.type === "instant" ? LADDER.map(([name, v, q], i) => ({ name, valuePence: v, type: "site_credit", quantity: q, won: i > 3 ? Math.floor(q * 0.03) : 0 })) : [],
    endPrize: c.endPrize ?? (c.type === "draw" ? { name: c.title, valuePence: c.topPrizePence, count: 1 } : null),
    presets: c.presets ?? (c.type === "draw" ? [1, 5, 10, 25] : [5, 10, 25, 50]),
    popularPreset: c.popularPreset ?? null,
    minTickets: c.minTickets ?? 1,
    verityRef: `VTY-${c.id.slice(2, 8).toUpperCase()}`,
    commitment: crypto.createHash("sha256").update(c.id).digest("hex"),
    verifyUrl: `/verify/VTY-${c.id.slice(2, 8).toUpperCase()}`,
  };
}

// ---- users and sessions ----
const users = new Map(); // email -> user
const sessions = new Map(); // token -> email
const orders = new Map(); // number -> order
let orderSeq = 1000;

function newUser({ firstName, lastName, email, password, dateOfBirth, verified = false, wallet = 0 }) {
  const u = { id: `u-${users.size + 1}`, firstName, lastName, email, password, dateOfBirth, emailVerified: verified, phone: null, address: { line1: null, line2: null, city: null, postcode: null }, marketing: { email: false, sms: false, winNotifications: true }, memberSince: iso(now - 3 * DAY), deposit: wallet, winnings: 0, bonus: 0, tx: [], tickets: [], limits: { weeklyDepositPence: null, pending: null, coolOffUntil: null, selfExcludedUntil: null, reminders: { sessionMinutes: null, weeklySummary: true } } };
  if (wallet) u.tx.push({ id: crypto.randomUUID(), at: iso(now - DAY), description: "Top up · Card", amountPence: wallet, direction: "in", bucket: "deposit" });
  users.set(email.toLowerCase(), u);
  return u;
}
newUser({ firstName: "Liam", lastName: "O’Leary", email: "player@example.com", password: "password123", dateOfBirth: "1998-09-19", verified: true, wallet: 1250 });

const age = (dob) => Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * DAY));
const total = (u) => u.deposit + u.winnings + u.bonus;
function playBlock(u) {
  if (!u.emailVerified) return "email_unverified";
  if (u.limits.selfExcludedUntil && new Date(u.limits.selfExcludedUntil) > new Date()) return "self_excluded";
  if (u.limits.coolOffUntil && new Date(u.limits.coolOffUntil) > new Date()) return "cool_off";
  return null;
}
function meJson(u) {
  const active = u.tickets.filter((t) => byId.get(t.competitionId)?.status === "live");
  return {
    id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, emailVerified: u.emailVerified, phone: u.phone, dobVerified: !!u.dateOfBirth,
    address: u.address, marketing: u.marketing, memberSince: u.memberSince,
    wallet: { depositPence: u.deposit, bonusPence: u.bonus, winningsPence: u.winnings, totalPence: total(u), withdrawablePence: u.winnings },
    gamesWaiting: u.tickets.filter((t) => byId.get(t.competitionId)?.type === "instant" && !t.played).length,
    stats: { activeTickets: active.length, activeCompetitions: new Set(active.map((t) => t.competitionId)).size, instantWins: u.tickets.filter((t) => t.prize).length, totalWonPence: u.tickets.reduce((s, t) => s + (t.prize?.valuePence ?? 0), 0), spentThisWeekPence: 0 },
    playBlock: playBlock(u),
  };
}

// ---- http helpers ----
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((p) => { const i = p.indexOf("="); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const fail = (res, status, message, errors) => send(res, status, errors ? { message, errors } : { message });
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) break; }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function sessionUser(req) {
  const t = parseCookies(req).gimme_session;
  const email = t && sessions.get(t);
  return email ? users.get(email) : null;
}
function startSession(u) {
  const t = crypto.randomBytes(16).toString("hex");
  sessions.set(t, u.email.toLowerCase());
  return `gimme_session=${t}; Path=/; HttpOnly; SameSite=Lax`;
}

function price(lines, u, promoCode) {
  const out = [];
  const problems = [];
  for (const l of lines || []) {
    const c = byId.get(l.competitionId);
    if (!c) { problems.push("A competition in your basket isn't available any more."); continue; }
    const max = (c.type === "draw" ? 100 : 2000) - (u ? u.tickets.filter((t) => t.competitionId === c.id).length : 0);
    const q = Math.max(1, Math.floor(Number(l.quantity) || 1));
    out.push({ competitionId: c.id, slug: c.slug, title: c.title, image: c.image, imageSmall: c.imageSmall, imageSrcset: c.imageSrcset, type: c.type, quantity: q, unitPence: c.pricePence, linePence: q * c.pricePence, maxQuantity: Math.max(0, max), minQuantity: 1, problem: q > max ? `You can have up to ${max} more tickets in this competition.` : null });
  }
  const sum = out.reduce((s, l) => s + l.linePence, 0);
  const promo = promoCode && String(promoCode).toUpperCase() === "GIMME10" ? { code: "GIMME10", discountPence: Math.floor(sum * 0.1) } : null;
  if (promoCode && !promo) problems.push("That promo code isn't valid.");
  const totalPence = sum - (promo?.discountPence ?? 0);
  return { lines: out, totalPence, ticketCount: out.reduce((n, l) => n + l.quantity, 0), promo, walletCanPayPence: u ? Math.min(total(u), totalPence) : 0, walletCovers: !!u && total(u) >= totalPence && totalPence > 0, problems };
}

function issue(u, order) {
  const tickets = [];
  for (const l of order.lines) {
    const nums = new Set(u.tickets.filter((t) => t.competitionId === l.competitionId).map((t) => t.number));
    const mine = [];
    while (mine.length < l.quantity) { const n = 1 + crypto.randomInt(99999); if (!nums.has(n)) { nums.add(n); mine.push(n); } }
    for (const n of mine) {
      const c = byId.get(l.competitionId);
      // Deterministic for tests: every third instant ticket in an order wins the smallest prize.
      const prize = c.type === "instant" && tickets.length % 3 === 0 ? { name: "Creepy Crawly Cash", valuePence: 50, type: "site_credit" } : null;
      const t = { competitionId: l.competitionId, number: n, order: order.number, played: false, prize };
      u.tickets.push(t); tickets.push(t);
    }
    l.tickets = mine;
  }
  order.status = "paid";
  order.paidAt = iso(Date.now());
}
function orderJson(o, u) {
  return {
    number: o.number, status: o.status, needsAttention: false, totalPence: o.totalPence, cardPence: o.cardPence, walletPence: o.walletPence, paidAt: o.paidAt ?? null,
    lines: o.lines.map((l) => { const c = byId.get(l.competitionId); return { competitionId: c.id, slug: c.slug, title: c.title, image: c.image, imageSmall: c.imageSmall, imageSrcset: c.imageSrcset, type: c.type, quantity: l.quantity, tickets: l.tickets ?? [], drawAt: c.drawAt }; }),
    toPlay: o.status === "paid" ? u.tickets.filter((t) => t.order === o.number && !t.played && byId.get(t.competitionId).type === "instant").length : 0,
  };
}
function spendWallet(u, amount) {
  let left = amount;
  for (const b of ["deposit", "bonus", "winnings"]) { const take = Math.min(u[b], left); u[b] -= take; left -= take; if (take) u.tx.unshift({ id: crypto.randomUUID(), at: iso(Date.now()), description: "Tickets", amountPence: take, direction: "out", bucket: b }); }
}

// ---- routes ----
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`), fn });

route("GET", "/sanctum/csrf-cookie", (req, res) => { res.writeHead(204, { "Set-Cookie": `XSRF-TOKEN=${crypto.randomBytes(12).toString("hex")}; Path=/; SameSite=Lax` }); res.end(); });
route("GET", "/api/site", (req, res) => send(res, 200, { salesOpen: true, minDepositPence: 500, minCardPence: 100, minWithdrawalPence: 2000, maxTopUpPence: 50000, featuredSlug: "bush-bucks-jungle-trial", socials: { instagram: "https://instagram.com/gimmegimmeprizes", facebook: "https://facebook.com/groups/gimmegimmeprizes" }, supportEmail: "hello@gimmegimmeprizes.co.uk" }));
route("GET", "/api/competitions", (req, res, { query }) => send(res, 200, { data: COMPS.filter((c) => !query.get("type") || c.type === query.get("type")) }));
route("GET", "/api/competitions/:slug", (req, res, { params, user }) => { const c = bySlug.get(params.slug); return c ? send(res, 200, detail(c, user)) : fail(res, 404, "Not found"); });
route("GET", "/api/winners/instant", (req, res) => send(res, 200, { data: [0, 1, 2, 3, 4].map((i) => ({ id: `w${i}`, name: "Emmie A.", prizeName: i ? "£0.50 site credit" : "£0.25 site credit", valuePence: i ? 50 : 25, game: i ? "balloon_pop" : "hook_a_duck", gameLabel: i ? "Balloon Pop" : "Hook a Duck", competitionTitle: i ? "Pop For Pennies" : "Liam’s Lucky Ducks", at: iso(now - (53 + i) * 6e4) })), hasMore: false }));
route("GET", "/api/winners/draws", (req, res) => send(res, 200, { data: [{ id: "d1", name: "Natalie B.", prizeName: "£50 Supermarket Voucher", competitionTitle: "Free – Win A £50 Supermarket Voucher", ticketNumber: null, at: iso(now - 6 * DAY), videoUrl: null, verifyUrl: null }] }));
route("GET", "/api/entry-lists", (req, res) => send(res, 200, { data: COMPS }));
route("GET", "/api/entry-lists/:slug", (req, res, { params }) => { const c = bySlug.get(params.slug); return c ? send(res, 200, { competition: c, data: [{ ticket: 1, name: "N***** B.", source: "paid" }, { ticket: 2, name: "E**** A.", source: "postal" }], total: 2, hasMore: false }) : fail(res, 404, "Not found"); });
route("GET", "/api/pages/:slug", (req, res, { params }) => send(res, 200, { title: { terms: "Terms & Conditions", privacy: "Privacy Policy", cookies: "Cookie Policy", complaints: "Complaints", "free-entry": "Free Entry Terms" }[params.slug] ?? "Page", updatedAt: iso(now - 10 * DAY), version: "1.0", html: `<h2 id="about">1. About Us</h2><p>Gimme Gimme Prizes is a trading name of GIMMEGIMMEPRIZES LTD.</p><h2 id="who">2. Who Can Enter</h2><p>UK residents aged 18 or over.</p>`, headings: [{ id: "about", text: "1. About Us" }, { id: "who", text: "2. Who Can Enter" }] }));
route("POST", "/api/contact", async (req, res) => { const b = await readJson(req); if (!b.message || String(b.message).length < 10) return fail(res, 422, "Please check the form.", { message: ["Tell us a bit more (at least 10 characters)."] }); send(res, 201, { ok: true }); });
route("POST", "/api/basket/price", async (req, res, { user }) => { const b = await readJson(req); send(res, 200, price(b.lines, user, b.promoCode)); });

route("POST", "/api/auth/register", async (req, res) => {
  const b = await readJson(req);
  const errors = {};
  if (!b.firstName) errors.firstName = ["Enter your first name."];
  if (!b.lastName) errors.lastName = ["Enter your last name."];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || "")) errors.email = ["Enter a valid email address."];
  else if (users.has(b.email.toLowerCase())) errors.email = ["There's already an account with that email. Try logging in."];
  if (!b.password || b.password.length < 8) errors.password = ["Use at least 8 characters."];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth || "") || isNaN(new Date(b.dateOfBirth))) errors.dateOfBirth = ["Enter your date of birth."];
  else if (age(b.dateOfBirth) < 18) errors.dateOfBirth = ["You must be 18 or over to join."];
  if (Object.keys(errors).length) return fail(res, 422, "Please check the form.", errors);
  const u = newUser(b);
  send(res, 201, meJson(u), { "Set-Cookie": startSession(u) });
});
route("POST", "/api/auth/login", async (req, res) => {
  const b = await readJson(req);
  const u = users.get(String(b.email || "").toLowerCase());
  if (!u || u.password !== b.password) return fail(res, 422, "Those details don't match an account.", { email: ["Those details don't match an account."] });
  send(res, 200, meJson(u), { "Set-Cookie": startSession(u) });
});
route("POST", "/api/auth/logout", (req, res) => { sessions.delete(parseCookies(req).gimme_session); send(res, 204, undefined, { "Set-Cookie": "gimme_session=; Path=/; Max-Age=0" }); });
route("POST", "/api/auth/forgot-password", (req, res) => send(res, 200, { ok: true }));
route("POST", "/api/auth/reset-password", async (req, res) => { const b = await readJson(req); return !b.token ? fail(res, 422, "That reset link has expired.") : send(res, 200, { ok: true }); });
route("POST", "/api/auth/email/resend", (req, res, { user }) => user ? send(res, 200, { ok: true }) : fail(res, 401, "Unauthenticated."));
route("POST", "/api/test/verify", (req, res, { user }) => { if (!user) return fail(res, 401, "Unauthenticated."); user.emailVerified = true; send(res, 200, meJson(user)); });

const authed = (fn) => (req, res, ctx) => ctx.user ? fn(req, res, ctx) : fail(res, 401, "Unauthenticated.");
route("GET", "/api/me", authed((req, res, { user }) => send(res, 200, meJson(user))));
route("GET", "/api/me/wallet/transactions", authed((req, res, { user }) => send(res, 200, { data: user.tx.slice(0, 25) })));
route("GET", "/api/me/tickets", authed((req, res, { user, query }) => {
  const groups = new Map();
  for (const t of user.tickets) {
    const key = `${t.competitionId}|${t.order}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  let data = [...groups.values()].map((ts) => {
    const c = byId.get(ts[0].competitionId);
    const toPlay = c.type === "instant" ? ts.filter((t) => !t.played).length : 0;
    const wonPence = ts.filter((t) => t.played && t.prize).reduce((s, t) => s + t.prize.valuePence, 0);
    return { competition: { id: c.id, slug: c.slug, title: c.title, type: c.type, image: c.image, imageSmall: c.imageSmall, imageSrcset: c.imageSrcset, drawAt: c.drawAt, closesAt: c.closesAt, status: c.status }, orderNumber: ts[0].order, tickets: ts.slice(0, 40).map((t) => ({ number: t.number, won: t.played && !!t.prize, played: t.played, prizeName: t.played && t.prize ? t.prize.name : null })), ticketCount: ts.length, toPlay, wonPence, status: toPlay ? "to_play" : c.type === "draw" ? "in_draw" : wonPence ? "won" : "no_win" };
  });
  const tab = query.get("tab");
  if (tab === "to-play") data = data.filter((g) => g.toPlay);
  if (tab === "won") data = data.filter((g) => g.wonPence);
  if (tab === "past") data = [];
  send(res, 200, { data: data.slice(0, Number(query.get("limit") || 100)) });
}));
route("GET", "/api/me/tickets/:number/:competitionId", authed((req, res, { user, query, params }) => {
  const { number, competitionId } = params;
  const ts = user.tickets.filter((t) => t.order === number && t.competitionId === competitionId);
  if (!ts.length) return fail(res, 404, "Not found.");
  const c = byId.get(competitionId);
  const page = Math.max(1, Number(query.get("page") || 1));
  const slice = ts.slice((page - 1) * 500, page * 500);
  send(res, 200, { competition: { id: c.id, slug: c.slug, title: c.title, type: c.type }, orderNumber: number, data: slice.map((t) => ({ number: t.number, won: t.played && !!t.prize, played: t.played, prizeName: t.played && t.prize ? t.prize.name : null })), total: ts.length, page, perPage: 500, hasMore: page * 500 < ts.length });
}));
route("GET", "/api/me/limits", authed((req, res, { user }) => send(res, 200, user.limits)));
route("POST", "/api/me/limits", authed(async (req, res, { user }) => { const b = await readJson(req); user.limits.weeklyDepositPence = b.weeklyDepositPence ?? null; send(res, 200, user.limits); }));
route("POST", "/api/me/break", authed(async (req, res, { user }) => { const b = await readJson(req); user.limits.coolOffUntil = iso(Date.now() + (Number(b.days) || 1) * DAY); send(res, 200, user.limits); }));
route("POST", "/api/me/self-exclude", authed(async (req, res, { user }) => { const b = await readJson(req); user.limits.selfExcludedUntil = iso(Date.now() + (Number(b.months) || 6) * 30 * DAY); send(res, 200, user.limits); }));
route("PATCH", "/api/me/profile", authed(async (req, res, { user }) => { const b = await readJson(req); user.phone = b.phone || null; send(res, 200, meJson(user)); }));
route("PATCH", "/api/me/address", authed(async (req, res, { user }) => { const b = await readJson(req); if (user.address.line1) return fail(res, 422, "Contact us to change your address."); user.address = { line1: b.line1, line2: b.line2 || null, city: b.city, postcode: b.postcode }; send(res, 200, meJson(user)); }));
route("PATCH", "/api/me/preferences", authed(async (req, res, { user }) => { const b = await readJson(req); user.marketing = { email: !!b.email, sms: !!b.sms, winNotifications: !!b.winNotifications }; send(res, 200, meJson(user)); }));
route("POST", "/api/me/password", authed(async (req, res, { user }) => { const b = await readJson(req); if (b.currentPassword !== user.password) return fail(res, 422, "Your current password is wrong.", { currentPassword: ["Your current password is wrong."] }); user.password = b.password; send(res, 200, { ok: true }); }));
route("POST", "/api/me/deposits", authed(async (req, res, { user }) => { const b = await readJson(req); if (!(b.amountPence >= 500)) return fail(res, 422, "The minimum top up is £5.", { amountPence: ["The minimum top up is £5."] }); const n = `GD-${++orderSeq}`; orders.set(n, { number: n, deposit: b.amountPence, user: user.email, status: "pending_payment", lines: [], totalPence: b.amountPence, cardPence: b.amountPence, walletPence: 0 }); send(res, 201, { redirectUrl: `${SELF}/mock-pay/${n}` }); }));
route("POST", "/api/me/withdrawals", authed(async (req, res, { user }) => { const b = await readJson(req); if (!(b.amountPence >= 2000) || b.amountPence > user.winnings) return fail(res, 422, "You can withdraw winnings from £20.", { amountPence: ["You can withdraw winnings from £20."] }); send(res, 201, { ok: true }); }));

route("POST", "/api/checkout", authed(async (req, res, { user }) => {
  const b = await readJson(req);
  const block = playBlock(user);
  if (block) return fail(res, 403, block === "email_unverified" ? "Please confirm your email address before you play." : "You can't play right now.", undefined);
  const p = price(b.lines, user, b.promoCode);
  if (p.problems.length || p.lines.some((l) => l.problem)) return fail(res, 422, p.problems[0] ?? p.lines.find((l) => l.problem).problem);
  const number = `GG-${++orderSeq}`;
  const walletPart = b.payWith === "wallet" ? p.totalPence : b.useWallet ? Math.min(total(user), p.totalPence) : 0;
  if (b.payWith === "wallet" && !p.walletCovers) return fail(res, 422, "Your wallet doesn't cover this order.");
  const cardPart = p.totalPence - walletPart;
  if (cardPart > 0 && cardPart < 100) return fail(res, 422, "Card payments start at £1.");
  const o = { number, user: user.email, status: "pending_payment", lines: p.lines.map((l) => ({ competitionId: l.competitionId, quantity: l.quantity })), totalPence: p.totalPence, cardPence: cardPart, walletPence: walletPart };
  orders.set(number, o);
  spendWallet(user, walletPart);
  if (cardPart === 0) { issue(user, o); return send(res, 201, { order: { number, status: "paid" }, next: "play", redirectUrl: null }); }
  send(res, 201, { order: { number, status: "pending_payment" }, next: "redirect", redirectUrl: `${SELF}/mock-pay/${number}` });
}));
route("GET", "/api/orders/:number", authed((req, res, { user, params }) => { const o = orders.get(params.number); return o && o.user === user.email ? send(res, 200, orderJson(o, user)) : fail(res, 404, "Not found"); }));
route("POST", "/api/orders/:number/return", authed(async (req, res, { user, params }) => {
  const o = orders.get(params.number);
  if (!o || o.user !== user.email) return fail(res, 404, "Not found");
  const b = await readJson(req);
  if (o.status === "pending_payment" && o.gateway === "paid") {
    if (o.deposit) { user.deposit += o.deposit; o.status = "paid"; user.tx.unshift({ id: crypto.randomUUID(), at: iso(Date.now()), description: "Top up · Card", amountPence: o.deposit, direction: "in", bucket: "deposit" }); }
    else issue(user, o);
  } else if (o.status === "pending_payment" && (b.leftAs || o.gateway === "failed")) {
    o.status = b.leftAs === "cancelled" ? "cancelled" : "failed";
    user.deposit += o.walletPence;
  }
  send(res, 200, orderJson(o, user));
}));
route("POST", "/api/orders/:number/play", authed((req, res, { user, params }) => {
  const o = orders.get(params.number);
  if (!o || o.user !== user.email) return fail(res, 404, "Not found");
  if (o.status !== "paid") return fail(res, 409, "This order isn't paid yet.");
  // Like Laravel: the same result every time; prizes are credited once.
  const ts = user.tickets.filter((t) => t.order === o.number && byId.get(t.competitionId).type === "instant");
  let credited = 0;
  for (const t of ts) { if (t.prize) credited += t.prize.valuePence; if (!t.played && t.prize) { user.winnings += t.prize.valuePence; user.tx.unshift({ id: crypto.randomUUID(), at: iso(Date.now()), description: `Instant win · ${t.prize.name}`, amountPence: t.prize.valuePence, direction: "in", bucket: "winnings" }); } t.played = true; }
  const context = {};
  for (const t of ts) { const c = byId.get(t.competitionId); context[c.id] = { game: c.game, isInstantWin: true, prizeLabels: ["£750", "£222.22", "£111.11", "£55.55", "£22.22", "£11.11", "£5.55", "£2.22", "£1.11", "50p"], inLiveDraw: false, skin: c.skin }; }
  send(res, 200, { outcome: { purchaseId: o.number, tickets: ts.map((t) => ({ ticketNumber: t.number, competitionId: t.competitionId, competitionTitle: byId.get(t.competitionId).title, prize: t.prize })), totalWonPence: credited, creditedPence: credited, balanceAfterPence: total(user) }, context });
}));

// The fake payment page Cashflows would show.
route("GET", "/mock-pay/:number", (req, res, { params }) => {
  const o = orders.get(params.number);
  if (!o) return fail(res, 404, "Not found");
  res.writeHead(200, { "Content-Type": "text/html" });
  const ok = o.deposit ? `${SITE}/account/wallet?deposit=${o.number}` : `${SITE}/order/${o.number}`;
  res.end(`<!doctype html><title>Mock payment</title><body style="font-family:sans-serif;background:#fff;padding:24px"><h1>Mock Cashflows payment — £${(o.cardPence / 100).toFixed(2)}</h1><p><a id="pay" href="${SELF}/mock-pay/${o.number}/paid">Pay</a> · <a id="fail" href="${SELF}/mock-pay/${o.number}/failed">Decline</a> · <a id="cancel" href="${SITE}/payment/cancelled?order=${o.number}">Cancel</a></p><p hidden>${ok}</p></body>`);
});
route("GET", "/mock-pay/:number/:result", (req, res, { params }) => {
  const o = orders.get(params.number);
  if (!o) return fail(res, 404, "Not found");
  o.gateway = params.result === "paid" ? "paid" : "failed";
  const to = o.gateway === "paid" ? (o.deposit ? `${SITE}/account/wallet?deposit=${o.number}` : `${SITE}/order/${o.number}`) : `${SITE}/payment/failed?order=${o.number}`;
  res.writeHead(302, { Location: to }); res.end();
});
route("GET", "/media/:file", (req, res, { params }) => {
  const f = path.join(DIR, "images", path.basename(params.file));
  if (!fs.existsSync(f)) return fail(res, 404, "Not found");
  res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" });
  fs.createReadStream(f).pipe(res);
});

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, SELF);
  const user = sessionUser(req);
  if (!["GET", "HEAD"].includes(req.method) && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/test/")) {
    const cookies = parseCookies(req);
    // Like Laravel: a state-changing call needs the XSRF token it handed out.
    if (!cookies["XSRF-TOKEN"] || req.headers["x-xsrf-token"] !== cookies["XSRF-TOKEN"]) return fail(res, 419, "CSRF token mismatch.");
  }
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = url.pathname.match(r.re);
    if (m) {
      try { return await r.fn(req, res, { params: m.groups ?? {}, query: url.searchParams, user }); } catch (e) { console.error(e); return fail(res, 500, "Server error"); }
    }
  }
  fail(res, 404, "Not found");
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, "127.0.0.1", () => console.log(`Mock API on ${SELF}`));
}
