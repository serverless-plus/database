import { OkPacket, RowDataPacket } from 'mysql2/promise';
import { Mysql } from '../src';
import { typeOf } from '../src/utils';

describe('Mysql test', () => {
  let db: Mysql.Database;
  const dbname = 'test';

  afterAll(async () => {
    await db.end();
    await db.close();
  });
  test(`new mysql instance`, async () => {
    db = new Mysql.Database(
      {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'root',
        multipleStatements: true,
      },
      {
        debug: !process.env.CI,
        connsUtilization: 0,
        zombieMaxTimeout: 10,
      },
    );

    expect(db.connectionOptions).toEqual({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'root',
      multipleStatements: true,
    });
    expect(db.options).toEqual({
      debug: !process.env.CI,
      maxRetries: 50,
      sleepGap: 100,
      getMaxConnsFreq: 15 * 1000,
      getUsedConnsFreq: 0,
      connsUtilization: 0,
      zombieMinTimeout: 3,
      zombieMaxTimeout: 10,
      onConnect: expect.any(Function),
      onClear: expect.any(Function),
      onConnectError: expect.any(Function),
      onClearError: expect.any(Function),
      onError: expect.any(Function),
      onClose: expect.any(Function),
    });
  });

  test('create database', async () => {
    await db.createDb(dbname);

    const res = await db.isDbExist(dbname);
    await db.close();
    expect(res).toBe(true);
  });

  test('create table', async () => {
    await db.query({
      sql: `
    USE ${dbname};
    CREATE TABLE IF NOT EXISTS users (
      id     INT UNSIGNED AUTO_INCREMENT COMMENT 'primary key',
      name   VARCHAR(30) DEFAULT NULL,
      email  VARCHAR(50) DEFAULT NULL,
      site   VARCHAR(50) DEFAULT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    `,
    });

    const res = await db.isTableExist(dbname, 'users');
    expect(res).toBe(true);
  });

  test('insert data', async () => {
    // truncate users table
    await db.truncateTable('users');

    const res = await db.query<OkPacket>({
      sql: `
      INSERT INTO users SET ?
    `,
      values: {
        name: 'test',
        email: 'test@test.com',
        site: 'test.com',
      },
    });

    expect(typeOf(res.insertId)).toBe('Number');
  });

  test('select data', async () => {
    const res = await db.query<RowDataPacket[]>({
      sql: `
      SELECT * FROM users WHERE ?
    `,
      values: {
        name: 'test',
      },
    });

    expect(typeOf(res)).toBe('Array');
    expect(res[0]).toEqual({
      id: expect.any(Number),
      name: 'test',
      email: 'test@test.com',
      site: 'test.com',
    });
  });

  test('update data', async () => {
    const res = await db.query<OkPacket>({
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

    expect(res.affectedRows).toBe(1);
    expect(res.changedRows).toBe(1);
  });

  test('delete data', async () => {
    const res = await db.query<OkPacket>({
      sql: `
      DELETE FROM users WHERE ?
    `,
      values: {
        id: 1,
      },
    });

    expect(res.affectedRows).toBe(1);
  });

  test('transaction', async () => {
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

    const res = await transaction.commit();

    expect(res.length).toBe(3);
    expect(res[0].insertId).toBe(2);
    expect(res[1].insertId).toBe(3);
    expect(res[2].affectedRows).toBe(1);

    const selectRes = await db.query<RowDataPacket[]>({
      sql: `
      SELECT * FROM users
    `,
    });
    expect(selectRes).toEqual([
      {
        id: 2,
        name: 'test1_1',
        email: 'test1_1@test.com',
        site: 'test1_1.com',
      },
      {
        id: 3,
        name: 'test2',
        email: 'test2@test.com',
        site: 'test2.com',
      },
    ]);
  });
});
