import * as assert from 'node:assert/strict';
import { formatSql, validateSql } from './index';

function runSqlGuardTests(): void {
  // 1. Valid SELECT gets automatic default LIMIT
  const res1 = validateSql('SELECT id, email FROM customers WHERE segment = \'Enterprise B2B\'');
  assert.equal(res1.valid, true);
  assert.equal(res1.statementType, 'SELECT');
  assert.equal(res1.isReadOnly, true);
  assert.equal(res1.limitApplied, 500);
  assert.ok(res1.sanitizedSql.includes('LIMIT 500;'));
  assert.deepEqual(res1.referencedTables, ['customers']);

  // 2. Valid SELECT with existing LIMIT under max cap preserves it
  const res2 = validateSql('SELECT * FROM orders LIMIT 25;', { defaultRowLimit: 500, maxRowLimit: 2000 });
  assert.equal(res2.valid, true);
  assert.equal(res2.limitApplied, 25);
  assert.ok(res2.sanitizedSql.endsWith('LIMIT 25;'));

  // 3. SELECT with excessive LIMIT gets clamped to maxRowLimit
  const res3 = validateSql('SELECT * FROM orders LIMIT 50000;', { maxRowLimit: 2000 });
  assert.equal(res3.valid, true);
  assert.equal(res3.limitApplied, 2000);
  assert.ok(res3.sanitizedSql.includes('LIMIT 2000;'));
  assert.equal(res3.warnings.length, 1);

  // 4. Valid CTE query with JOIN
  const res4 = validateSql(`
    WITH top_customers AS (
      SELECT customer_id, SUM(total_cents) AS spent
      FROM orders
      GROUP BY customer_id
    )
    SELECT c.full_name, tc.spent
    FROM customers c
    JOIN top_customers tc ON tc.customer_id = c.id
  `);
  assert.equal(res4.valid, true);
  assert.equal(res4.statementType, 'SELECT');
  assert.ok(res4.referencedTables.includes('orders'));
  assert.ok(res4.referencedTables.includes('customers'));
  assert.ok(!res4.referencedTables.includes('top_customers'));

  // 5. Stacked query SQL injection must be rejected
  const sqliStacked = validateSql('SELECT * FROM customers; DROP TABLE customers;');
  assert.equal(sqliStacked.valid, false);
  assert.ok(sqliStacked.reason?.includes('Multiple SQL statements'));

  // 6. Comment-obfuscated stacked query injection must be rejected
  const sqliComment = validateSql('SELECT id FROM orders /* tricky ; comment */; DELETE FROM orders;');
  assert.equal(sqliComment.valid, false);
  assert.ok(sqliComment.reason?.includes('Multiple SQL statements'));

  // 7. Semicolon inside string literal must be allowed
  const literalSemi = validateSql("SELECT * FROM customers WHERE full_name = 'A; DROP TABLE users';");
  assert.equal(literalSemi.valid, true);
  assert.equal(literalSemi.statementType, 'SELECT');

  // 8. Data-modifying CTE in read-only mode must be rejected
  const modifyingCte = validateSql(
    'WITH deleted AS (DELETE FROM orders RETURNING *) SELECT * FROM deleted;',
  );
  assert.equal(modifyingCte.valid, false);
  assert.ok(modifyingCte.reason?.includes('Read-only mode is active'));

  // 9. Dangerous functions must be rejected (pg_read_file, pg_sleep, dblink, pg_terminate_backend, pg_shadow)
  for (const badSql of [
    "SELECT pg_read_file('/etc/passwd');",
    'SELECT pg_sleep(30);',
    "SELECT * FROM dblink('host=evil.com', 'SELECT 1') AS t(id int);",
    'SELECT pg_terminate_backend(1234);',
    'SELECT usename, passwd FROM pg_shadow;',
  ]) {
    const badRes = validateSql(badSql);
    assert.equal(badRes.valid, false, `Expected ${badSql} to be rejected`);
    assert.ok(badRes.reason?.includes('Blocked restricted'));
  }

  // 10. Destructive DDL & DML rejected in read-only mode
  for (const dmlSql of [
    'DROP TABLE customers;',
    'TRUNCATE TABLE orders;',
    "UPDATE orders SET status = 'cancelled';",
    'DELETE FROM order_items WHERE id = 1;',
    "INSERT INTO products (sku, name, category, price_cents) VALUES ('X', 'Y', 'Z', 100);",
  ]) {
    const dmlRes = validateSql(dmlSql, { allowWrite: false });
    assert.equal(dmlRes.valid, false, `Expected ${dmlSql} to fail in read-only mode`);
  }

  // 11. Write mode allows UPDATE/DELETE and warns when WHERE clause is missing
  const writeUpdateNoWhere = validateSql("UPDATE orders SET status = 'archived';", {
    allowWrite: true,
  });
  assert.equal(writeUpdateNoWhere.valid, true);
  assert.equal(writeUpdateNoWhere.isReadOnly, false);
  assert.equal(writeUpdateNoWhere.statementType, 'UPDATE');
  assert.equal(writeUpdateNoWhere.warnings.length, 1);

  const writeUpdateWithWhere = validateSql(
    "UPDATE orders SET status = 'completed' WHERE id = 1;",
    { allowWrite: true },
  );
  assert.equal(writeUpdateWithWhere.valid, true);
  assert.equal(writeUpdateWithWhere.warnings.length, 0);

  // 12. Write mode still blocks DROP TABLE / TRUNCATE
  const writeDrop = validateSql('DROP TABLE orders;', { allowWrite: true });
  assert.equal(writeDrop.valid, false);
  assert.ok(writeDrop.reason?.includes('Destructive DDL'));

  // 13. Formatter test
  const formatted = formatSql('select id, total_cents from orders where status = \'completed\' order by id desc limit 10');
  assert.ok(formatted.includes('SELECT'));
  assert.ok(formatted.includes('\nFROM orders'));
  assert.ok(formatted.includes('\nWHERE'));

  console.log('✓ @datapilot/sql-guard unit test suite passed (13/13 security & injection test cases)');
}

runSqlGuardTests();

