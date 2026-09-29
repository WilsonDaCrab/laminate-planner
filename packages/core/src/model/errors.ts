export type IssueSeverity = 'error' | 'warning';

/** One problem found while loading or checking a project. */
export interface ModelIssue {
  severity: IssueSeverity;
  /** Stable machine-readable code, e.g. 'outlineNotCCW'. */
  code: string;
  /** Location in the project, e.g. 'rooms[0].edges'. */
  path: string;
  message: string;
}

/** Thrown by the loader when a project cannot be used; carries every issue found. */
export class ProjectError extends Error {
  readonly issues: ModelIssue[];

  constructor(issues: ModelIssue[]) {
    super(issues.map((i) => `${i.path || '(project)'}: ${i.message} [${i.code}]`).join('\n'));
    this.name = 'ProjectError';
    this.issues = issues;
  }
}

export const errorIssue = (code: string, path: string, message: string): ModelIssue => ({
  severity: 'error',
  code,
  path,
  message,
});
