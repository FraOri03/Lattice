/**
 * FormulaEngine: a small, dependency-free spreadsheet formula evaluator.
 *
 * Supports Excel-style expressions over the current sheet:
 *   - literals: numbers, "strings" ("" escapes a quote), TRUE/FALSE
 *   - references: A1, $B$2 ($ anchors are accepted and ignored)
 *   - ranges: A1:B10 (as function arguments)
 *   - operators: + - * / ^ (right-assoc) · unary ± · % postfix · & concat
 *     · comparisons = <> < > <= >=
 *   - functions (registry, extensible): SUM AVERAGE MIN MAX COUNT COUNTA
 *     IF ROUND ABS SQRT
 *
 * Errors surface as Excel-style codes (#DIV/0!, #CYCLE!, #NAME?, #VALUE!,
 * #REF!, #ERROR!). Evaluation is recursive over cell dependencies with
 * memoization and cycle detection. Cross-sheet references are not
 * supported (documented limitation).
 */

import type { CellData, SheetData } from './sheetModel'
import { cellKey, colIndex } from './sheetModel'

export type Scalar = number | string | boolean | null

export class FormulaError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

const err = (code: string): never => {
  throw new FormulaError(code)
}

/* ---------------- tokenizer ---------------- */

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'ref'; r: number; c: number }
  | { t: 'op'; v: string }
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'comma' }
  | { t: 'colon' }
  | { t: 'referr' }

const REF_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)(?![A-Za-z0-9_(])/
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_.]*/
const NUM_RE = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }
    if (src.startsWith('#REF!', i)) {
      out.push({ t: 'referr' })
      i += 5
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let s = ''
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"'
            j += 2
            continue
          }
          break
        }
        s += src[j++]
      }
      if (j >= src.length) err('#ERROR!')
      out.push({ t: 'str', v: s })
      i = j + 1
      continue
    }
    const num = NUM_RE.exec(src.slice(i))
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) })
      i += num[0].length
      continue
    }
    const ref = REF_RE.exec(src.slice(i))
    if (ref) {
      out.push({ t: 'ref', r: Number(ref[2]) - 1, c: colIndex(ref[1]) })
      i += ref[0].length
      continue
    }
    const ident = IDENT_RE.exec(src.slice(i))
    if (ident) {
      out.push({ t: 'ident', v: ident[0].toUpperCase() })
      i += ident[0].length
      continue
    }
    if (ch === '(') {
      out.push({ t: 'lparen' })
      i++
      continue
    }
    if (ch === ')') {
      out.push({ t: 'rparen' })
      i++
      continue
    }
    if (ch === ',' || ch === ';') {
      out.push({ t: 'comma' })
      i++
      continue
    }
    if (ch === ':') {
      out.push({ t: 'colon' })
      i++
      continue
    }
    if (ch === '<') {
      if (src[i + 1] === '>') {
        out.push({ t: 'op', v: '<>' })
        i += 2
      } else if (src[i + 1] === '=') {
        out.push({ t: 'op', v: '<=' })
        i += 2
      } else {
        out.push({ t: 'op', v: '<' })
        i++
      }
      continue
    }
    if (ch === '>') {
      if (src[i + 1] === '=') {
        out.push({ t: 'op', v: '>=' })
        i += 2
      } else {
        out.push({ t: 'op', v: '>' })
        i++
      }
      continue
    }
    if ('+-*/^%&='.includes(ch)) {
      out.push({ t: 'op', v: ch })
      i++
      continue
    }
    err('#ERROR!')
  }
  return out
}

