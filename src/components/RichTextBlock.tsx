import React, { useCallback, useLayoutEffect, useRef } from 'react';
import {
  NoteFontFamily,
  TextBlock,
  TextColorSpan,
  TextFontSpan,
  TextStyleSpan,
} from '../types/qaderno';

interface RichTextBlockProps {
  block: TextBlock;
  defaultFont: NoteFontFamily;
  className: string;
  placeholder?: string;
  disabled?: boolean;
  registerEl?: (el: HTMLDivElement | null) => void;
  onChange: (
    nextContent: string,
    nextSpans?: TextFontSpan[],
    nextColorSpans?: TextColorSpan[],
    nextStyleSpans?: TextStyleSpan[],
    cursorOffset?: number
  ) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, cursorOffset: number) => void;
  onSelectionChange: (start: number, end: number, activeFont: NoteFontFamily, activeColor?: string) => void;
}

function getFontCssVar(font: NoteFontFamily): string {
  switch (font) {
    case 'serif':
      return 'var(--font-serif)';
    case 'hand':
      return 'var(--font-hand)';
    case 'mono':
      return 'var(--font-mono)';
    default:
      return 'var(--font-sans)';
  }
}

export function normalizeFontSpans(
  spans: TextFontSpan[] | undefined,
  maxLen: number,
  baseFont: NoteFontFamily
): TextFontSpan[] {
  if (!spans || spans.length === 0 || maxLen <= 0) return [];
  const charFonts: NoteFontFamily[] = new Array(maxLen).fill(baseFont);
  for (const s of spans) {
    const start = Math.max(0, Math.min(maxLen, s.start));
    const end = Math.max(0, Math.min(maxLen, s.end));
    for (let i = start; i < end; i++) {
      charFonts[i] = s.fontFamily;
    }
  }
  const merged: TextFontSpan[] = [];
  let runStart = 0;
  for (let i = 1; i <= maxLen; i++) {
    if (i === maxLen || charFonts[i] !== charFonts[runStart]) {
      if (charFonts[runStart] !== baseFont) {
        merged.push({ start: runStart, end: i, fontFamily: charFonts[runStart] });
      }
      runStart = i;
    }
  }
  return merged;
}

export function normalizeColorSpans(
  spans: TextColorSpan[] | undefined,
  maxLen: number,
  baseColor?: string
): TextColorSpan[] {
  if (!spans || spans.length === 0 || maxLen <= 0) return [];
  const normBase = (baseColor || '').toLowerCase();
  const charColors: string[] = new Array(maxLen).fill(normBase);
  for (const s of spans) {
    const start = Math.max(0, Math.min(maxLen, s.start));
    const end = Math.max(0, Math.min(maxLen, s.end));
    const col = (s.color || '').toLowerCase();
    for (let i = start; i < end; i++) {
      charColors[i] = col;
    }
  }
  const merged: TextColorSpan[] = [];
  let runStart = 0;
  for (let i = 1; i <= maxLen; i++) {
    if (i === maxLen || charColors[i] !== charColors[runStart]) {
      if (charColors[runStart] && charColors[runStart] !== normBase) {
        merged.push({ start: runStart, end: i, color: charColors[runStart] });
      }
      runStart = i;
    }
  }
  return merged;
}

interface CharStyleState {
  bold: boolean;
  italic: boolean;
  code: boolean;
  strike: boolean;
  rawWrap?: string;
}

export function normalizeStyleSpans(
  spans: TextStyleSpan[] | undefined,
  maxLen: number
): TextStyleSpan[] {
  if (!spans || spans.length === 0 || maxLen <= 0) return [];
  const chars: CharStyleState[] = Array.from({ length: maxLen }, () => ({
    bold: false,
    italic: false,
    code: false,
    strike: false,
    rawWrap: undefined,
  }));

  for (const s of spans) {
    const start = Math.max(0, Math.min(maxLen, s.start));
    const end = Math.max(0, Math.min(maxLen, s.end));
    for (let i = start; i < end; i++) {
      const c = chars[i];
      if (s.bold) c.bold = true;
      if (s.italic) c.italic = true;
      if (s.code) c.code = true;
      if (s.strike) c.strike = true;
      if (s.rawWrap) c.rawWrap = s.rawWrap;
    }
  }

  const sameState = (a: CharStyleState, b: CharStyleState) =>
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.code === b.code &&
    a.strike === b.strike &&
    a.rawWrap === b.rawWrap;

  const merged: TextStyleSpan[] = [];
  let runStart = 0;
  for (let i = 1; i <= maxLen; i++) {
    if (i === maxLen || !sameState(chars[i], chars[runStart])) {
      const st = chars[runStart];
      if (st.bold || st.italic || st.code || st.strike) {
        merged.push({
          start: runStart,
          end: i,
          ...(st.bold ? { bold: true } : {}),
          ...(st.italic ? { italic: true } : {}),
          ...(st.code ? { code: true } : {}),
          ...(st.strike ? { strike: true } : {}),
          ...(st.rawWrap ? { rawWrap: st.rawWrap } : {}),
        });
      }
      runStart = i;
    }
  }
  return merged;
}

