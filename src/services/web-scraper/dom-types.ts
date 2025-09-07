// DOM types for Cloudflare Workers environment
// These types are needed because Workers don't have DOM APIs built-in
// We use linkedom for HTML parsing which provides these interfaces

// Generic node list interface
export interface CustomNodeList {
  [index: number]: any;
  length: number;
}

export interface CustomDocument {
  querySelector(selectors: string): any | null;
  querySelectorAll(selectors: string): CustomNodeList;
}

export interface CustomElement {
  tagName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  childNodes: any[];
}

export interface CustomNode {
  nodeType: number;
  textContent: string | null;
}

export interface CustomTreeWalker {
  nextNode(): any | null;
}

// Constants that would normally be on Node and NodeFilter
export const NODE_CONSTANTS = {
  TEXT_NODE: 3,
  ELEMENT_NODE: 1,
} as const;

export const NODE_FILTER_CONSTANTS = {
  SHOW_TEXT: 4,
  SHOW_ELEMENT: 1,
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
} as const;

// Type guard functions
export function isElement(node: any): node is Element {
  return node && node.nodeType === NODE_CONSTANTS.ELEMENT_NODE;
}

export function isTextNode(node: any): node is Text {
  return node && node.nodeType === NODE_CONSTANTS.TEXT_NODE;
}

// Helper types for linkedom compatibility
export type LinkedomDocument = {
  querySelector(selectors: string): any | null;
  querySelectorAll(selectors: string): any[];
};

export type LinkedomElement = {
  tagName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  childNodes: any[];
};

export type LinkedomNode = {
  nodeType: number;
  textContent: string | null;
};