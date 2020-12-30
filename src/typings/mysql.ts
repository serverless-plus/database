import {
  Connection,
  ConnectionOptions,
  RowDataPacket,
  OkPacket,
  ResultSetHeader,
} from 'mysql2/promise';

export interface Options {
  // debug mode
  debug?: boolean;
  // max retries
  maxRetries?: number;
  // sleep gap for retry
  sleepGap?: number;
  // get max connections frequency
  getMaxConnsFreq?: number;
  // get used connections frequecy
  getUsedConnsFreq?: number;
  // connection utilization
  connsUtilization?: number;
  // zombie connection timeout
  zombieMinTimeout?: number;
  // zombie connection timeout
  zombieMaxTimeout?: number;
  // connect event handler
  onConnect?: (...args: any) => any;
  // connect error handler
  onConnectError?: (...args: any) => any;
  // clear event handler
  onClear?: (...args: any) => any;
  // clear error handler
  onClearError?: (...args: any) => any;
  // error handler
  onError?: (...args: any) => any;
  // close handler
  onClose?: (...args: any) => any;
}

export type QueryResult =
  | RowDataPacket[][]
  | RowDataPacket[]
  | OkPacket
  | OkPacket[]
  | ResultSetHeader;

export interface FullOptions {
  debug: boolean;
  maxRetries: number;
  sleepGap: number;
  getMaxConnsFreq: number;
  getUsedConnsFreq: number;
  connsUtilization: number;
  zombieMinTimeout: number;
  zombieMaxTimeout: number;
  onConnect: (...args: any) => any;
  onConnectError: (...args: any) => any;
  onClear: (...args: any) => any;
  onClearError: (...args: any) => any;
  onError: (...args: any) => any;
  onClose: (...args: any) => any;
}

export interface MaxConnections {
  updated: number;
  total: number;
  userLimit: boolean;
}

export interface UsedConnections {
  updated: number;
  total: number;
  maxAge: number;
}

export interface DbClient extends Connection {
  connection: {
    stream: {
      connecting: boolean;
    };
  };
}

export type QueryValues = any | any[] | { [param: string]: any };

export interface Query {
  sql: string;
  values: QueryValues;
}

export interface DatabaseInterface {
  // database connection
  client: DbClient | null;

  // connection options
  connectionOptions: ConnectionOptions;

  // database options
  options: FullOptions;

  // retry to times
  retries: number;

  // error counts
  errors: number;

  // max connections
  maxConnections: MaxConnections;

  // used connections
  usedConnections: UsedConnections;

  // try to connect to database
  connect: () => void;

  /**
   * query databse
   * @param sql query statament
   * @param values query parameters
   */
  query: (qArgs: {
    sql: string;
    values?: QueryValues;
    rollback?: (...args: any) => any;
  }) => Promise<any>;

  commit: (queries: Query[], rollback: (...args: any) => any) => Promise<any>;
}

export interface TransactionInterface {
  db: DatabaseInterface;
  queries: Query[];
  rollback: (...args: any) => any;

  addQuery: ({ sql, values }: { sql: string; values?: QueryValues }) => void;
  setRollback: (fn: (...args: any) => any) => void;
  commit: () => Promise<any[] | QueryResult[]>;
}
