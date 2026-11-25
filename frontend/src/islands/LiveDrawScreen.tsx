import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { LiveDraw, LiveDrawWinner } from "../lib/types";
import { remaining, ukTime, ukWhen } from "../lib/time";

/**
 * The live-stream draw screen. Verity has already drawn the winners (at the closing time, from the public drand
 * round it committed to); "Reveal Winner" only plays the reveal of the result it was given. Nothing here picks,
 * reorders or changes a winner: the spinning digits are a fixed pattern that always lands on the given ticket.
 */

const STRIP_LOOPS = 3; // full 0–9 turns each digit spins before it lands
const DIGIT_MS = 1800; // first digit's spin; each next digit lands 450ms later
const DIGIT_STEP_MS = 450;
const COUNTDOWN = [3, 2, 1];

type Stage = "idle" | "count" | "roll" | "landed";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function DigitReel({ digit, rolling, delay, reduce }: { digit: number; rolling: boolean; delay: number; reduce: boolean }) {
  // A strip 0…9 repeated, then the target: it starts at the top and slides to the target. Deterministic.
  const strip = useMemo(() => [...Array.from({ length: STRIP_LOOPS * 10 }, (_, i) => i % 10), digit], [digit]);
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!rolling) return setGo(false);
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    return () => cancelAnimationFrame(r);
  }, [rolling]);
  const at = go || reduce ? strip.length - 1 : 0;
  return (
    <span className="ld-reel" aria-hidden="true">
      <span className="ld-strip" style={{ transform: `translateY(calc(-${at} * 1.15em))`, transition: go && !reduce ? `transform ${DIGIT_MS + delay}ms cubic-bezier(.12,.86,.18,1)` : "none" }}>
        {strip.map((d, i) => <span key={i} className="ld-dg">{d}</span>)}
      </span>
    </span>
  );
}

function Confetti() {
  // Fixed pieces (position, colour, timing from the index): a burst, not a random effect.
  const colours = ["#FF2DAA", "#22E6FF", "#FFF23A", "#FFFFFF", "#9B5CFF"];
  return (
    <div className="ld-confetti" aria-hidden="true">
      {Array.from({ length: 90 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colours[i % colours.length], animationDelay: `${(i % 15) * 45}ms`, animationDuration: `${2200 + ((i * 53) % 1400)}ms`, transform: `rotate(${(i * 47) % 360}deg)`, width: i % 3 ? 10 : 6, height: i % 3 ? 16 : 10 }} />
      ))}
    </div>
  );
}

