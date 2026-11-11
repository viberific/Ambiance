/**
 * @file Settings > Power: turning the TV's screensaver on. VISUAL.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, MonitorPlay } from 'lucide-react';

import { BUTTON, BUTTON_PRIMARY, cx } from '../ui/styles';
import { openScreensaverSettings } from '../../lib/native';
import { useScreensaverStatus } from '../../hooks/useScreensaverStatus';

export interface ScreensaverCardProps {
  onInteract: () => void;
}

/**
 * AND-16/AND-17: a screensaver is a TV setting, not an app setting, and the
 * screen that owns it is buried and differently named on every brand — so this
 * offers to open it directly.
 *
 * AND-17: some Google TV models never list third-party screensavers at all.
 * Where the device owner has unlocked it, the app selects itself directly and
 * this becomes a single button press; where they have not, the instructions
 * below explain how, and end with the option that needs nothing at all.
 */
export function ScreensaverCard({ onInteract }: ScreensaverCardProps) {
  const screensaver = useScreensaverStatus();
  const [showHelp, setShowHelp] = useState(false);
  const [failed, setFailed] = useState(false);

  const packageName = screensaver.packageName || 'com.ambient.canvas.overlay';

  return (
    <div
      className={cx(
        'rounded-2xl border p-6',
        // Sage reads as "done" everywhere else in Power & Sleep; gold is the
        // colour of something still asking to be acted on.
        screensaver.selected
          ? 'border-canvas-sage/30 bg-canvas-sage/[0.08]'
          : 'border-canvas-gold/25 bg-canvas-gold/[0.08]',
      )}
    >
      {/* Fixed row layout, no breakpoints — see the note in DisplaySection. */}
      <div className="flex flex-row items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          {screensaver.selected ? (
            <Check className="mt-1 h-6 w-6 shrink-0 text-canvas-sage" aria-hidden="true" />
          ) : (
            <MonitorPlay className="mt-1 h-6 w-6 shrink-0 text-canvas-gold" aria-hidden="true" />
          )}

          <div className="space-y-1">
            <p
              className={cx(
                'text-tv-xs font-bold tracking-widest uppercase',
                screensaver.selected ? 'text-canvas-sage' : 'text-canvas-gold',
              )}
            >
              {screensaver.selected ? 'Screensaver Is On' : 'Use As Screensaver'}
            </p>
            <p className="max-w-xl text-tv-xs leading-relaxed text-white/65">
              {screensaver.selected
                ? 'Your TV will bring Ambient Canvas back on its own whenever it goes idle.'
                : screensaver.canAssign
                  ? 'This TV has given Ambient Canvas permission to set itself. One press is all it takes.'
                  : "Your TV decides which screensaver runs, so this is set once in the TV's own settings. Choose Ambient Canvas from the list that opens."}
            </p>
            {failed ? (
              <p className="max-w-xl text-tv-xs leading-relaxed text-red-200/80">
                The TV refused the change. Use the TV&rsquo;s own settings instead.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          {screensaver.canAssign && !screensaver.selected ? (
            <button
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => {
                onInteract();
                setFailed(!screensaver.turnOn());
              }}
            >
              Turn On Screensaver
            </button>
          ) : null}

          <button
            type="button"
            className={screensaver.selected || screensaver.canAssign ? BUTTON : BUTTON_PRIMARY}
            onClick={() => {
              onInteract();
              openScreensaverSettings();
              // The user is leaving for the system UI; pick up whatever they
              // chose when the TV hands focus back.
              screensaver.refresh();
            }}
          >
            {screensaver.selected ? 'Change In TV Settings' : 'Open TV Settings'}
          </button>
        </div>
      </div>

      {!screensaver.selected && !screensaver.canAssign ? (
        <>
          <button
            type="button"
            aria-expanded={showHelp}
            className="tv-focusable mt-5 flex items-center gap-2 rounded-lg px-1 py-1 text-tv-xs tracking-widest text-white/55 uppercase transition-colors hover:text-white/80 focus-visible:text-white/90"
            onClick={() => {
              onInteract();
              setShowHelp((open) => !open);
            }}
          >
            <ChevronDown
              className={cx('h-4 w-4 transition-transform', showHelp && 'rotate-180')}
              aria-hidden="true"
            />
            It is not in my TV&rsquo;s list
          </button>

          <AnimatePresence initial={false}>
            {showHelp ? (
              <motion.div
                key="screensaver-help"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                {/* WEB-25: this help block is ~22rem tall and expands inside a
                  pane that no longer scrolls, so it gets its own bounded box
                  rather than pushing the section off the bottom. */}
                <div
                  className="tv-scroll max-h-[18rem] rounded-2xl"
                  tabIndex={0}
                  role="region"
                  aria-label="Screensaver setup instructions"
                >
                  <Instructions packageName={packageName} />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );
}

function Instructions({ packageName }: { packageName: string }) {
  return (
    <div className="mt-5 space-y-4 rounded-2xl border border-white/[0.07] bg-black/15 p-5 text-tv-xs leading-relaxed text-white/70">
      <p>
        Some Google TV models only offer Google&rsquo;s own screensaver and hide every other one.
        Ambient Canvas still works as a screensaver on those TVs &mdash; it is only the list that is
        blocked. You can unlock it once, from a computer:
      </p>

      <ol className="ml-5 list-decimal space-y-2">
        <li>
          On this TV, open <Path>Settings &rsaquo; System &rsaquo; About</Path> and press the build
          number seven times, until it tells you that you are now a developer.
        </li>
        <li>
          Go to <Path>Settings &rsaquo; System &rsaquo; Developer options</Path> and switch on USB
          debugging, plus wireless or network debugging if you see it. Note the TV&rsquo;s IP
          address from <Path>Settings &rsaquo; Network</Path>.
        </li>
        <li>
          On a computer with Android Platform Tools installed, run these two lines, using your
          TV&rsquo;s address in the first one:
          {/* WEB-25: was `overflow-x-auto whitespace-pre`, i.e. a sideways
              scrollbar. Nothing in this app may scroll horizontally, and a
              D-pad cannot drive one anyway, so the commands wrap instead. */}
          <pre className="mt-2 rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-tv-xs break-words whitespace-pre-wrap text-canvas-parchment/80 select-text">
            {`adb connect 192.168.1.50\nadb shell pm grant ${packageName} android.permission.WRITE_SECURE_SETTINGS`}
          </pre>
        </li>
        <li>
          Come back to this screen. The button changes to <Emph>Turn On Screensaver</Emph>. Press
          it, and you are done.
        </li>
      </ol>

      <p className="border-t border-white/10 pt-4">
        <Emph>If you would rather not:</Emph> just leave Ambient Canvas open. It already keeps the
        TV awake and showing art on its own. The screensaver only exists to bring it back
        automatically after you have been watching something else.
      </p>
    </div>
  );
}

function Path({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap text-white/80">{children}</span>;
}

function Emph({ children }: { children: ReactNode }) {
  return <span className="font-bold text-canvas-gold/90">{children}</span>;
}
