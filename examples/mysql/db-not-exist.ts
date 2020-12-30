import { Mysql } from '../../src';

async function main() {
  const db = new Mysql.Database(
    {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      multipleStatements: true,
    },
    {
      debug: true,
      connsUtilization: 0,
    },
  );

  const dbname = 'test';

  // create database
  await db.createDb(dbname);

  // create table
  await db.query({
    sql: `CREATE TABLE IF NOT EXISTS users (
      id     INT UNSIGNED AUTO_INCREMENT COMMENT 'primary key',
      name   VARCHAR(30) DEFAULT NULL,
      email  VARCHAR(50) DEFAULT NULL,
      site   VARCHAR(50) DEFAULT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,
  });

  // insert
  await db.query({
    sql: `
    INSERT INTO users SET ?
  `,
    values: {
      name: 'test',
      email: 'test@test.com',
      site: 'test.com',
    },
  });
  /**
   * return {"fieldCount":0,"affectedRows":1,"insertId":1,"info":"","serverStatus":3,"warningStatus":0}
   */

  // select
  await db.query({
    sql: `
    SELECT * FROM users WHERE ?
  `,
    values: {
      name: 'test',
    },
  });
  /**
   * return [{"id":1,"name":"test","email":"test@test.com","site":"test.com"}]
   *
   */

  // update
  await db.query({
    sql: `
    UPDATE users SET ? WHERE ?
  `,
    values: [
      {
        name: 'test1',
        email: 'test1@test1.com',
        site: 'test1.com',
      },
      {
        id: 1,
      },
    ],
  });
  /**
   * return {"fieldCount":0,"affectedRows":1,"insertId":0,"info":"Rows matched: 1  Changed: 1  Warnings: 0","serverStatus":35,"warningStatus":0,"changedRows":1}
   *
   */

  // delete
  await db.query({
    sql: `
    DELETE FROM users WHERE ?
  `,
    values: {
      id: 1,
    },
  });
  /**
   * return {"fieldCount":0,"affectedRows":1,"insertId":0,"info":"","serverStatus":2,"warningStatus":0}
   */

  // transaction
  const transaction = db.createTransaction();
  transaction.addQuery({
    sql: `
      INSERT INTO users SET ?
    `,
    values: {
      name: 'test1',
      email: 'test1@test.com',
      site: 'test1.com',
    },
  });
  transaction.addQuery({
    sql: `
      INSERT INTO users SET ?
    `,
    values: {
      name: 'test2',
      email: 'test2@test.com',
      site: 'test2.com',
    },
  });
  transaction.addQuery({
    sql: `
      UPDATE users SET ? WHERE ?
    `,
    values: [
      {
        name: 'test1_1',
        email: 'test1_1@test.com',
        site: 'test1_1.com',
      },
      {
        name: 'test1',
      },
    ],
  });

  expect(transaction.queries.length).toBe(3);

  await transaction.commit();
  /**
   * return [{"fieldCount":0,"affectedRows":1,"insertId":2,"info":"","serverStatus":3,"warningStatus":0},{"fieldCount":0,"affectedRows":1,"insertId":3,"info":"","serverStatus":3,"warningStatus":0},{"fieldCount":0,"affectedRows":1,"insertId":0,"info":"Rows matched: 1  Changed: 1  Warnings: 0","serverStatus":35,"warningStatus":0,"changedRows":1}]
   */
}

main();