export default function LiveDrawScreen({ initial, slug, presenterKey }: { initial: LiveDraw; slug: string; presenterKey: string | null }) {
  const [data, setData] = useState<LiveDraw>(initial);
  // The page is drawn on the server first, so the first render uses the server's clock and no browser-only values.
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(() => new Date(initial.serverTime).getTime());
  const [host, setHost] = useState("");
  const [reduce, setReduce] = useState(false);
  const [shown, setShown] = useState(0); // winners fully revealed
  const [stage, setStage] = useState<Stage>("idle");
  const [count, setCount] = useState(0);
  const timers = useRef<number[]>([]);
  const [pub, setPub] = useState<"idle" | "confirm" | "busy" | "error">("idle");
  const keyQuery = presenterKey ? `?key=${encodeURIComponent(presenterKey)}` : "";

  // Keep the state fresh (every 4s) until every winner has been drawn.
  useEffect(() => {
    if (data.phase === "drawn" && data.winners.length >= data.places && (data.published || !data.presenter)) return;
    if (data.phase === "void") return;
    const t = window.setInterval(async () => {
      try {
        const next = await api<LiveDraw>(`/api/competitions/${encodeURIComponent(slug)}/live-draw${keyQuery}`);
        setSkew(new Date(next.serverTime).getTime() - Date.now());
        setData(next);
      } catch { /* keep the last state; try again next tick */ }
    }, 4000);
    return () => window.clearInterval(t);
  }, [slug, keyQuery, data.phase, data.winners.length, data.places, data.published, data.presenter]);
  useEffect(() => {
    setSkew(new Date(initial.serverTime).getTime() - Date.now());
    setNow(Date.now());
    setHost(window.location.host);
    // The presenter key stays in this tab's memory only: off the address bar, so it never shows on the stream.
    if (window.location.search.includes("key=")) window.history.replaceState(null, "", window.location.pathname);
    setReduce(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const c = data.competition;
  const width = String(c.maxTickets).length;
  const current: LiveDrawWinner | undefined = data.winners[shown];
  const canReveal = data.phase === "drawn" && stage === "idle" && current !== undefined && current.ticketNumber !== null;
  const landedWinner = stage !== "idle" ? current : undefined;

  const reveal = useCallback(() => {
    if (!canReveal || !current) return;
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const digits = width;
    const roll = DIGIT_MS + (digits - 1) * DIGIT_STEP_MS + 250;
    if (reduce) {
      setStage("landed");
      return;
    }
    setStage("count"); setCount(0);
    COUNTDOWN.forEach((_, i) => later(i * 800, () => setCount(i)));
    later(COUNTDOWN.length * 800, () => setStage("roll"));
    later(COUNTDOWN.length * 800 + roll, () => setStage("landed"));
  }, [canReveal, current, width, reduce]);

  const next = () => { setShown((s) => s + 1); setStage("idle"); };

  // Publishing tells and pays the winners and shows the result everywhere: a second press confirms it.
  async function publish() {
    if (!presenterKey) return;
    if (pub !== "confirm") return setPub("confirm");
    setPub("busy");
    try {
      setData(await api<LiveDraw>(`/api/competitions/${encodeURIComponent(slug)}/live-draw/publish`, { method: "POST", json: { key: presenterKey } }));
      setPub("idle");
    } catch {
      setPub("error");
    }
  }
  const allShown = data.phase === "drawn" && stage === "landed" && shown + 1 >= data.winners.length;

  // Space or Enter reveals (handy with a clicker); F goes full screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if ((e.key === " " || e.key === "Enter") && canReveal) { e.preventDefault(); reveal(); }
      if ((e.key === " " || e.key === "Enter") && stage === "landed" && shown + 1 < data.winners.length) { e.preventDefault(); next(); }
      if (e.key === "f" || e.key === "F") toggleFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  const serverNow = now + skew; // the server's clock, whatever the presenter's computer says
  const left = remaining(c.closesAt ?? new Date().toISOString(), serverNow);
  const already = data.winners.slice(0, stage === "landed" ? shown + 1 : shown);
  const ticket = landedWinner?.ticketNumber != null ? pad(landedWinner.ticketNumber, width) : "".padStart(width, "0");
  const placeLabel = data.places > 1 ? ` ${shown + 1} of ${data.places}` : "";

  return (
    <div className={`ld ${stage === "landed" ? "ld-won" : ""}`} data-testid="live-draw" data-phase={data.phase} data-stage={stage}>
      <header className="ld-top">
        <img src="/logo-sm.webp" alt="Gimme Gimme Prizes" width="96" height="64" className="ld-logo" />
        <span className="ld-live"><i /> Live Draw</span>
        {data.presenter && !data.published && <span className="ld-pres" title="Only this screen can see and publish the result">Presenter</span>}
        <button type="button" className="ld-full" onClick={toggleFull} aria-label="Full screen">⛶</button>
      </header>

      <div className="ld-main">
        <div className="ld-prize">
          {c.image && <img src={c.image} alt="" className="ld-img" />}
          <h1 className="ld-title d">{c.title}</h1>
          <div className="ld-facts">
            <span><b>{c.ticketsSold.toLocaleString("en-GB")}</b> tickets entered</span>
            {data.places > 1 && <span><b>{data.places}</b> winners</span>}
            {c.closesAt && <span>Draw <b>{ukWhen(c.closesAt, now + skew)}</b></span>}
          </div>
        </div>

        <div className="ld-stage">
          {data.phase === "not_open" && <div className="ld-msg"><div className="ld-big d">Coming Soon</div><p>This competition hasn’t opened yet.</p></div>}

          {data.phase === "open" && (
            <div className="ld-msg">
              <div className="ld-kicker">The draw starts in</div>
              <div className="ld-clock d" role="timer">
                {left.days > 0 && <><span>{left.days}<small>d</small></span></>}
                <span>{pad(left.hours, 2)}<small>h</small></span><span>{pad(left.mins, 2)}<small>m</small></span><span>{pad(left.secs, 2)}<small>s</small></span>
              </div>
              <p>Entries close {c.closesAt ? ukWhen(c.closesAt, now + skew).replace(/^(Today|Tomorrow)/, (d) => d.toLowerCase()) : "at the closing time"}. Last chance to get your tickets!</p>
            </div>
          )}

          {data.phase === "waiting" && (
            <div className="ld-msg">
              <div className="ld-big d">Entries Closed</div>
              <p className="ld-wait">Drawing the winning ticket<span className="ld-dots"><i>.</i><i>.</i><i>.</i></span></p>
              {data.beacon && <p className="ld-small">Using public random number #{data.beacon.round.toLocaleString("en-GB")}{data.beacon.at ? `, due ${ukTime(data.beacon.at)}` : ""}</p>}
            </div>
          )}

          {data.phase === "void" && <div className="ld-msg"><div className="ld-big d">No Draw</div><p>This competition had no entries, so there’s nothing to draw.</p></div>}

          {data.phase === "drawn" && (
            <div className="ld-msg">
              {stage === "count" && <div className="ld-count d" key={count}>{COUNTDOWN[count]}</div>}
              {stage !== "count" && (
                <>
                  <div className="ld-kicker">{stage === "landed" ? `Winning ticket${placeLabel}` : stage === "roll" ? "Drawing…" : current ? `Ready to reveal${placeLabel}` : "All winners revealed"}</div>
                  {(stage === "roll" || stage === "landed" || (stage === "idle" && current)) && (
                    <div className="ld-ticket d" aria-live="polite">
                      <span className="ld-hash">#</span>
                      {stage === "idle"
                        ? ticket.split("").map((_, i) => <span key={i} className="ld-reel ld-q">?</span>)
                        : ticket.split("").map((d, i) => <DigitReel key={`${shown}-${i}`} digit={Number(d)} rolling delay={i * DIGIT_STEP_MS} reduce={reduce || stage === "landed"} />)}
                      {stage === "landed" && <span className="sr">Ticket {landedWinner?.ticketNumber}</span>}
                    </div>
                  )}
                  {stage === "landed" && landedWinner && (
                    <div className="ld-winner">
                      <div className="ld-name d">{landedWinner.name}</div>
                      <div className="ld-wins">wins <b>{landedWinner.prizeName}</b></div>
                    </div>
                  )}
                  {canReveal && <button type="button" className="ld-btn d" onClick={reveal} data-testid="reveal">{shown === 0 ? "Reveal Winner" : "Reveal Next Winner"}</button>}
                  {stage === "landed" && shown + 1 < data.winners.length && <button type="button" className="ld-btn ld-btn-2 d" onClick={next}>Next Winner</button>}
                  {allShown && data.presenter && !data.published && (
                    <div className="ld-pub">
                      <button type="button" className="ld-btn ld-btn-2 d" onClick={publish} disabled={pub === "busy"} data-testid="publish">
                        {pub === "confirm" ? `Tap Again: Publish & Email ${data.winners.length > 1 ? "Winners" : "Winner"}` : pub === "busy" ? "Publishing…" : "Publish Results"}
                      </button>
                      {pub === "error" && <span className="ld-pub-err">Couldn’t publish. Try again, or use Publish Result in the admin.</span>}
                    </div>
                  )}
                  {allShown && data.presenter && data.published && <div className="ld-pub-ok" data-testid="published">✓ Published · {data.winners.length > 1 ? "winners" : "winner"} notified</div>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {already.length > 1 && (
        <ol className="ld-list">{already.map((w) => <li key={w.place}><b>#{w.ticketNumber}</b> {w.name}</li>)}</ol>
      )}

      <footer className="ld-foot">
        {data.phase === "drawn" || data.phase === "waiting"
          ? <>Drawn by Verity from a public random number{data.beacon ? ` (drand round #${data.beacon.round.toLocaleString("en-GB")})` : ""}. Check it yourself: <b>{host}{data.verifyUrl}</b></>
          : <>Winner drawn by Verity from a public random number nobody can know in advance. 18+ · UK only · Free postal entry available.</>}
      </footer>
      {stage === "landed" && !reduce && <Confetti key={shown} />}
    </div>
  );
}
