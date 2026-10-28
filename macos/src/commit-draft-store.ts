import type { CommitDraft, CommitGroup, CommitPlan, GenerateCommitMessage, GenerateCommitPlan } from './local-submit-model';
import type { ApiInputs } from './import-model';

export type SavedDraft = { draft: CommitDraft; edited: Record<keyof CommitDraft, boolean>; generated: boolean; head: string; changeKey?: string; paths?: string[]; plan?: CommitGroup[] };
type GenerationInput = Omit<ApiInputs['generateCommitMessage'], 'generationId'>;
type PlanGenerationInput = Omit<ApiInputs['generateCommitPlan'], 'generationId'>;
type Job = { kind: 'draft' | 'plan'; identity: string; controller: AbortController; status: 'running' | 'completed' | 'failed' | 'cancelled'; error: string; promise: Promise<CommitDraft | CommitPlan> };
export const generationIdentity = (draft: Pick<SavedDraft, 'head' | 'changeKey' | 'paths'>) => JSON.stringify([draft.head, draft.changeKey, [...(draft.paths || [])].sort()]);

// The service session owns jobs and drafts. Dialog visibility owns neither.
export function createCommitDraftStore() {
  const drafts = new Map<string, SavedDraft>();
  const jobs = new Map<string, Job>();
  const listeners = new Set<() => void>();
  let revision = 0;
  const notify = () => { revision++; for (const listener of listeners) listener(); };
  const getJob = (key: string, draft: SavedDraft) => {
    const job = jobs.get(key);
    return job?.identity === generationIdentity(draft) ? job : undefined;
  };
  const generate = (key: string, saved: SavedDraft, input: GenerationInput, request: GenerateCommitMessage, pauseRefresh?: () => () => void) => {
    const previous = getJob(key, saved);
    if (previous?.status === 'running' && previous.kind === 'draft') return previous.promise as Promise<CommitDraft>;
    jobs.get(key)?.controller.abort();
    drafts.set(key, saved);
    const controller = new AbortController();
    const resumeRefresh = pauseRefresh?.();
    const job: Job = { kind: 'draft', identity: generationIdentity(saved), controller, status: 'running', error: '', promise: Promise.resolve(saved.draft) };
    jobs.set(key, job);
    job.promise = (async () => {
      try {
        const result = await request(input, controller.signal);
        controller.signal.throwIfAborted();
        const latest = drafts.get(key);
        if (jobs.get(key) === job && latest && generationIdentity(latest) === job.identity) {
          drafts.set(key, { ...latest, generated: true, draft: {
            summary: latest.edited.summary ? latest.draft.summary : result.summary,
            description: latest.edited.description ? latest.draft.description : result.description,
          } });
        }
        job.status = 'completed';
        return result;
      } catch (problem) {
        job.status = controller.signal.aborted ? 'cancelled' : 'failed';
        job.error = problem instanceof Error ? problem.message : 'AI 说明生成未完成。';
        throw problem;
      } finally { resumeRefresh?.(); notify(); }
    })();
    notify();
    return job.promise as Promise<CommitDraft>;
  };
  const generatePlan = (key: string, saved: SavedDraft, input: PlanGenerationInput, request: GenerateCommitPlan) => {
    const previous = getJob(key, saved);
    if (previous?.status === 'running' && previous.kind === 'plan') return previous.promise as Promise<CommitPlan>;
    jobs.get(key)?.controller.abort();
    drafts.set(key, saved);
    const controller = new AbortController();
    const job: Job = { kind: 'plan', identity: generationIdentity(saved), controller, status: 'running', error: '', promise: Promise.resolve({ groups: [] }) };
    jobs.set(key, job);
    job.promise = (async () => {
      try {
        const result = await request(input, controller.signal);
        controller.signal.throwIfAborted();
        const latest = drafts.get(key);
        if (jobs.get(key) === job && latest && generationIdentity(latest) === job.identity) {
          drafts.set(key, { ...latest, generated: true, plan: result.groups });
        }
        job.status = 'completed';
        return result;
      } catch (problem) {
        job.status = controller.signal.aborted ? 'cancelled' : 'failed';
        job.error = problem instanceof Error ? problem.message : 'AI 分析未完成。';
        throw problem;
      } finally { notify(); }
    })();
    notify();
    return job.promise as Promise<CommitPlan>;
  };
  return {
    drafts, getJob, generate, generatePlan,
    cancel: (key: string) => jobs.get(key)?.controller.abort(),
    stop: () => { for (const job of jobs.values()) job.controller.abort(); },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
  };
}
