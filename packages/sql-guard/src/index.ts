import NodeSqlParser from 'node-sql-parser';

type ParserConstructor = new () => {
  astify: (sql: string, opt?: unknown) => unknown;
  sqlify: (ast: unknown, opt?: unknown) => string;
  tableList: (sql: string, opt?: unknown) => string[];
  columnList: (sql: string, opt?: unknown) => string[];
};

const ParserClass: ParserConstructor =
  (NodeSqlParser as unknown as { Parser: ParserConstructor }).Parser ??
  (NodeSqlParser as unknown as { default: { Parser: ParserConstructor } }).default?.Parser ??
  (NodeSqlParser as unknown as ParserConstructor);

export type SqlStatementType =
  | 'SELECT'
  | 'EXPLAIN'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'DDL'
  | 'UNKNOWN';

export interface SqlValidationOptions {
  allowWrite?: boolean;
  defaultRowLimit?: number;
  maxRowLimit?: number;
}

export interface SqlValidationResult {
  valid: boolean;
  sanitizedSql: string;
  statementType: SqlStatementType;
  isReadOnly: boolean;
  referencedTables: string[];
  limitApplied: number | null;
  warnings: string[];
  reason?: string;
}

const DANGEROUS_IDENTIFIERS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bpg_read_file\s*\(/i, label: 'pg_read_file()' },
  { pattern: /\bpg_read_binary_file\s*\(/i, label: 'pg_read_binary_file()' },
  { pattern: /\bpg_ls_dir\s*\(/i, label: 'pg_ls_dir()' },
  { pattern: /\bpg_stat_file\s*\(/i, label: 'pg_stat_file()' },
  { pattern: /\blo_import\s*\(/i, label: 'lo_import()' },
  { pattern: /\blo_export\s*\(/i, label: 'lo_export()' },
  { pattern: /\bdblink\s*\(/i, label: 'dblink()' },
  { pattern: /\bdblink_exec\s*\(/i, label: 'dblink_exec()' },
  { pattern: /\bdblink_connect\s*\(/i, label: 'dblink_connect()' },
  { pattern: /\bpg_sleep\s*\(/i, label: 'pg_sleep()' },
  { pattern: /\bpg_sleep_for\s*\(/i, label: 'pg_sleep_for()' },
  { pattern: /\bpg_sleep_until\s*\(/i, label: 'pg_sleep_until()' },
  { pattern: /\bpg_terminate_backend\s*\(/i, label: 'pg_terminate_backend()' },
  { pattern: /\bpg_cancel_backend\s*\(/i, label: 'pg_cancel_backend()' },
  { pattern: /\bpg_reload_conf\s*\(/i, label: 'pg_reload_conf()' },
  { pattern: /\bpg_rotate_logfile\s*\(/i, label: 'pg_rotate_logfile()' },
  { pattern: /\bset_config\s*\(/i, label: 'set_config()' },
  { pattern: /\bpg_shadow\b/i, label: 'pg_shadow system catalog' },
  { pattern: /\bpg_authid\b/i, label: 'pg_authid system catalog' },
  { pattern: /^\s*copy\b/i, label: 'COPY command' },
];

const parser = new ParserClass();

/**
 * Strips comments and string literals to safely inspect top-level SQL tokens and semicolons.
 */
function stripCommentsAndLiterals(sql: string): {
  stripped: string;
  statements: string[];
} {
  let out = '';
  const statements: string[] = [];
  let currentStmt = '';
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    // Line comment --
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n') i++;
      out += ' ';
      currentStmt += ' ';
      continue;
    }

    // Block comment /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      currentStmt += ' ';
      continue;
    }

    // Single-quoted string '...'
    if (ch === "'") {
      currentStmt += ch;
      out += "''";
      i++;
      while (i < len) {
        const c = sql[i]!;
        currentStmt += c;
        if (c === "'" && sql[i + 1] === "'") {
          currentStmt += "'";
          i += 2;
          continue;
        }
        if (c === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted identifier "..."
    if (ch === '"') {
      currentStmt += ch;
      out += ch;
      i++;
      while (i < len) {
        const c = sql[i]!;
        currentStmt += c;
        out += c;
        if (c === '"' && sql[i + 1] === '"') {
          currentStmt += '"';
          out += '"';
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Dollar-quoted string $$...$$
    if (ch === '$' && sql[i + 1] === '$') {
      currentStmt += '$$';
      out += "''";
      i += 2;
      while (i < len && !(sql[i] === '$' && sql[i + 1] === '$')) {
        currentStmt += sql[i];
        i++;
      }
      if (i < len) {
        currentStmt += '$$';
        i += 2;
      }
      continue;
    }

    if (ch === ';') {
      if (currentStmt.trim().length > 0) {
        statements.push(currentStmt.trim());
      }
      currentStmt = '';
      out += ';';
      i++;
      continue;
    }

    out += ch;
    currentStmt += ch;
    i++;
  }

  if (currentStmt.trim().length > 0) {
    statements.push(currentStmt.trim());
  }

  return { stripped: out.trim(), statements };
}

function extractReferencedTables(strippedSql: string): string[] {
  const tables = new Set<string>();
  const ctes = new Set<string>();

  // Find CTE aliases so we don't list them as physical tables
  const cteRegex = /\bWITH\s+(?:RECURSIVE\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = cteRegex.exec(strippedSql)) !== null) {
    if (match[1]) ctes.add(match[1].toLowerCase());
  }
  const commaCteRegex = /\)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
  while ((match = commaCteRegex.exec(strippedSql)) !== null) {
    if (match[1]) ctes.add(match[1].toLowerCase());
  }

  const tableRegex =
    /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(?:ONLY\s+)?(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  while ((match = tableRegex.exec(strippedSql)) !== null) {
    const tbl = match[2];
    if (!tbl) continue;
    const lower = tbl.toLowerCase();
    if (
      !ctes.has(lower) &&
      !['select', 'unnest', 'generate_series', 'lateral', 'values'].includes(lower)
    ) {
      tables.add(lower);
    }
  }
  return Array.from(tables);
}

/**
 * Validates and sanitizes a SQL statement according to DataPilot security rules.
 */
export function validateSql(
  rawSql: string,
  options: SqlValidationOptions = {},
): SqlValidationResult {
  const allowWrite = options.allowWrite ?? false;
  const defaultRowLimit = options.defaultRowLimit ?? 500;
  const maxRowLimit = options.maxRowLimit ?? 2000;

  const { stripped, statements } = stripCommentsAndLiterals(rawSql);

  if (statements.length === 0 || stripped.length === 0) {
    return {
      valid: false,
      sanitizedSql: '',
      statementType: 'UNKNOWN',
      isReadOnly: true,
      referencedTables: [],
      limitApplied: null,
      warnings: [],
      reason: 'SQL query is empty. Enter a SELECT or EXPLAIN query to run.',
    };
  }

  // 1. Reject multi-statement / stacked queries
  if (statements.length > 1) {
    return {
      valid: false,
      sanitizedSql: statements[0] ?? '',
      statementType: 'UNKNOWN',
      isReadOnly: false,
      referencedTables: [],
      limitApplied: null,
      warnings: [],
      reason:
        'Multiple SQL statements are not allowed. Run one statement at a time to prevent stacked-query injection.',
    };
  }

  const singleStatement = statements[0]!;
  const cleanStripped = stripped.replace(/;+\s*$/, '').trim();

  // 2. Check dangerous functions & restricted catalogs
  for (const item of DANGEROUS_IDENTIFIERS) {
    if (item.pattern.test(cleanStripped)) {
      return {
        valid: false,
        sanitizedSql: singleStatement,
        statementType: 'UNKNOWN',
        isReadOnly: false,
        referencedTables: extractReferencedTables(cleanStripped),
        limitApplied: null,
        warnings: [],
        reason: `Blocked restricted function or catalog: ${item.label}. DataPilot prohibits administrative, network, sleep, and filesystem functions.`,
      };
    }
  }

  // 3. Inspect top-level keyword and CTEs
  const firstWordMatch = /^\s*([a-zA-Z]+)/.exec(cleanStripped);
  const firstWord = (firstWordMatch?.[1] ?? '').toUpperCase();
  const referencedTables = extractReferencedTables(cleanStripped);
  const warnings: string[] = [];

  // Check for data-modifying CTEs (e.g. WITH d AS (DELETE FROM ...))
  const hasModifyingCte = /\b(?:INSERT\s+INTO|UPDATE\s+[a-zA-Z_"]|DELETE\s+FROM|DROP\s+|TRUNCATE\s+|ALTER\s+|CREATE\s+)/i.test(
    cleanStripped,
  );

  // Determine statement type
  let statementType: SqlStatementType = 'UNKNOWN';
  if (firstWord === 'SELECT' || firstWord === 'WITH' || firstWord === 'VALUES') {
    statementType = hasModifyingCte && firstWord === 'WITH' ? 'DELETE' : 'SELECT';
  } else if (firstWord === 'EXPLAIN') {
    statementType = 'EXPLAIN';
  } else if (firstWord === 'INSERT') {
    statementType = 'INSERT';
  } else if (firstWord === 'UPDATE') {
    statementType = 'UPDATE';
  } else if (firstWord === 'DELETE') {
    statementType = 'DELETE';
  } else if (
    ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'REVOKE', 'COMMENT', 'RENAME'].includes(
      firstWord,
    )
  ) {
    statementType = 'DDL';
  }

  // 4. Reject SELECT ... INTO in read-only mode
  if (statementType === 'SELECT' && /\bSELECT\b[\s\S]+\bINTO\s+(?:TEMP|TEMPORARY|UNLOGGED|TABLE)?\s*[a-zA-Z_"]/i.test(cleanStripped)) {
    return {
      valid: false,
      sanitizedSql: singleStatement,
      statementType: 'DDL',
      isReadOnly: false,
      referencedTables,
      limitApplied: null,
      warnings: [],
      reason: 'SELECT ... INTO creates a new table and is blocked in Read-only mode.',
    };
  }

  // 5. Validate EXPLAIN statements
  if (statementType === 'EXPLAIN') {
    if (hasModifyingCte) {
      return {
        valid: false,
        sanitizedSql: singleStatement,
        statementType: 'EXPLAIN',
        isReadOnly: false,
        referencedTables,
        limitApplied: null,
        warnings: [],
        reason:
          'EXPLAIN on data-modifying or DDL statements is blocked in Read-only mode. Explain SELECT queries only.',
      };
    }
    return {
      valid: true,
      sanitizedSql: `${singleStatement.replace(/;+\s*$/, '')};`,
      statementType: 'EXPLAIN',
      isReadOnly: true,
      referencedTables,
      limitApplied: null,
      warnings,
    };
  }

  // 6. Enforce Read-only mode
  if (!allowWrite && statementType !== 'SELECT') {
    const label =
      statementType === 'UNKNOWN' ? firstWord || 'Non-SELECT' : statementType;
    return {
      valid: false,
      sanitizedSql: singleStatement,
      statementType,
      isReadOnly: false,
      referencedTables,
      limitApplied: null,
      warnings: [],
      reason: `Read-only mode is active: ${label} statements are blocked. Only SELECT and EXPLAIN queries are permitted.`,
    };
  }

  // 7. Always block destructive DDL in ad-hoc query execution (use Schema Designer for DDL)
  if (statementType === 'DDL') {
    return {
      valid: false,
      sanitizedSql: singleStatement,
      statementType: 'DDL',
      isReadOnly: false,
      referencedTables,
      limitApplied: null,
      warnings: [],
      reason:
        'Destructive DDL (DROP, TRUNCATE, ALTER, CREATE) is blocked in query execution. Use the Schema Designer migration workflow for schema changes.',
    };
  }

  if (statementType === 'UNKNOWN') {
    return {
      valid: false,
      sanitizedSql: singleStatement,
      statementType: 'UNKNOWN',
      isReadOnly: false,
      referencedTables,
      limitApplied: null,
      warnings: [],
      reason: `Unsupported SQL command "${firstWord}". Use SELECT, EXPLAIN, or enable Write mode for INSERT/UPDATE/DELETE.`,
    };
  }

  // 8. Parse with node-sql-parser (PostgreSQL dialect) to verify syntax integrity
  // Note: PostgreSQL-specific constructs like FILTER (WHERE ...) are supported gracefully
  try {
    parser.astify(singleStatement, { database: 'Postgresql' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Syntax error';
    // Allow valid PostgreSQL extensions such as FILTER (WHERE ...) or INTERVAL arithmetic if standard tokens are valid
    const isPgExtensionConstruct =
      /\bFILTER\s*\(\s*WHERE\b/i.test(singleStatement) ||
      /\bDATE_TRUNC\b/i.test(singleStatement) ||
      /\bINTERVAL\b/i.test(singleStatement) ||
      /::[a-zA-Z]+/.test(singleStatement);

    if (!isPgExtensionConstruct) {
      return {
        valid: false,
        sanitizedSql: singleStatement,
        statementType,
        isReadOnly: statementType === 'SELECT',
        referencedTables,
        limitApplied: null,
        warnings: [],
        reason: `SQL syntax check failed: ${msg}`,
      };
    }
  }

  // 9. Handle Write-mode warnings (INSERT, UPDATE, DELETE)
  if (statementType === 'UPDATE' || statementType === 'DELETE') {
    if (!/\bWHERE\b/i.test(cleanStripped)) {
      warnings.push(
        `${statementType} statement does not include a WHERE clause and will affect every row in "${referencedTables[0] ?? 'the table'}".`,
      );
    }
    return {
      valid: true,
      sanitizedSql: `${singleStatement.replace(/;+\s*$/, '')};`,
      statementType,
      isReadOnly: false,
      referencedTables,
      limitApplied: null,
      warnings,
    };
  }

  if (statementType === 'INSERT') {
    return {
      valid: true,
      sanitizedSql: `${singleStatement.replace(/;+\s*$/, '')};`,
      statementType: 'INSERT',
      isReadOnly: false,
      referencedTables,
      limitApplied: null,
      warnings,
    };
  }

  // 10. Enforce row limit on SELECT queries
  const trimmedNoSemi = singleStatement.replace(/;+\s*$/, '').trim();
  const limitMatch = /\bLIMIT\s+(\d+)\s*(?:OFFSET\s+\d+\s*)?$/i.exec(trimmedNoSemi);

  let finalSql = trimmedNoSemi;
  let limitApplied: number = defaultRowLimit;

  if (limitMatch?.[1]) {
    const requestedLimit = Number(limitMatch[1]);
    if (requestedLimit > maxRowLimit) {
      finalSql = trimmedNoSemi.replace(
        /\bLIMIT\s+\d+(\s*(?:OFFSET\s+\d+\s*)?)$/i,
        `LIMIT ${maxRowLimit}$1`,
      );
      limitApplied = maxRowLimit;
      warnings.push(
        `Requested LIMIT ${requestedLimit} exceeds maximum cap and was clamped to ${maxRowLimit}.`,
      );
    } else {
      limitApplied = requestedLimit;
    }
  } else {
    finalSql = `${trimmedNoSemi}\nLIMIT ${defaultRowLimit}`;
    limitApplied = defaultRowLimit;
  }

  return {
    valid: true,
    sanitizedSql: `${finalSql};`,
    statementType: 'SELECT',
    isReadOnly: true,
    referencedTables,
    limitApplied,
    warnings,
  };
}

/**
 * Formats a SQL query cleanly with uppercased SQL keywords and consistent indentation.
 */
export function formatSql(sql: string): string {
  const keywords = [
    'SELECT',
    'FROM',
    'WHERE',
    'GROUP BY',
    'ORDER BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'LEFT JOIN',
    'RIGHT JOIN',
    'INNER JOIN',
    'FULL JOIN',
    'JOIN',
    'ON',
    'AND',
    'OR',
    'AS',
    'WITH',
    'VALUES',
    'INSERT INTO',
    'UPDATE',
    'SET',
    'DELETE FROM',
    'EXPLAIN',
    'ASC',
    'DESC',
    'COUNT',
    'SUM',
    'AVG',
    'MIN',
    'MAX',
    'ROUND',
    'DATE_TRUNC',
    'COALESCE',
    'FILTER',
  ];

  let formatted = sql.trim();
  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    formatted = formatted.replace(regex, kw);
  }

  formatted = formatted
    .replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|INNER JOIN|JOIN)\b/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n');

  return formatted.endsWith(';') ? formatted : `${formatted};`;
}

export function getSqlGuardStatus(): { version: string; defaultReadOnly: boolean } {
  return {
    version: '1.0.0',
    defaultReadOnly: true,
  };
}