export function getBlockRangeFromBrowserRange(
  root: HTMLElement,
  range: Range
): { start: number; end: number } | null {
  try {
    if (!range.intersectsNode(root)) return null;
  } catch {
    return null;
  }

  const measureOffset = (container: Node, offset: number): number => {
    const pre = document.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(container, offset);
    return pre.toString().replace(/\u00A0/g, ' ').replace(/\u200B/g, '').length;
  };

  const totalLen = root.textContent?.length ?? 0;
  const rootRange = document.createRange();
  rootRange.selectNodeContents(root);

  let start = 0;
  if (range.compareBoundaryPoints(Range.START_TO_START, rootRange) <= 0) {
    start = 0;
  } else if (root.contains(range.startContainer)) {
    start = measureOffset(range.startContainer, range.startOffset);
  } else {
    start = totalLen;
  }

  let end = totalLen;
  if (range.compareBoundaryPoints(Range.END_TO_END, rootRange) >= 0) {
    end = totalLen;
  } else if (root.contains(range.endContainer)) {
    end = measureOffset(range.endContainer, range.endOffset);
  } else {
    end = 0;
  }

  return start <= end ? { start, end } : { start: end, end: start };
}

export function collectSelectedBlockRangesFromDOM(): Array<{
  pageId: string;
  blockId: string;
  start: number;
  end: number;
}> {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return [];
  const range = sel.getRangeAt(0);
  const blockEls = document.querySelectorAll<HTMLElement>('[data-block-id]');
  const results: Array<{ pageId: string; blockId: string; start: number; end: number }> = [];

  blockEls.forEach((el) => {
    const blockId = el.getAttribute('data-block-id');
    const pageEl = el.closest<HTMLElement>('[data-hybrid-page-id]');
    const pageId = pageEl?.getAttribute('data-hybrid-page-id');
    if (!blockId || !pageId) return;

    if (range.collapsed) {
      if (el.contains(range.startContainer)) {
        const offsets = getSelectionOffsetsInElement(el);
        if (offsets) {
          results.push({ pageId, blockId, start: offsets.start, end: offsets.end });
        }
      }
      return;
    }

    const r = getBlockRangeFromBrowserRange(el, range);
    if (r && r.end > r.start) {
      results.push({ pageId, blockId, start: r.start, end: r.end });
    }
  });

  return results;
}

export function getSelectionOffsetsInElement(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const measureOffset = (container: Node, offset: number): number => {
    const pre = document.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(container, offset);
    return pre.toString().replace(/\u00A0/g, ' ').replace(/\u200B/g, '').length;
  };

  const start = measureOffset(range.startContainer, range.startOffset);
  const end = measureOffset(range.endContainer, range.endOffset);
  return start <= end ? { start, end } : { start: end, end: start };
}

export function setSelectionOffsetsInElement(root: HTMLElement, start: number, end: number): void {
  const sel = window.getSelection();
  if (!sel) return;

  const isCollapsed = start === end;

  const findPosition = (targetOffset: number): { node: Node; offset: number } => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let lastText: Text | null = null;
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      lastText = t;
      const len = t.textContent?.length || 0;
      if (acc + len >= targetOffset) {
        const localOffset = Math.max(0, targetOffset - acc);
        if (
          isCollapsed &&
          localOffset === len &&
          len > 0 &&
          t.parentElement &&
          t.parentElement !== root &&
          t.parentElement.hasAttribute('data-style-span')
        ) {
          const nextNode = walker.nextNode() as Text | null;
          if (nextNode) {
            return { node: nextNode, offset: 0 };
          }
        }
        return { node: t, offset: localOffset };
      }
      acc += len;
    }
    if (lastText) {
      return { node: lastText, offset: lastText.textContent?.length || 0 };
    }
    return { node: root, offset: 0 };
  };

  try {
    const sPos = findPosition(start);
    const ePos = isCollapsed ? sPos : findPosition(end);
    const range = document.createRange();
    range.setStart(sPos.node, sPos.offset);
    range.setEnd(ePos.node, ePos.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore invalid selection range
  }
}

