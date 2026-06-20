import { useState, useEffect, useRef } from 'react';
import { getJob } from '../services/api';

/**
 * Poll a background job until done/failed.
 * Usage:
 *   const { job, done, error } = useJob(jobId);
 */
export function useJob(jobId) {
  const [job, setJob] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const { data } = await getJob(jobId);
        if (cancelled) return;
        setJob(data.data);
        if (data.data?.status === 'done' || data.data?.status === 'failed') return; // stop
        timerRef.current = setTimeout(poll, 2000);
      } catch {
        if (!cancelled) timerRef.current = setTimeout(poll, 5000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [jobId]);

  return {
    job,
    done: job?.status === 'done',
    failed: job?.status === 'failed',
    running: job?.status === 'running' || job?.status === 'pending',
    progress: job?.progress || 0,
    result: job?.result,
    error: job?.error,
  };
}
