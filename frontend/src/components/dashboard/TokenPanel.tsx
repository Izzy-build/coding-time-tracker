'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, toUserMessage } from '@/lib/api/errors';
import { getCliToken, updateCliToken } from '@/lib/api/tokens';
import { useAuth } from '@/lib/auth/auth-context';
import { maskCliToken } from '@/lib/cli-token';
import { useCliToken } from '@/lib/token/use-cli-token';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';

/**
 * CLI token management.
 *
 * The backend keeps only a hash, so the raw token exists in the browser only right after it is generated.
 * It is held in this tab (see cli-token-store) and is NEVER rendered into the page while masked: the hidden
 * state shows bullets, not a blurred copy of the real value.
 */
export function TokenPanel() {
  const { session } = useAuth();
  const { token, save } = useCliToken();
  const toast = useToast();
  const jwt = session?.token ?? '';

  const [revealed, setRevealed] = useState(false);
  const [freshlyIssued, setFreshlyIssued] = useState(false);
  /** The server told us a token already exists but we don't hold it. */
  const [existsElsewhere, setExistsElsewhere] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  async function onGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const created = await getCliToken(jwt);
      save(created);
      setExistsElsewhere(false);
      setFreshlyIssued(true);
      setRevealed(true);
      toast({ tone: 'success', title: 'CLI token generated' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'TOKEN_ALREADY_EXISTS') {
        setExistsElsewhere(true);
      } else {
        setGenerateError(toUserMessage(error));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function onConfirmUpdate() {
    setUpdating(true);
    setUpdateError(null);
    try {
      const rotated = await updateCliToken(jwt);
      save(rotated); // replaces the old token everywhere in the UI
      setExistsElsewhere(false);
      setFreshlyIssued(true);
      setRevealed(true);
      setConfirmOpen(false);
      toast({
        tone: 'success',
        title: 'New CLI token generated',
        message: 'Your previous token no longer works. Update the CLI with the new one.',
      });
    } catch (error) {
      setUpdateError(toUserMessage(error));
    } finally {
      setUpdating(false);
    }
  }

  async function onCopy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
      toast({ tone: 'success', title: 'Token copied to clipboard' });
    } catch {
      toast({ tone: 'error', title: "Couldn't copy automatically", message: 'Reveal the token and copy it manually.' });
    }
  }

  const openConfirm = () => {
    setUpdateError(null);
    setConfirmOpen(true);
  };

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-accent">
          <KeyIcon className="size-[18px]" />
        </span>
        <div>
          <h2 className="font-medium">CLI token</h2>
          <p className="mt-1 text-sm text-muted">
            Connect the CLI to your account with <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-xs text-fg">ourcli config {'<TOKEN>'}</code>
          </p>
        </div>
      </div>

      <div className="mt-6">
        {token ? (
          <div className="space-y-4">
            {freshlyIssued && (
              <Alert tone="success" title="Copy your token now">
                We only store a hash of it, so we can’t show it again later. It stays available in this browser tab until you close it.
              </Alert>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <code
                data-testid="cli-token"
                aria-label={revealed ? 'CLI token' : 'CLI token (hidden)'}
                className="block min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-bg px-4 py-3 font-mono text-[15px] tracking-wide whitespace-nowrap text-fg select-all"
              >
                {revealed ? token : maskCliToken()}
              </code>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setRevealed((v) => !v)} aria-pressed={revealed}>
                  {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  {revealed ? 'Hide' : 'Reveal'}
                </Button>
                <Button variant="secondary" onClick={onCopy}>
                  {copied ? <CheckIcon className="size-4 text-accent" /> : <CopyIcon className="size-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-start justify-between gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
              <p className="text-sm text-muted">Think it was exposed? Replace it. The current token stops working immediately.</p>
              <Button variant="danger" size="sm" onClick={openConfirm}>
                Update token
              </Button>
            </div>
          </div>
        ) : existsElsewhere ? (
          <div className="space-y-4">
            <Alert tone="info" title="You already have a CLI token">
              For security we only store a hash of it, so it can’t be shown again. If you’ve lost it, generate a new one. That
              immediately invalidates the current token.
            </Alert>
            <Button variant="danger" onClick={openConfirm}>
              Update token
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {generateError && <Alert tone="error">{generateError}</Alert>}
            <p className="text-sm leading-relaxed text-muted">
              Generate your token to connect the CLI. It’s shown once, so copy it somewhere safe.
            </p>
            <Button onClick={onGenerate} loading={generating}>
              {generating ? 'Generating…' : 'Generate CLI token'}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Update your CLI token?"
        confirmLabel="Update token"
        error={updateError}
        loading={updating}
        onConfirm={onConfirmUpdate}
        onCancel={() => setConfirmOpen(false)}
      >
        Updating your token will immediately invalidate your current CLI token. Continue?
      </ConfirmDialog>
    </Card>
  );
}
