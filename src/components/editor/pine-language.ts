import { StreamLanguage, type StringStream } from "@codemirror/language";

const KEYWORDS = new Set([
  "if", "else", "for", "while", "switch", "case", "break", "continue",
  "return", "var", "varip", "import", "export", "method", "type", "enum",
  "true", "false", "na", "and", "or", "not",
]);

const BUILT_IN_FUNCTIONS = new Set([
  "indicator", "strategy", "library", "plot", "plotshape", "plotchar",
  "plotcandle", "plotarrow", "plotbar", "bgcolor", "barcolor", "fill",
  "hline", "alert", "alertcondition", "log", "runtime",
  "input", "input.bool", "input.int", "input.float", "input.string",
  "input.text_area", "input.symbol", "input.timeframe", "input.session",
  "input.source", "input.color", "input.time", "input.price",
  "math.abs", "math.ceil", "math.floor", "math.round", "math.sqrt",
  "math.pow", "math.log", "math.log10", "math.exp", "math.max", "math.min",
  "math.avg", "math.sum", "math.sign", "math.random",
  "ta.sma", "ta.ema", "ta.wma", "ta.vwma", "ta.rma", "ta.swma",
  "ta.rsi", "ta.macd", "ta.bb", "ta.bbw", "ta.cci", "ta.stoch",
  "ta.atr", "ta.tr", "ta.mfi", "ta.obv", "ta.supertrend",
  "ta.crossover", "ta.crossunder", "ta.cross", "ta.change",
  "ta.highest", "ta.lowest", "ta.highestbars", "ta.lowestbars",
  "ta.pivothigh", "ta.pivotlow", "ta.valuewhen", "ta.barssince",
  "ta.cum", "ta.falling", "ta.rising",
  "str.tostring", "str.format", "str.contains", "str.length",
  "str.replace_all", "str.split", "str.lower", "str.upper",
  "array.new_float", "array.new_int", "array.new_bool", "array.new_string",
  "array.new_color", "array.push", "array.pop", "array.get", "array.set",
  "array.size", "array.remove", "array.sort", "array.avg", "array.sum",
  "color.new", "color.rgb",
  "request.security", "request.financial", "request.quandl",
  "request.earnings", "request.dividends", "request.splits",
  "strategy.entry", "strategy.close", "strategy.exit",
  "strategy.order", "strategy.cancel", "strategy.cancel_all",
  "label.new", "line.new", "box.new", "table.new",
  "syminfo.ticker", "syminfo.tickerid", "syminfo.currency",
  "timeframe.period", "timeframe.multiplier",
]);

const TYPES = new Set([
  "int", "float", "bool", "string", "color", "label", "line", "box",
  "table", "array", "matrix", "map", "series", "simple", "const",
]);

const NAMESPACES = new Set([
  "math", "ta", "str", "array", "matrix", "map", "color", "chart",
  "request", "strategy", "syminfo", "timeframe", "bar_index",
  "close", "open", "high", "low", "volume", "time", "hl2", "hlc3",
  "ohlc4", "hlcc4", "timenow", "last_bar_index", "barstate",
]);

function tokenize(stream: StringStream): string | null {
  // Comments
  if (stream.match("//")) {
    stream.skipToEnd();
    return "lineComment";
  }

  // Strings
  if (stream.match('"')) {
    while (!stream.eol()) {
      if (stream.next() === '"') break;
    }
    return "string";
  }
  if (stream.match("'")) {
    while (!stream.eol()) {
      if (stream.next() === "'") break;
    }
    return "string";
  }

  // Annotations (e.g. @version, @description)
  if (stream.match(/@\w+/)) {
    return "meta";
  }

  // Numbers
  if (stream.match(/^-?\d+\.?\d*([eE][+-]?\d+)?/)) {
    return "number";
  }

  // Operators
  if (stream.match(/^[+\-*/%=<>!&|?:^~]+/)) {
    return "operator";
  }

  // Words
  if (stream.match(/^[a-zA-Z_]\w*(\.\w+)*/)) {
    const word = stream.current();
    if (KEYWORDS.has(word)) return "keyword";
    if (TYPES.has(word)) return "typeName";
    if (BUILT_IN_FUNCTIONS.has(word)) return "function(definition)";
    if (NAMESPACES.has(word)) return "namespace";

    // Check if it starts with a known namespace
    const dotIndex = word.indexOf(".");
    if (dotIndex > 0) {
      const ns = word.substring(0, dotIndex);
      if (NAMESPACES.has(ns)) return "function(definition)";
    }

    return "variableName";
  }

  // Parens, brackets
  if (stream.match(/^[()[\]{}.,]/)) {
    return "punctuation";
  }

  stream.next();
  return null;
}

export const pineScriptLanguage = StreamLanguage.define({
  token: tokenize,
});
