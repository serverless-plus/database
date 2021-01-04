import { Connection, createConnection, ConnectionOptions } from 'mysql2/promise';
import { sleep, typeOf } from '../utils';

import {
  Options,
  FullOptions,
  MaxConnections,
  UsedConnections,
  DbClient,
  Query,
  QueryValues,
  DatabaseInterface,
  TransactionInterface,
  QueryResult,
  Rollback,
} from '../typings';

const ConnectionErrors = [
  'ER_TOO_MANY_USER_CONNECTIONS',
  'ER_CON_COUNT_ERROR',
  'ER_USER_LIMIT_REACHED',
  'ER_OUT_OF_RESOURCES',
  'ER_CON_COUNT_ERROR',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ETIMEDOUT',
];

const DefaultOptions = {
  debug: false,
  maxRetries: 50, // default to 50
  sleepGap: 100, // default to 100ms
  getMaxConnsFreq: 15 * 1000, // default to 15 seconds
  getUsedConnsFreq: 0, // default to 0ms
  connsUtilization: 0.8, // default to 0.8
  zombieMinTimeout: 3, // default 3 seconds
  zombieMaxTimeout: 15 * 60, // default 15 minutes
  onConnect: (client: Connection) => {
    return client;
  },
  onClear: (zombie: { ID: number; time: string | number }) => {
    return zombie;
  },
  onConnectError: (e: Error) => {
    throw e;
  },
  onClearError: (e: Error) => {
    throw e;
  },
  onError: (e: Error) => {
    throw e;
  },
  onClose: () => {
    // no op\
  },
};

class Transaction implements TransactionInterface {
  db: DatabaseInterface;
  queries: Query[] = [];
  rollback: Rollback;

  constructor(db: DatabaseInterface) {
    this.db = db;
    this.queries = [];
    this.rollback = () => {
      // no op
    };
  }
  addQuery({ sql, values }: { sql: string; values?: QueryValues }) {
    this.queries.push({
      sql,
      values,
    });
  }
  setRollback(fn?: Rollback) {
    if (fn && typeOf(fn) === 'Function') {
      this.rollback = fn;
    }
  }
  async commit(): Promise<any[]> {
    return await this.db.commit(this.queries, this.rollback);
  }
}

class Database implements DatabaseInterface {
  // database connection
  client: DbClient | null = null;

  // connection options
  connectionOptions: ConnectionOptions;

  // database options
  options: FullOptions;

  // retry to times
  retries = 0;

  // error counts
  errors = 0;

  // max connections
  maxConnections: MaxConnections = {
    updated: 0,
    total: 0,
    userLimit: false,
  };

  // used connections
  usedConnections: UsedConnections = {
    updated: 0,
    total: 0,
    maxAge: 0,
  };

  /**
   * constructor
   * @param connOptions mysql connection options
   * @param options database tool options
   */
  constructor(connOptions: ConnectionOptions, options?: Options) {
    this.options = {
      ...DefaultOptions,
      ...(options || {}),
    };

    this.connectionOptions = connOptions;
  }

  /**
   * reset retry counts
   */
  resetRetries() {
    this.retries = 0;
  }

  // reset client
  resetClient() {
    this.client = null;
  }

  // try to connect to database
  async connect() {
    try {
      await this._connect();
    } catch (e) {
      if (ConnectionErrors.indexOf(e.code) && this.retries < this.options.maxRetries) {
        this.retries++;

        await sleep(this.options.sleepGap);

        await this.connect();
      } else {
        this.options.onConnectError(e);
      }
    }
  }

  /**
   * query databse
   * @param sql query statament
   * @param values query parameters
   */
  async query<T extends QueryResult>({
    sql,
    values,
    rollback,
  }: {
    sql: string;
    values?: QueryValues;
    rollback?: (e?: any) => void;
  }): Promise<T> {
    await this.connect();

    if (this.client) {
      try {
        const res = await this._dbQuery({ sql, values });
        return res as T;
      } catch (e) {
        if (this.options.debug) {
          console.log('[QUERY ERROR] ', e);
        }
        if (e.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
          await this.client.destroy();
          this.resetClient();
          throw e;
        } else if (
          /^PROTOCOL_ENQUEUE_AFTER_/.test(e.code) ||
          e.code === 'PROTOCOL_CONNECTION_LOST' ||
          e.code === 'EPIPE'
        ) {
          this.resetClient();
          return this.query({ sql, values });
        } else {
          // rollback for transaction
          if (rollback) {
            await this.query({ sql: 'ROLLBACK' });
            rollback(e);
          }

          throw e;
        }
      }
    }
    return {} as T;
  }

  /**
   * create trarnsaction
   */
  createTransaction(): TransactionInterface {
    return new Transaction(this);
  }

  /**
   * commit transaction queries
   * @param queries sql queries
   * @param rollback rollback function
   */
  async commit(queries: Query[], rollback: (e?: any) => void) {
    const results = [];
    if (this.client) {
      await this.query({ sql: `START TRANSACTION` });

      for (let i = 0; i < queries.length; i++) {
        const { sql, values } = queries[i];
        const res = await this.query({ sql, values, rollback });
        results.push(res);
      }

      await this.query({ sql: 'COMMIT' });
    }
    return results;
  }

  /**
   * close connection
   */
  async close() {
    if (this.client) {
      await this.client.end();
      this.resetClient();

      this.options.onClose();
    }
  }