/* ---------------- parser (recursive descent) ---------------- */

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; r: number; c: number }
  | { k: 'range'; r1: number; c1: number; r2: number; c2: number }
  | { k: 'referr' }
  | { k: 'un'; op: string; x: Node }
  | { k: 'pct'; x: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }
  private expect(t: Token['t']): Token {
    const tok = this.next()
    if (!tok || tok.t !== t) err('#ERROR!')
    return tok!
  }

  parse(): Node {
    const node = this.comparison()
    if (this.pos < this.tokens.length) err('#ERROR!')
    return node
  }

  private comparison(): Node {
    let a = this.concat()
    for (;;) {
      const tok = this.peek()
      if (
        tok?.t === 'op' &&
        ['=', '<>', '<', '>', '<=', '>='].includes(tok.v)
      ) {
        this.next()
        a = { k: 'bin', op: tok.v, a, b: this.concat() }
      } else return a
    }
  }

  private concat(): Node {
    let a = this.additive()
    while (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '&') {
      this.next()
      a = { k: 'bin', op: '&', a, b: this.additive() }
    }
    return a
  }

  private additive(): Node {
    let a = this.multiplicative()
    for (;;) {
      const tok = this.peek()
      if (tok?.t === 'op' && (tok.v === '+' || tok.v === '-')) {
        this.next()
        a = { k: 'bin', op: tok.v, a, b: this.multiplicative() }
      } else return a
    }
  }

  private multiplicative(): Node {
    let a = this.exponent()
    for (;;) {
      const tok = this.peek()
      if (tok?.t === 'op' && (tok.v === '*' || tok.v === '/')) {
        this.next()
        a = { k: 'bin', op: tok.v, a, b: this.exponent() }
      } else return a
    }
  }

  private exponent(): Node {
    const a = this.unary()
    const tok = this.peek()
    if (tok?.t === 'op' && tok.v === '^') {
      this.next()
      return { k: 'bin', op: '^', a, b: this.exponent() } // right-assoc
    }
    return a
  }

  private unary(): Node {
    const tok = this.peek()
    if (tok?.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      this.next()
      return { k: 'un', op: tok.v, x: this.unary() }
    }
    return this.postfix()
  }

  private postfix(): Node {
    let node = this.primary()
    while (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '%') {
      this.next()
      node = { k: 'pct', x: node }
    }
    return node
  }

  private primary(): Node {
    const tok = this.next()
    if (!tok) return err('#ERROR!') as never
    switch (tok.t) {
      case 'num':
        return { k: 'num', v: tok.v }
      case 'str':
        return { k: 'str', v: tok.v }
      case 'referr':
        return { k: 'referr' }
      case 'ref': {
        if (this.peek()?.t === 'colon') {
          this.next()
          const end = this.next()
          if (end?.t !== 'ref') err('#ERROR!')
          const e = end as Extract<Token, { t: 'ref' }>
          return {
            k: 'range',
            r1: Math.min(tok.r, e.r),
            c1: Math.min(tok.c, e.c),
            r2: Math.max(tok.r, e.r),
            c2: Math.max(tok.c, e.c),
          }
        }
        return { k: 'ref', r: tok.r, c: tok.c }
      }
      case 'ident': {
        if (tok.v === 'TRUE') return { k: 'bool', v: true }
        if (tok.v === 'FALSE') return { k: 'bool', v: false }
        if (this.peek()?.t !== 'lparen') err('#NAME?')
        this.next()
        const args: Node[] = []
        if (this.peek()?.t !== 'rparen') {
          args.push(this.comparison())
          while (this.peek()?.t === 'comma') {
            this.next()
            args.push(this.comparison())
          }
        }
        this.expect('rparen')
        return { k: 'call', name: tok.v, args }
      }
      case 'lparen': {
        const inner = this.comparison()
        this.expect('rparen')
        return inner
      }
      default:
        return err('#ERROR!') as never
    }
  }
}

/* ---------------- evaluation ---------------- */

export type GetCellValue = (r: number, c: number) => Scalar

