declare module "xss" {
  interface IFilterXSSOptions {
    whiteList?: Record<string, string[]>;
    onTag?: (tag: string, html: string, options: Record<string, unknown>) => string | void;
    onTagAttr?: (tag: string, name: string, value: string, isWhiteAttr: boolean) => string | void;
    onIgnoreTag?: (tag: string, html: string, options: Record<string, unknown>) => string | void;
    onIgnoreTagAttr?: (tag: string, name: string, value: string, isWhiteAttr: boolean) => string | void;
    safeAttrValue?: (tag: string, name: string, value: string, cssFilter?: unknown) => string;
    escapeHtml?: (html: string) => string;
    stripIgnoreTag?: boolean;
    stripIgnoreTagBody?: boolean | string[];
    allowCommentTag?: boolean;
    css?: boolean | Record<string, unknown>;
  }

  class FilterXSS {
    constructor(options?: IFilterXSSOptions);
    process(html: string): string;
  }

  interface FilterXSSFunction {
    (html: string, options?: IFilterXSSOptions): string;
    filterXSS: FilterXSSFunction;
    FilterXSS: typeof FilterXSS;
    whiteList: Record<string, string[]>;
  }

  const filterXSS: FilterXSSFunction;
  export = filterXSS;
}