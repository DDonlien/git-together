import { useEffect, useState } from 'react';

type FeedbackKind = 'success' | 'warning' | 'error' | 'info';
type Feedback<K extends FeedbackKind> = { kind: K; message: string };

export function useTransientFeedback<K extends FeedbackKind>() {
  const [feedback, setFeedback] = useState<Feedback<K> | null>(null);
  useEffect(() => {
    if (feedback?.kind !== 'success') return;
    const timer = window.setTimeout(() => setFeedback(current => current === feedback ? null : current), 6000);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  return [feedback, setFeedback] as const;
}
