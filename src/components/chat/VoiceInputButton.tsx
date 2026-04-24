import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/useVoiceInput';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceInputButton({
  onTranscript,
  disabled,
  className,
  size = 'md',
}: VoiceInputButtonProps) {
  const { isRecording, isTranscribing, duration, start, stop } = useVoiceInput({ onTranscript });

  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-4 w-4';

  if (isTranscribing) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(dim, 'rounded-lg text-muted-foreground', className)}
        disabled
        title="Распознаём речь..."
      >
        <Loader2 className={cn(icon, 'animate-spin')} />
      </Button>
    );
  }

  if (isRecording) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        <span className="text-xs font-mono text-destructive tabular-nums min-w-[28px]">
          {formatDuration(duration)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(dim, 'rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive animate-pulse')}
          onClick={stop}
          title="Остановить и распознать"
        >
          <Square className={cn(icon, 'fill-current')} />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(dim, 'rounded-lg hover:bg-background/80 text-muted-foreground hover:text-primary', className)}
      onClick={start}
      disabled={disabled}
      title="Голосовой ввод"
    >
      <Mic className={icon} />
    </Button>
  );
}
