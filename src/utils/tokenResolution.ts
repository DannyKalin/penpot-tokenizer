import type { MatrixRow } from '../types';

export function pickTargetValueForMode(
  targetRow: MatrixRow,
  modeName: string | undefined,
): string {
  if (modeName && targetRow.valuesByMode[modeName]?.trim()) {
    return targetRow.valuesByMode[modeName];
  }
  if (modeName && modeName.includes('/')) {
    const modeSuffix = modeName.slice(modeName.indexOf('/') + 1).toLowerCase();
    for (const [k, v] of Object.entries(targetRow.valuesByMode)) {
      if (k.toLowerCase().endsWith(`/${modeSuffix}`) && v.trim() !== '') {
        return v;
      }
    }
  }
  for (const v of Object.values(targetRow.valuesByMode)) {
    if (v.trim() !== '') return v;
  }
  return '';
}

function resolveAliasesInExpression(
  rawValue: string,
  modeName: string | undefined,
  allRows: MatrixRow[],
  depth = 0,
  visited = new Set<string>(),
): { resolved: string; hadAlias: boolean } | null {
  const trimmed = rawValue.trim();
  if (!trimmed || depth > 12) return null;

  let hadAlias = false;
  let unresolved = false;

  const replaced = trimmed.replace(/\{([^{}]+)\}/g, (full, inner: string) => {
    const targetName = inner.trim();
    if (!targetName || visited.has(targetName)) {
      unresolved = true;
      return full;
    }
    const targetRow = allRows.find((r) => r.name === targetName);
    if (!targetRow) {
      unresolved = true;
      return full;
    }
    const nextVal = pickTargetValueForMode(targetRow, modeName);
    if (!nextVal) {
      unresolved = true;
      return full;
    }
    const nextVisited = new Set(visited);
    nextVisited.add(targetName);
    const child = resolveAliasesInExpression(
      nextVal,
      modeName,
      allRows,
      depth + 1,
      nextVisited,
    );
    if (!child) {
      unresolved = true;
      return full;
    }
    hadAlias = true;
    const isStandaloneAlias = trimmed === full;
    const isSimple = /^-?\d+(?:\.\d+)?(?:[a-z%]+)?$/i.test(child.resolved);
    return isStandaloneAlias || isSimple ? child.resolved : `(${child.resolved})`;
  });

  if (unresolved) return null;
  return { resolved: replaced, hadAlias };
}

type ExprToken =
  | { kind: 'num'; value: number; unit: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' };

function tokenizeMath(input: string): ExprToken[] | null {
  const tokens: ExprToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push({ kind: 'op', op: ch });
      i += 1;
      continue;
    }
    const numMatch = /^(?:\d+(?:\.\d+)?|\.\d+)([a-z%]*)/i.exec(input.slice(i));
    if (numMatch) {
      tokens.push({
        kind: 'num',
        value: Number(numMatch[0].slice(0, numMatch[0].length - numMatch[1].length)),
        unit: numMatch[1],
      });
      i += numMatch[0].length;
      continue;
    }
    return null;
  }
  return tokens;
}

export function evaluateMathExpression(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Require at least one operator or parentheses so plain numbers don't get re-evaluated as expressions
  if (!/[+\-*/()]/.test(trimmed)) return null;
  // Ignore CSS color functions or hex strings
  if (trimmed.startsWith('#') || /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(trimmed)) {
    return null;
  }

  const tokens = tokenizeMath(trimmed);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;
  let sharedUnit = '';
  let unitConflict = false;

  const peek = (): ExprToken | undefined => tokens[pos];
  const consume = (): ExprToken => tokens[pos++];

  const parseFactor = (): number | null => {
    const tok = peek();
    if (!tok) return null;
    if (tok.kind === 'op' && (tok.op === '+' || tok.op === '-')) {
      consume();
      const val = parseFactor();
      if (val === null) return null;
      return tok.op === '-' ? -val : val;
    }
    if (tok.kind === 'op' && tok.op === '(') {
      consume();
      const val = parseExpr();
      const close = peek();
      if (val === null || !close || close.kind !== 'op' || close.op !== ')') {
        return null;
      }
      consume();
      return val;
    }
    if (tok.kind === 'num') {
      consume();
      if (tok.unit) {
        if (!sharedUnit) {
          sharedUnit = tok.unit;
        } else if (sharedUnit.toLowerCase() !== tok.unit.toLowerCase()) {
          unitConflict = true;
        }
      }
      return tok.value;
    }
    return null;
  };

  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (true) {
      const tok = peek();
      if (tok?.kind === 'op' && (tok.op === '*' || tok.op === '/')) {
        consume();
        const right = parseFactor();
        if (right === null) return null;
        if (tok.op === '/') {
          if (right === 0) return null;
          left /= right;
        } else {
          left *= right;
        }
      } else {
        break;
      }
    }
    return left;
  };

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (true) {
      const tok = peek();
      if (tok?.kind === 'op' && (tok.op === '+' || tok.op === '-')) {
        consume();
        const right = parseTerm();
        if (right === null) return null;
        left = tok.op === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  };

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result) || unitConflict) {
    return null;
  }
  const rounded = Number(result.toFixed(4));
  return `${rounded}${sharedUnit}`;
}

export function resolveAliasValue(
  rawValue: string,
  modeName: string | undefined,
  allRows: MatrixRow[],
): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const hasAliasSyntax = /\{[^{}]+\}/.test(trimmed);
  const directMath = !hasAliasSyntax ? evaluateMathExpression(trimmed) : null;
  if (directMath !== null) {
    return directMath;
  }
  if (!hasAliasSyntax) return null;

  const expanded = resolveAliasesInExpression(trimmed, modeName, allRows);
  if (!expanded || !expanded.hadAlias) return null;

  const evaluated = evaluateMathExpression(expanded.resolved);
  return evaluated ?? expanded.resolved;
}
