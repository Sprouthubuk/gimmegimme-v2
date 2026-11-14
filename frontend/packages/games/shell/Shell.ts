import gsap from "gsap";
import { Graphics, Sprite, type Texture } from "pixi.js";
import "./shell.css";
import { GameAudio } from "../shared/audio";
import { buzz } from "../shared/haptics";
import { Particles } from "../shared/particles";
import { raysTexture, sparkleTexture } from "../shared/textures";
import { hex, resolveTheme, type Theme } from "../shared/theme";
import type { GameConfig, GameTicket } from "../shared/types";
import { createStage, type Stage } from "./stage";
import { GameSession, type SessionSnapshot } from "./state";

/**
 * What a game (scratch card, and later others) provides to the shell. The shell runs the session; the game
 * draws one ticket at a time and tells the shell when the player has revealed it.
 */
export interface GameScene {
  /** Build textures etc. before the session starts. */
  load(): Promise<void>;
  /** Bring this ticket's card on stage; resolve `revealed` when the player has uncovered it. */
  present(ticket: GameTicket, index: number, total: number, revealed: () => void): Promise<void>;
  /** Uncover the current card without the player (tap, Reveal All). */
  revealNow(fast: boolean): Promise<void>;
  /** Win: the card's own celebration (lift, tilt, light sweep). */
  celebrate(ticket: GameTicket, fast: boolean): Promise<void>;
  /** Move the card off stage. */
  dismiss(won: boolean, fast: boolean): Promise<void>;
  destroy(): void;
}

export interface ShellContext {
  stage: Stage;
  theme: Theme;
  config: GameConfig;
  reducedMotion: boolean;
  audio: GameAudio;
  particles: Particles;
  sparkle: Texture;
}

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
};

