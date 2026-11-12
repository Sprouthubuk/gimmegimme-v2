import { setSoundOn, useSoundOn } from "./sounds";

/** "Sound off" / "Sound on". Off until the player turns it on. */
export function SoundToggle() {
  const on = useSoundOn();
  return (
    <button type="button" className="rg-xmas-sound" aria-pressed={on} onClick={() => setSoundOn(!on)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on ? (
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
      {on ? "Sound on" : "Sound off"}
    </button>
  );
}
