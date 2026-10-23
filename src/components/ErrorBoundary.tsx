/**
 * @file Catches render crashes and auto-reloads. VISUAL.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  countdown: number;
}

/**
 * WEB-20: there was no error boundary anywhere in the tree. A single render
 * throw — a malformed profile off disk, a bad weather payload, an artwork URL
 * that resolves to undefined — unmounted the whole app and left a black screen
 * on a device with no keyboard, no dev tools and often no reachable back
 * button. The only recovery was unplugging the TV.
 *
 * This catches, explains, and auto-reloads.
 */
export class ErrorBoundary extends Component<Props, State> {
  private timer: ReturnType<typeof setInterval> | null = null;

  override state: State = { error: null, countdown: 15 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept as console output: on a TV this is retrievable via `adb logcat`,
    // which is realistically the only debugging channel available.
    console.error('[AmbientCanvas] Unhandled render error', error, info.componentStack);

    // Several errors can be caught in one commit; run exactly one countdown.
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.setState((previous) => {
        if (previous.countdown <= 1) {
          window.location.reload();
          return { countdown: 0 };
        }
        return { countdown: previous.countdown - 1 };
      });
    }, 1000);
  }

  override componentWillUnmount(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  private reloadNow = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error, countdown } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-6 bg-black px-12 text-center">
        <h1 className="text-tv-lg font-bold tracking-[0.3em] text-canvas-gold uppercase">
          Ambient Canvas stopped
        </h1>
        <p className="max-w-2xl text-tv-sm leading-relaxed text-white/70">
          Something went wrong while drawing the screen. The app will restart on its own in{' '}
          {countdown} second{countdown === 1 ? '' : 's'}.
        </p>
        <code className="max-w-2xl truncate rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-mono text-tv-xs text-white/50">
          {error.message}
        </code>
        <button
          type="button"
          autoFocus
          onClick={this.reloadNow}
          className="tv-focusable rounded-full border border-canvas-gold bg-canvas-gold/10 px-10 py-4 text-tv-xs font-bold tracking-[0.3em] text-canvas-gold uppercase transition-colors hover:bg-canvas-gold/20 hover:text-white"
        >
          Restart now
        </button>
      </div>
    );
  }
}