function toNumber(v: Scalar): number {
  if (v === null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = Number(v.trim() === '' ? 0 : v)
  if (Number.isNaN(n)) err('#VALUE!')
  return n
}

function toText(v: Scalar): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

/** Flatten arguments for aggregate functions: ranges spread into scalars. */
type Arg = Scalar | Scalar[]

function* scalars(args: Arg[]): Generator<Scalar> {
  for (const a of args) {
    if (Array.isArray(a)) yield* a
    else yield a
  }
}

function* numbers(args: Arg[]): Generator<number> {
  for (const v of scalars(args)) {
    // aggregates skip text and blanks (Excel semantics), keep numbers
    if (typeof v === 'number') yield v
    else if (typeof v === 'boolean') yield v ? 1 : 0
  }
}

type SheetFunction = (args: Arg[]) => Scalar

/** Function registry — the extension point for future functions/plugins. */
export const FUNCTIONS: Record<string, SheetFunction> = {
  SUM: (args) => {
    let sum = 0
    for (const n of numbers(args)) sum += n
    return sum
  },
  AVERAGE: (args) => {
    let sum = 0
    let count = 0
    for (const n of numbers(args)) {
      sum += n
      count++
    }
    if (!count) err('#DIV/0!')
    return sum / count
  },
  MIN: (args) => {
    let min: number | null = null
    for (const n of numbers(args)) min = min === null ? n : Math.min(min, n)
    return min ?? 0
  },
  MAX: (args) => {
    let max: number | null = null
    for (const n of numbers(args)) max = max === null ? n : Math.max(max, n)
    return max ?? 0
  },
  COUNT: (args) => {
    let count = 0
    for (const v of scalars(args)) if (typeof v === 'number') count++
    return count
  },
  COUNTA: (args) => {
    let count = 0
    for (const v of scalars(args)) if (v !== null && v !== '') count++
    return count
  },
  IF: (args) => {
    if (args.length < 2 || args.length > 3) err('#VALUE!')
    const cond = args[0]
    if (Array.isArray(cond)) err('#VALUE!')
    const truthy =
      typeof cond === 'boolean'
        ? cond
        : typeof cond === 'number'
          ? cond !== 0
          : cond !== null && cond !== ''
    const branch = truthy ? args[1] : (args[2] ?? false)
    if (Array.isArray(branch)) err('#VALUE!')
    return branch as Scalar
  },
  ROUND: (args) => {
    if (args.length < 1 || args.length > 2 || Array.isArray(args[0])) err('#VALUE!')
    const digits = args.length > 1 && !Array.isArray(args[1]) ? toNumber(args[1] as Scalar) : 0
    const factor = 10 ** Math.trunc(digits)
    return Math.round(toNumber(args[0] as Scalar) * factor) / factor
  },
  ABS: (args) => {
    if (args.length !== 1 || Array.isArray(args[0])) err('#VALUE!')
    return Math.abs(toNumber(args[0] as Scalar))
  },
  SQRT: (args) => {
    if (args.length !== 1 || Array.isArray(args[0])) err('#VALUE!')
    const n = toNumber(args[0] as Scalar)
    if (n < 0) err('#NUM!')
    return Math.sqrt(n)
  },
}

function evalNode(node: Node, getCell: GetCellValue): Arg {
  switch (node.k) {
    case 'num':
      return node.v
    case 'str':
      return node.v
    case 'bool':
      return node.v
    case 'referr':
      return err('#REF!') as never
    case 'ref':
      return getCell(node.r, node.c)
    case 'range': {
      const out: Scalar[] = []
      // hard cap so a mistyped huge range can't freeze the tab
      if ((node.r2 - node.r1 + 1) * (node.c2 - node.c1 + 1) > 100_000) err('#VALUE!')
      for (let r = node.r1; r <= node.r2; r++) {
        for (let c = node.c1; c <= node.c2; c++) out.push(getCell(r, c))
      }
      return out
    }
    case 'un': {
      const v = evalNode(node.x, getCell)
      if (Array.isArray(v)) err('#VALUE!')
      const n = toNumber(v as Scalar)
      return node.op === '-' ? -n : n
    }
    case 'pct': {
      const v = evalNode(node.x, getCell)
      if (Array.isArray(v)) err('#VALUE!')
      return toNumber(v as Scalar) / 100
    }
    case 'bin': {
      const a = evalNode(node.a, getCell)
      const b = evalNode(node.b, getCell)
      if (Array.isArray(a) || Array.isArray(b)) err('#VALUE!')
      const x = a as Scalar
      const y = b as Scalar
      switch (node.op) {
        case '+':
          return toNumber(x) + toNumber(y)
        case '-':
          return toNumber(x) - toNumber(y)
        case '*':
          return toNumber(x) * toNumber(y)
        case '/': {
          const d = toNumber(y)
          if (d === 0) err('#DIV/0!')
          return toNumber(x) / d
        }
        case '^':
          return toNumber(x) ** toNumber(y)
        case '&':
          return toText(x) + toText(y)
        case '=':
          return compare(x, y) === 0
        case '<>':
          return compare(x, y) !== 0
        case '<':
          return compare(x, y) < 0
        case '>':
          return compare(x, y) > 0
        case '<=':
          return compare(x, y) <= 0
        case '>=':
          return compare(x, y) >= 0
        default:
          return err('#ERROR!') as never
      }
    }
    case 'call': {
      const fn = FUNCTIONS[node.name]
      if (!fn) err('#NAME?')
      return fn(node.args.map((a) => evalNode(a, getCell)))
    }
  }
}

function compare(a: Scalar, b: Scalar): number {
  if (typeof a === 'string' || typeof b === 'string') {
    const sa = toText(a).toLowerCase()
    const sb = toText(b).toLowerCase()
    return sa < sb ? -1 : sa > sb ? 1 : 0
  }
  const na = toNumber(a)
  const nb = toNumber(b)
  return na < nb ? -1 : na > nb ? 1 : 0
}

/** Parse + evaluate a single formula against a cell getter. */
export function evaluateFormula(formula: string, getCell: GetCellValue): Scalar {
  const node = new Parser(tokenize(formula)).parse()
  const v = evalNode(node, getCell)
  if (Array.isArray(v)) err('#VALUE!')
  return v as Scalar
}

export interface ComputedCell {
  value: Scalar
  error?: string
}

/**
 * Evaluate every formula cell of a sheet. Returns a map keyed "row:col"
 * containing entries ONLY for formula cells; literal cells display their
 * raw value directly. Dependencies resolve recursively with memoization;
 * cycles yield #CYCLE! instead of hanging.
 */
export function evaluateSheet(sheet: SheetData): Map<string, ComputedCell> {
  const memo = new Map<string, ComputedCell>()
  const visiting = new Set<string>()

  const valueOf = (cell: CellData | undefined, key: string): Scalar => {
    if (!cell) return null
    if (cell.f === undefined) return cell.v ?? null
    const cached = memo.get(key)
    if (cached) {
      if (cached.error) throw new FormulaError(cached.error)
      return cached.value
    }
    if (visiting.has(key)) {
      const cycle: ComputedCell = { value: '#CYCLE!', error: '#CYCLE!' }
      memo.set(key, cycle)
      throw new FormulaError('#CYCLE!')
    }
    visiting.add(key)
    try {
      const value = evaluateFormula(cell.f, getCell)
      const entry: ComputedCell = { value }
      memo.set(key, entry)
      return value
    } catch (e) {
      const code = e instanceof FormulaError ? e.code : '#ERROR!'
      if (!memo.has(key)) memo.set(key, { value: code, error: code })
      throw e instanceof FormulaError ? e : new FormulaError(code)
    } finally {
      visiting.delete(key)
    }
  }

  const getCell: GetCellValue = (r, c) => {
    if (r < 0 || c < 0 || r >= sheet.rows || c >= sheet.cols) err('#REF!')
    const key = cellKey(r, c)
    return valueOf(sheet.cells[key], key)
  }

  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.f === undefined || memo.has(key)) continue
    try {
      valueOf(cell, key)
    } catch {
      // error already recorded in memo by valueOf
    }
  }
  return memo
}

/**
 * Write the freshly computed values into the cells' `c` cache so digests,
 * previews and exports read results without running the engine.
 */
export function withComputedCache(sheet: SheetData): SheetData {
  const computed = evaluateSheet(sheet)
  if (!computed.size) return sheet
  const cells = { ...sheet.cells }
  for (const [key, entry] of computed) {
    const cell = cells[key]
    if (!cell) continue
    const c = entry.error ?? entry.value
    if (cell.c !== c) cells[key] = { ...cell, c }
  }
  return { ...sheet, cells }
}
