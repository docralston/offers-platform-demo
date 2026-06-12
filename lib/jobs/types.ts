/**
 * Job interface for future-proofing automation jobs
 */

export interface JobResult {
  success: boolean;
  artifacts?: Record<string, string | Buffer>;
  error?: string;
}

export interface Job {
  id: string;
  name: string;
  execute(data: unknown): Promise<JobResult>;
}