  /**
   * end client, clear all zombies
   */
  async end() {
    if (this.client !== null) {
      await this._getMaxConnections();
      await this._getTotalConnections();

      const currentUtilization = this.usedConnections.total / this.maxConnections.total;

      // if over utilization threshold, clean zombies
      if (currentUtilization > this.options.connsUtilization) {
        const timeout = Math.min(
          Math.max(this.usedConnections.maxAge, this.options.zombieMinTimeout),
          this.options.zombieMaxTimeout,
        );

        // clear zombies, if they are whin the timeout
        const clearedZombies = await this._clearZombieConnections(timeout);

        // if no zombies were cleared, close this connection
        if (clearedZombies === 0) {
          await this.close();
        }
      } else if (this.usedConnections.maxAge > this.options.zombieMaxTimeout) {
        // if zombies exist that are more then max zombie timeout, clear them
        await this._clearZombieConnections(this.options.zombieMaxTimeout);
      }
    }
  }

  /**
   * create database
   * @param dbname database name
   */
  async createDb(dbname: string) {
    const res = await this.query({ sql: `CREATE DATABASE IF NOT EXISTS ${dbname};` });
    await this.query({ sql: `USE ${dbname};` });
    return res;
  }

  /**
   * truncate table
   * @param dbname table name
   */
  async truncateTable(tableName: string) {
    return this.query({ sql: `TRUNCATE ${tableName};` });
  }

  /**
   * get database list
   */
  async getDbs(): Promise<{ [propName: string]: string }[]> {
    const databases = await this.query({ sql: `SHOW DATABASES;` });
    return (databases || []) as { [propName: string]: string }[];
  }

  /**
   *
   * @param dbname database name
   */
  async isDbExist(dbname: string): Promise<boolean> {
    const dbs = await this.getDbs();
    const [exist] = dbs.filter((item: { [propName: string]: string }) => item.Database === dbname);
    return !!exist;
  }

  /**
   * get tables
   */
  async getTables(): Promise<{ [propName: string]: string }[]> {
    const tables = await this.query({ sql: `SHOW TABLES;` });
    return (tables || []) as { [propName: string]: string }[];
  }

  /**
   * whether table exist
   * @param dbname database name
   * @param tableName table name
   */
  async isTableExist(dbname: string, tableName: string): Promise<boolean> {
    const tables = await this.getTables();

    const [exist] = tables.filter((item: { [propName: string]: string }) => {
      return item[`Tables_in_${dbname}`] === tableName;
    });
    return !!exist;
  }

  // create databse connection
  async _connect() {
    if (!this.client) {
      try {
        this.client = (await createConnection(this.connectionOptions)) as DbClient;

        this.resetRetries();
        this.options.onConnect(this.client);

        this.client.on('error', async (err) => {
          this.errors++;
          this.resetClient();
          this.options.onError(err);
        });
        return true;
      } catch (e) {
        this.resetClient();
        throw e;
      }
    } else {
      try {
        const { connecting } = this.client.connection.stream;

        if (!connecting) {
          await this.client.connect();
        }
      } catch (e) {
        console.log('[CONNECT ERROR] ', e);
      }
    }
  }

  /**
   * get max connections
   */
  async _getMaxConnections() {
    if (this.client) {
      if (Date.now() - this.maxConnections.updated > this.options.getMaxConnsFreq) {
        const results: any = await this._dbQuery({
          sql: `SELECT IF (@@max_user_connections > 0,
            LEAST(@@max_user_connections,@@max_connections),
            @@max_connections) AS total,
            IF(@@max_user_connections > 0,true,false) AS userLimit`,
        });

        if (results) {
          this.maxConnections = {
            total: results[0].total || 0,
            userLimit: results[0].userLimit === 1 ? true : false,
            updated: Date.now(),
          };
        }
      }
    }
  }

  /**
   * get totol connections
   */
  async _getTotalConnections() {
    if (this.client) {
      if (Date.now() - this.usedConnections.updated > this.options.getUsedConnsFreq) {
        const results: any = await this._dbQuery({
          sql: `SELECT COUNT(ID) as total, MAX(time) as max_age
            FROM information_schema.processlist
            WHERE (user = ? AND @@max_user_connections > 0) OR true`,
          values: [this.connectionOptions.user],
        });

        if (results) {
          this.usedConnections = {
            total: results[0].total || 0,
            updated: Date.now(),
            maxAge: results[0].max_age || 0,
          };
        }
      }
    }
  }

  /**
   * clear zombie connections
   * @param timeout timeout for sleepy connections
   */
  async _clearZombieConnections(timeout: number) {
    let clearedZombies = 0;
    if (timeout > this.usedConnections.maxAge || this.client === null) {
      return clearedZombies;
    }
    const zombieConnections: any = await this._dbQuery({
      sql: `SELECT ID,time FROM information_schema.processlist
        WHERE command = 'Sleep' AND time >= ? and user = ?
        ORDER BY time DESC`,
      values: [!isNaN(timeout) ? timeout : 900, this.connectionOptions.user],
    });

    if (zombieConnections) {
      for (let i = 0; i < zombieConnections.length; i++) {
        try {
          const zombie = zombieConnections[i];
          this._dbQuery({ sql: `KILL ?`, values: zombie.ID });
          this.options.onClear(zombie);
          clearedZombies++;
        } catch (e) {
          this.options.onClearError(e);
        }
      }
    }
    return clearedZombies;
  }

  async _dbQuery({ sql, values }: { sql: string; values?: QueryValues }) {
    if (this.client) {
      const cmdSql = this.client.format(sql, values);
      const [res] = await this.client.query(cmdSql);

      if (this.options.debug) {
        console.log(`[Query]: ${cmdSql}`);
        console.log(`[RESULT] ${JSON.stringify(res)}`);
      }
      return res;
    }
    return this.query({ sql, values });
  }
}

export { Options, Connection, Database };