export function resolveActiveFontAt(
  block: TextBlock,
  defaultFont: NoteFontFamily,
  start: number,
  end: number
): NoteFontFamily {
  const baseFont = block.fontFamily || (block.type === 'code' ? 'mono' : defaultFont);
  if (!block.fontSpans || block.fontSpans.length === 0) return baseFont;
  const probe = start === end ? Math.max(0, start - 1) : start;
  const hit = block.fontSpans.find((s) => probe >= s.start && probe < s.end);
  return hit ? hit.fontFamily : baseFont;
}

export function resolveActiveColorAt(
  block: TextBlock,
  start: number,
  end: number
): string | undefined {
  if (!block.colorSpans || block.colorSpans.length === 0) return block.color;
  const probe = start === end ? Math.max(0, start - 1) : start;
  const hit = block.colorSpans.find((s) => probe >= s.start && probe < s.end);
  return hit ? hit.color : block.color;
}

export const RichTextBlock: React.FC<RichTextBlockProps> = ({
  block,
  defaultFont,
  className,
  placeholder,
  disabled,
  registerEl,
  onChange,
  onKeyDown,
  onSelectionChange,
}) => {
  const elRef = useRef<HTMLDivElement>(null);
  const lastSignatureRef = useRef<string>('');

  const baseFont: NoteFontFamily = block.fontFamily || (block.type === 'code' ? 'mono' : defaultFont);
  const baseColor = block.color || '';

  const buildSignature = useCallback(
    (
      type: TextBlock['type'],
      content: string,
      font: NoteFontFamily,
      color: string,
      fontSpans?: TextFontSpan[],
      colorSpans?: TextColorSpan[],
      styleSpans?: TextStyleSpan[]
    ) =>
      JSON.stringify({
        type,
        content,
        font,
        color,
        fontSpans: fontSpans || [],
        colorSpans: colorSpans || [],
        styleSpans: styleSpans || [],
      }),
    []
  );

  const renderDomFromProps = useCallback(() => {
    const el = elRef.current;
    if (!el) return;

    const wasFocused = document.activeElement === el;
    const savedSel = wasFocused ? getSelectionOffsetsInElement(el) : null;

    const text = block.content || '';
    const fontSpans = normalizeFontSpans(block.fontSpans, text.length, baseFont);
    const colorSpans = normalizeColorSpans(block.colorSpans, text.length, baseColor);
    const styleSpans = normalizeStyleSpans(block.styleSpans, text.length);

    el.innerHTML = '';
    if (text.length > 0) {
      const cutSet = new Set<number>([0, text.length]);
      for (const sp of fontSpans) {
        cutSet.add(sp.start);
        cutSet.add(sp.end);
      }
      for (const cp of colorSpans) {
        cutSet.add(cp.start);
        cutSet.add(cp.end);
      }
      for (const st of styleSpans) {
        cutSet.add(st.start);
        cutSet.add(st.end);
      }
      const cuts = Array.from(cutSet).sort((a, b) => a - b);

      for (let i = 0; i < cuts.length - 1; i++) {
        const segStart = cuts[i];
        const segEnd = cuts[i + 1];
        if (segEnd <= segStart) continue;

        const fontHit = fontSpans.find((sp) => sp.start <= segStart && sp.end >= segEnd);
        const colorHit = colorSpans.find((cp) => cp.start <= segStart && cp.end >= segEnd);
        const styleHit = styleSpans.find((st) => st.start <= segStart && st.end >= segEnd);
        const segFont = fontHit ? fontHit.fontFamily : baseFont;
        const segColor = colorHit ? colorHit.color : undefined;
        const hasStyle = Boolean(
          styleHit && (styleHit.bold || styleHit.italic || styleHit.code || styleHit.strike)
        );

        if (segFont !== baseFont || segColor || hasStyle) {
          const spanNode = document.createElement('span');
          if (segFont !== baseFont) {
            spanNode.setAttribute('data-font', segFont);
            spanNode.style.fontFamily = getFontCssVar(segFont);
          }
          if (segColor) {
            spanNode.setAttribute('data-color', segColor);
            spanNode.style.color = segColor;
          }
          if (styleHit && hasStyle) {
            spanNode.setAttribute('data-style-span', 'true');
            spanNode.setAttribute('data-span-start', String(styleHit.start));
            spanNode.setAttribute('data-span-end', String(styleHit.end));
            if (styleHit.rawWrap) {
              spanNode.setAttribute('data-raw-wrap', styleHit.rawWrap);
            }
            if (styleHit.bold) {
              spanNode.setAttribute('data-bold', 'true');
              spanNode.style.fontWeight = '700';
            }
            if (styleHit.italic) {
              spanNode.setAttribute('data-italic', 'true');
              spanNode.style.fontStyle = 'italic';
            }
            if (styleHit.code) {
              spanNode.setAttribute('data-inline-code', 'true');
              spanNode.style.fontFamily = 'var(--font-mono)';
              spanNode.style.backgroundColor = 'rgba(120, 120, 128, 0.14)';
              spanNode.style.padding = '1px 5px';
              spanNode.style.borderRadius = '6px';
              spanNode.style.fontSize = '0.92em';
            }
            if (styleHit.strike) {
              spanNode.setAttribute('data-strike', 'true');
              spanNode.style.textDecoration = 'line-through';
            }
          }
          spanNode.textContent = text.slice(segStart, segEnd);
          el.appendChild(spanNode);
        } else {
          el.appendChild(document.createTextNode(text.slice(segStart, segEnd)));
        }
      }

      if (el.lastChild && el.lastChild.nodeType === Node.ELEMENT_NODE) {
        el.appendChild(document.createTextNode(''));
      }
      el.removeAttribute('data-is-empty');
    } else {
      el.setAttribute('data-is-empty', 'true');
      const placeholderBr = document.createElement('br');
      placeholderBr.setAttribute('data-empty-br', 'true');
      el.appendChild(placeholderBr);
    }

    lastSignatureRef.current = buildSignature(
      block.type,
      text,
      baseFont,
      baseColor,
      fontSpans,
      colorSpans,
      styleSpans
    );

    if (wasFocused && savedSel) {
      const clampedStart = Math.min(text.length, savedSel.start);
      const clampedEnd = Math.min(text.length, savedSel.end);
      setSelectionOffsetsInElement(el, clampedStart, clampedEnd);
    }
  }, [
    block.type,
    block.content,
    block.fontSpans,
    block.colorSpans,
    block.styleSpans,
    baseFont,
    baseColor,
    buildSignature,
  ]);

  useLayoutEffect(() => {
    const len = (block.content || '').length;
    const incomingSig = buildSignature(
      block.type,
      block.content || '',
      baseFont,
      baseColor,
      normalizeFontSpans(block.fontSpans, len, baseFont),
      normalizeColorSpans(block.colorSpans, len, baseColor),
      normalizeStyleSpans(block.styleSpans, len)
    );
    if (incomingSig !== lastSignatureRef.current) {
      renderDomFromProps();
    }
  }, [
    block.type,
    block.content,
    block.fontSpans,
    block.colorSpans,
    block.styleSpans,
    baseFont,
    baseColor,
    buildSignature,
    renderDomFromProps,
  ]);

  const extractContentAndSpans = (): {
    content: string;
    fontSpans: TextFontSpan[];
    colorSpans: TextColorSpan[];
    styleSpans: TextStyleSpan[];
  } => {
    const el = elRef.current;
    if (!el) return { content: '', fontSpans: [], colorSpans: [], styleSpans: [] };

    let content = '';
    const rawFontSpans: TextFontSpan[] = [];
    const rawColorSpans: TextColorSpan[] = [];
    const rawStyleSpans: TextStyleSpan[] = [];

    const walk = (
      node: Node,
      inheritedFont: NoteFontFamily,
      inheritedColor: string,
      inheritedStyle: CharStyleState
    ) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = (node.textContent || '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
        if (txt.length > 0) {
          const start = content.length;
          content += txt;
          const end = content.length;
          if (inheritedFont !== baseFont) {
            rawFontSpans.push({ start, end, fontFamily: inheritedFont });
          }
          if (inheritedColor && inheritedColor.toLowerCase() !== baseColor.toLowerCase()) {
            rawColorSpans.push({ start, end, color: inheritedColor });
          }
          if (inheritedStyle.bold || inheritedStyle.italic || inheritedStyle.code || inheritedStyle.strike) {
            rawStyleSpans.push({
              start,
              end,
              ...(inheritedStyle.bold ? { bold: true } : {}),
              ...(inheritedStyle.italic ? { italic: true } : {}),
              ...(inheritedStyle.code ? { code: true } : {}),
              ...(inheritedStyle.strike ? { strike: true } : {}),
              ...(inheritedStyle.rawWrap ? { rawWrap: inheritedStyle.rawWrap } : {}),
            });
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const elem = node as HTMLElement;
        if (elem.tagName === 'BR') {
          if (!elem.hasAttribute('data-empty-br')) {
            content += '\n';
          }
          return;
        }
        const attrFont = elem.getAttribute('data-font') as NoteFontFamily | null;
        const attrColor = elem.getAttribute('data-color');
        const nextFont = attrFont || inheritedFont;
        const nextColor = attrColor || inheritedColor;
        const nextStyle: CharStyleState = {
          bold: inheritedStyle.bold || elem.getAttribute('data-bold') === 'true',
          italic: inheritedStyle.italic || elem.getAttribute('data-italic') === 'true',
          code: inheritedStyle.code || elem.getAttribute('data-inline-code') === 'true',
          strike: inheritedStyle.strike || elem.getAttribute('data-strike') === 'true',
          rawWrap: elem.getAttribute('data-raw-wrap') || inheritedStyle.rawWrap,
        };
        node.childNodes.forEach((child) => walk(child, nextFont, nextColor, nextStyle));
      }
    };

    el.childNodes.forEach((child) =>
      walk(child, baseFont, baseColor, { bold: false, italic: false, code: false, strike: false })
    );
    if (content.endsWith('\n') && !(block.content || '').endsWith('\n')) {
      content = content.slice(0, -1);
    }
    const fontSpans = normalizeFontSpans(rawFontSpans, content.length, baseFont);
    const colorSpans = normalizeColorSpans(rawColorSpans, content.length, baseColor);
    const styleSpans = normalizeStyleSpans(rawStyleSpans, content.length);
    return { content, fontSpans, colorSpans, styleSpans };
  };

  const emitSelection = () => {
    const el = elRef.current;
    if (!el) return;
    const offsets = getSelectionOffsetsInElement(el);
    if (offsets) {
      onSelectionChange(
        offsets.start,
        offsets.end,
        resolveActiveFontAt(block, defaultFont, offsets.start, offsets.end),
        resolveActiveColorAt(block, offsets.start, offsets.end)
      );
    }
  };

  return (
    <div
      ref={(node) => {
        elRef.current = node;
        registerEl?.(node);
      }}
      data-block-id={block.id}
      data-placeholder={placeholder || ''}
      contentEditable={!disabled}
      suppressContentEditableWarning
      spellCheck
      style={{
        fontFamily: getFontCssVar(baseFont),
        color: block.color || undefined,
      }}
      onInput={() => {
        const el = elRef.current;
        const offsets = el ? getSelectionOffsetsInElement(el) : null;
        const { content, fontSpans, colorSpans, styleSpans } = extractContentAndSpans();
        if (el) {
          if (content.length > 0) {
            el.removeAttribute('data-is-empty');
            el.querySelectorAll('br[data-empty-br="true"]').forEach((br) => br.remove());
          } else {
            el.setAttribute('data-is-empty', 'true');
            if (!el.querySelector('br[data-empty-br="true"]')) {
              const placeholderBr = document.createElement('br');
              placeholderBr.setAttribute('data-empty-br', 'true');
              el.appendChild(placeholderBr);
            }
          }
        }
        lastSignatureRef.current = buildSignature(
          block.type,
          content,
          baseFont,
          baseColor,
          fontSpans,
          colorSpans,
          styleSpans
        );
        onChange(
          content,
          fontSpans.length > 0 ? fontSpans : undefined,
          colorSpans.length > 0 ? colorSpans : undefined,
          styleSpans.length > 0 ? styleSpans : undefined,
          offsets?.end ?? content.length
        );
        emitSelection();
      }}
      onKeyDown={(e) => {
        const el = elRef.current;
        const offsets = el ? getSelectionOffsetsInElement(el) : null;
        onKeyDown(e, offsets?.start ?? block.content.length);
      }}
      onKeyUp={emitSelection}
      onMouseUp={emitSelection}
      onFocus={emitSelection}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (text) {
          document.execCommand('insertText', false, text);
        }
      }}
      className={`rich-block-editable w-full bg-transparent focus:outline-none whitespace-pre-wrap break-words ${
        disabled ? 'no-ios-select' : 'select-text'
      } ${className}`}
    />
  );
};

