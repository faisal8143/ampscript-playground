export interface RenderOptions {
  /** Profile attributes, used by %%Name%%, AttributeValue() and bare attribute names. */
  subscriber?: Record<string, unknown>;
  /** Data extensions by name, each an array of rows. */
  dataExtensions?: Record<string, Array<Record<string, unknown>>>;
  /** Content blocks by key or name, for ContentBlockByKey() and friends. */
  contentBlocks?: Record<string, string>;
  /** Query string / form values for RequestParameter(). */
  requestParameters?: Record<string, string>;
  /** What Now() returns. ISO string or Date. Defaults to the current time. */
  now?: string | Date | null;
}

export interface RenderError {
  message: string;
  /** 1-based line in the template, when known. */
  line: number | null;
}

export interface RenderResult {
  html: string;
  errors: RenderError[];
  warnings: string[];
  /** Data extension writes made during the render. */
  log: string[];
  /** True when RaiseError() stopped the render. */
  raised: boolean;
  redirect: string | null;
  /** Data extensions after any writes. */
  dataExtensions: Record<string, Array<Record<string, unknown>>>;
}

export function render(template: string, options?: RenderOptions): RenderResult;
export const version: string;
/** Names of the supported functions. */
export const functions: string[];