/** The only place markup is written: one of the fixed icons above. */
const setIcon = (e: Element, k: keyof typeof ICONS) => { e.innerHTML = ICONS[k]; };
const money = (n: number) => `£${n.toFixed(2)}`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text; // never innerHTML for anything from a config or the server
  return e;
};
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Only our own pages, or an absolute https address, become links. */
const safeHref = (u?: string) => (u && (/^\/(?!\/)/.test(u) || /^https:\/\//.test(u)) ? u : undefined);

export async function runShell(host: HTMLElement, config: GameConfig, makeScene: (ctx: ShellContext) => GameScene): Promise<{ destroy(): void }> {
  const theme = resolveTheme(config.theme);
  const reducedMotion = config.reducedMotion ?? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const session = new GameSession(config.tickets, config.onReveal);
  const total = session.tickets.length;
  let alive = true;

  // ---- DOM ----
  const rootEl = el("div", "ggx");
  const vars: Record<string, string> = { "--bg": theme.background, "--a": theme.neonA, "--b": theme.neonB, "--gold": theme.gold, "--gold-deep": theme.goldDeep, "--panel": theme.panel, "--rim": theme.panelRim, "--text": theme.text, "--muted": theme.muted, "--fd": theme.fonts.display, "--fu": theme.fonts.ui };
  for (const [k, v] of Object.entries(vars)) rootEl.style.setProperty(k, v);
  const frame = el("div", "ggx-frame");
  const canvasHost = el("div", "ggx-canvas");
  frame.append(canvasHost);
  rootEl.append(frame);
  host.append(rootEl);

  const live = el("div", "ggx-sr");
  live.setAttribute("aria-live", "polite");
  frame.append(live);
  const say = (s: string) => { live.textContent = s; };

  const loader = el("div", "ggx-layer ggx-loader");
  loader.append(el("div", "ring"), el("p", undefined, theme.labels.loading));
  frame.append(loader);

  // ---- Pixi stage, effects, the game ----
  const stage = await createStage(canvasHost, theme, reducedMotion, config.assets?.["background-scene"] ?? theme.backgroundImage);
  const audio = new GameAudio(config.assets);
  const particles = new Particles(stage.app.ticker, reducedMotion ? 0 : 220);
  const sparkle = sparkleTexture(64);
  const rays = raysTexture(512, 20);
  stage.fx.addChild(particles.view);
  const scene = makeScene({ stage, theme, config, reducedMotion, audio, particles, sparkle });
  await scene.load();
  if (!alive) return { destroy() {} };

  // ---- Top bar ----
  const top = el("div", "ggx-top ggx-glass");
  const back = el("a", "ggx-btn ggx-icon");
  setIcon(back, "back");
  back.setAttribute("aria-label", theme.labels.back);
  back.href = safeHref(config.links?.back) ?? "/";
  const title = el("div", "ggx-title");
  const titleB = el("b", undefined, config.title ?? theme.title);
  const count = el("span");
  title.append(titleB, count);
  const won = el("div", "ggx-won");
  const wonVal = el("b", undefined, money(0));
  won.append(el("span", undefined, theme.labels.totalWon), wonVal);
  const sound = el("button", "ggx-btn ggx-icon");
  sound.type = "button";
  const paintSound = () => {
    setIcon(sound, audio.enabled ? "soundOn" : "soundOff");
    sound.setAttribute("aria-label", audio.enabled ? theme.labels.soundOn : theme.labels.soundOff);
    sound.setAttribute("aria-pressed", String(audio.enabled));
  };
  sound.addEventListener("click", () => { audio.setEnabled(!audio.enabled); audio.play("button"); paintSound(); });
  paintSound();
  top.append(back, title, won, sound);

  // ---- Hint (also the single-tap reveal button) ----
  const hint = el("button", "ggx-hint ggx-glass", theme.labels.scratchHint);
  hint.type = "button";
  const placeHint = () => { hint.style.top = `${stage.focus.hintY * (stage.app.screen.width / 390)}px`; };
  stage.onResize(placeHint);
  placeHint();

  // ---- Bottom: strip and actions ----
  const bottom = el("div", "ggx-bottom ggx-glass");
  const strip = el("div", "ggx-strip");
  strip.setAttribute("aria-hidden", "true");
  const marks = session.tickets.map(() => strip.appendChild(el("i")));
  const actions = el("div", "ggx-actions");
  const revealAllBtn = el("button", "ggx-btn", theme.labels.revealAll);
  revealAllBtn.type = "button";
  const skipBtn = el("button", "ggx-btn", theme.labels.skip);
  skipBtn.type = "button";
  actions.append(revealAllBtn, skipBtn);
  bottom.append(strip, actions);

  const winLayer = el("div", "ggx-layer ggx-win");
  winLayer.hidden = true;
  winLayer.setAttribute("role", "dialog");
  winLayer.setAttribute("aria-modal", "true");
  const sumLayer = el("div", "ggx-layer ggx-sum");
  sumLayer.hidden = true;
  frame.append(top, hint, bottom, winLayer, sumLayer);

  // ---- Reflect the state ----
  const counter = { v: 0 };
  let lastTotal = 0;
  const paint = (s: SessionSnapshot) => {
    count.textContent = `${theme.labels.ticket} ${Math.min(s.index + 1, total)} / ${total}`;
    s.statuses.forEach((st, i) => { marks[i].className = st === "active" ? "on" : st === "won" ? "won" : st === "lost" ? "lost" : ""; });
    if (s.totalWon !== lastTotal) {
      lastTotal = s.totalWon;
      gsap.to(counter, { v: s.totalWon, duration: reducedMotion ? 0 : 0.9, ease: "power2.out", onUpdate: () => { wonVal.textContent = money(counter.v); } });
    }
    revealAllBtn.disabled = s.finished || s.revealingAll;
    skipBtn.disabled = s.finished;
  };
  const unsubscribe = session.subscribe(paint);

  // ---- Win celebration (the overlay text is DOM; rays, dimming and confetti are Pixi) ----
  const dim = new Graphics();
  const raySprite = new Sprite(rays);
  raySprite.anchor.set(0.5);
  raySprite.tint = hex(theme.gold);
  raySprite.blendMode = "add";
  dim.alpha = 0;
  raySprite.alpha = 0;
  stage.fx.addChildAt(dim, 0);
  stage.fx.addChildAt(raySprite, 1);
  const spin = () => { raySprite.rotation += 0.003; };

  const showWin = (t: GameTicket) => new Promise<void>((done) => {
    const big = t.prize?.tier === "big";
    const { w, h } = stage.size;
    dim.clear().rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.9 });
    raySprite.position.set(w / 2, h * 0.42);
    raySprite.width = raySprite.height = big ? 760 : 560;
    gsap.to(dim, { alpha: 1, duration: 0.25 });
    gsap.fromTo(raySprite, { alpha: 0 }, { alpha: big ? 0.75 : 0.5, duration: 0.5 });
    if (!reducedMotion) {
      stage.app.ticker.add(spin);
      const burst = (x: number) => particles.burst({ x, y: h * 0.42, count: big ? 90 : 45, texture: sparkle, tints: theme.confetti.map(hex), speed: [3, big ? 11 : 8], size: [7, 14], life: [60, 110], gravity: 0.16, flutter: true });
      burst(w / 2);
      if (big) setTimeout(() => { if (alive) { burst(w * 0.25); burst(w * 0.75); } }, 350);
    }
    audio.play(big ? "win-big" : "win-small");
    buzz(big ? [40, 60, 40, 60, 120] : [30, 40, 60], !reducedMotion);

    winLayer.replaceChildren();
    const k = el("div", "k", theme.labels.youWon);
    const lbl = el("div", "lbl", t.prize?.label ?? "");
    const val = el("div", "val", money(t.prize?.value ?? 0));
    const tk = el("div", "tk", `${theme.labels.ticket} #${t.ticketNumber}`);
    winLayer.append(k, lbl, val, tk);
    const proof = safeHref(t.proofUrl);
    if (proof) {
      const a = el("a", "ver");
      a.href = proof;
      a.target = "_blank";
      a.rel = "noopener";
      setIcon(a, "shield");
      a.append(document.createTextNode(theme.labels.verified));
      winLayer.append(a);
    }
    const go = el("button", "ggx-cta", theme.labels.continue);
    go.type = "button";
    winLayer.append(go);
    winLayer.setAttribute("aria-label", `${theme.labels.youWon} ${t.prize?.label ?? ""}`);
    winLayer.hidden = false;
    gsap.fromTo(winLayer.children, { y: reducedMotion ? 0 : 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.07, ease: "back.out(1.6)" });
    go.focus();
    go.addEventListener("click", () => {
      audio.play("button");
      stage.app.ticker.remove(spin);
      gsap.to([dim, raySprite], { alpha: 0, duration: 0.25 });
      winLayer.hidden = true;
      done();
    }, { once: true });
  });

  // ---- Summary ----
  const showSummary = () => {
    const s = session.snapshot();
    sumLayer.replaceChildren();
    sumLayer.append(el("h2", undefined, theme.labels.summaryTitle));
    sumLayer.append(el("p", "sub", `${s.wins} ${s.wins === 1 ? "win" : "wins"} from ${total} ${total === 1 ? "ticket" : "tickets"}`));
    sumLayer.append(el("div", s.wins ? "tot" : "tot none", s.wins ? money(s.totalWon) : theme.labels.noWin));
    const wins = session.tickets.filter((t) => t.result === "win" && t.prize);
    if (wins.length) {
      const cards = el("div", "ggx-cards");
      for (const t of wins) {
        const c = el("div", "ggx-card ggx-glass");
        c.append(el("span", "n", `${theme.labels.ticket} #${t.ticketNumber}`), el("b", undefined, t.prize!.label), el("span", "v", money(t.prize!.value)));
        const proof = safeHref(t.proofUrl);
        if (proof) { const a = el("a", undefined, theme.labels.verified); a.href = proof; a.target = "_blank"; a.rel = "noopener"; c.append(a); }
        cards.append(c);
      }
      sumLayer.append(cards);
    }
    const btns = el("div", "btns");
    const again = el("a", "ggx-cta", theme.labels.playAgain);
    again.href = safeHref(config.links?.playAgain) ?? "/competitions";
    const wallet = el("a", "ggx-cta alt", theme.labels.viewWallet);
    wallet.href = safeHref(config.links?.wallet) ?? "/account/wallet";
    btns.append(again, wallet);
    sumLayer.append(btns);
    sumLayer.hidden = false;
    hint.hidden = true;
    gsap.fromTo(sumLayer.children, { y: reducedMotion ? 0 : 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.06 });
    say(`${s.wins} wins from ${total} tickets. ${theme.labels.totalWon} ${money(s.totalWon)}.`);
    config.onComplete?.({ wins: s.wins, tickets: total, totalWon: s.totalWon });
  };

  // ---- The session ----
  let skipping = false;
  let wake: (() => void) | null = null;
  const nudge = () => { const w = wake; wake = null; w?.(); };
  revealAllBtn.addEventListener("click", () => { audio.play("button"); session.startRevealAll(); nudge(); });
  skipBtn.addEventListener("click", () => { audio.play("button"); skipping = true; nudge(); });
  hint.addEventListener("click", () => { tapReveal = true; nudge(); });
  let tapReveal = false;

  const run = async () => {
    loader.hidden = true;
    while (alive && !session.snapshot().finished) {
      const t = session.current!;
      const s = session.snapshot();
      const fast = s.revealingAll;
      tapReveal = false;
      let revealedByPlayer = false;
      const revealed = new Promise<void>((r) => { wake = r; });
      await scene.present(t, s.index, total, () => { revealedByPlayer = true; nudge(); });
      hint.hidden = fast || skipping;
      if (!fast && !skipping && !revealedByPlayer) await revealed;
      if (!alive) return;
      if (skipping) break;
      hint.hidden = true;
      if (!revealedByPlayer || session.snapshot().revealingAll || tapReveal) await scene.revealNow(session.snapshot().revealingAll);
      const r = session.resolveCurrent();
      if (!r) break;
      const fastNow = session.snapshot().revealingAll;
      if (r.result === "win") {
        say(`${theme.labels.ticket} ${r.ticketNumber}: ${theme.labels.youWon} ${r.prize?.label ?? ""}`);
        await scene.celebrate(r, fastNow);
        if (!fastNow) await showWin(r);
        else {
          audio.play("win-small");
          if (!reducedMotion) particles.burst({ x: stage.focus.x, y: stage.focus.y, count: 24, texture: sparkle, tints: [hex(theme.gold), 0xffffff], speed: [2, 6], life: [30, 60], additive: true });
        }
      } else {
        say(`${theme.labels.ticket} ${r.ticketNumber}: ${theme.labels.noWin}`);
        audio.play("lose");
        await wait(fastNow ? 120 : 600);
      }
      if (!alive) return;
      await scene.dismiss(r.result === "win", fastNow);
      session.advance();
    }
    if (!alive) return;
    if (skipping) session.skip();
    showSummary();
  };
  void run();

  return {
    destroy() {
      if (!alive) return;
      alive = false;
      nudge();
      unsubscribe();
      gsap.killTweensOf([counter, dim, raySprite, winLayer.children, sumLayer.children]);
      stage.app.ticker.remove(spin);
      scene.destroy();
      particles.destroy();
      audio.destroy();
      sparkle.destroy(true);
      rays.destroy(true);
      stage.destroy();
      rootEl.remove();
    },
  };
}
