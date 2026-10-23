/**
 * @file In-app modal replacing alert()/confirm(). VISUAL.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, cx } from './ui/styles';

/**
 * WEB-17: the app used window.alert() and window.confirm() for pairing errors,
 * unpair confirmation and factory reset. On Android TV those render as a small
 * system dialog with tiny text, they are modal to the whole WebView, and their
 * button focus order is not reliably reachable with a D-pad — on some launchers
 * the user simply cannot dismiss them without a mouse. They also block the JS
 * thread, freezing the artwork crossfade mid-animation.
 *
 * WEB-23: focus is trapped and restored, and the default action is focused on
 * open so a remote user can just press OK.
 */

export interface DialogAction {
  label: string;
  onSelect?: () => void;
  variant?: 'primary' | 'default' | 'danger';
}

export interface DialogRequest {
  title: string;
  message: string;
  actions?: DialogAction[];
  /** Optional single-line text input, e.g. sensor password. */
  input?: {
    placeholder?: string;
    type?: 'text' | 'password';
    initialValue?: string;
    onSubmit: (value: string) => void;
    submitLabel?: string;
  };
}

interface Props {
  request: DialogRequest | null;
  onClose: () => void;
}

export function Dialog({ request, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!request) return;
    setValue(request.input?.initialValue ?? '');
    previousFocus.current = document.activeElement as HTMLElement | null;

    // Focus the first control so the remote has somewhere to land.
    const raf = requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      previousFocus.current?.focus?.();
    };
  }, [request]);

  const trapFocus = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!request) return null;

  const actions: DialogAction[] = request.actions?.length
    ? request.actions
    : [{ label: 'OK', variant: 'primary' }];

  /*
   * Close first, then act. An action that opens a follow-up dialog (a
   * confirmation leading to a password prompt, say) calls show() from inside
   * onSelect; closing afterwards wiped that new dialog off the screen before
   * it ever rendered.
   */
  const handleAction = (action: DialogAction) => {
    onClose();
    action.onSelect?.();
  };

  const submitInput = () => {
    onClose();
    request.input?.onSubmit(value);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ambient-dialog-title"
      className="animate-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-8 backdrop-blur-sm"
      onKeyDown={(event) => {
        trapFocus(event);
        if (event.key === 'Escape' || event.key === 'Backspace') {
          const target = event.target as HTMLElement;
          if (target.tagName === 'INPUT' && event.key === 'Backspace') return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="animate-dialog-panel w-full max-w-2xl rounded-2xl border border-white/15 bg-canvas-surface/95 p-10 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
      >
        <h2
          id="ambient-dialog-title"
          className="mb-4 text-tv-base font-bold tracking-[0.25em] text-canvas-gold uppercase"
        >
          {request.title}
        </h2>
        <p className="mb-8 text-tv-sm leading-relaxed text-white/75">{request.message}</p>

        {request.input ? (
          <div className="mb-8">
            <input
              type={request.input.type ?? 'text'}
              value={value}
              placeholder={request.input.placeholder ?? ''}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitInput();
                }
              }}
              className={cx(FIELD, 'py-4 text-tv-sm')}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-4">
          {request.input ? (
            <button type="button" onClick={submitInput} className={BUTTON_PRIMARY}>
              {request.input.submitLabel ?? 'Save'}
            </button>
          ) : null}

          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => handleAction(action)}
              className={
                action.variant === 'primary'
                  ? BUTTON_PRIMARY
                  : action.variant === 'danger'
                    ? BUTTON_DANGER
                    : BUTTON_SECONDARY
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Small queue so callers can `show({...})` from anywhere without prop drilling. */
export function useDialog() {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  const show = useCallback((next: DialogRequest) => setRequest(next), []);
  const close = useCallback(() => setRequest(null), []);

  const confirm = useCallback(
    (title: string, message: string, onConfirm: () => void, confirmLabel = 'Confirm') => {
      setRequest({
        title,
        message,
        actions: [
          { label: 'Cancel' },
          { label: confirmLabel, variant: 'danger', onSelect: onConfirm },
        ],
      });
    },
    [],
  );

  const notify = useCallback(
    (title: string, message: string) => setRequest({ title, message }),
    [],
  );

  return { request, show, close, confirm, notify };
}
