const format = (level, args) => {
  const parts = args.map((a) =>
    a instanceof Error ? (a.stack || a.message) : typeof a === "string" ? a : JSON.stringify(a)
  );
  return `${new Date().toISOString()} [${level}] ${parts.join(" ")}`;
};

module.exports = {
  info: (...args) => console.log(format("INFO", args)),
  warn: (...args) => console.warn(format("WARN", args)),
  error: (...args) => console.error(format("ERROR", args)),
};
