# Serverless Database Tool

[![npm](https://img.shields.io/npm/v/@slsplus/database)](http://www.npmtrends.com/@slsplus/database)
[![NPM downloads](http://img.shields.io/npm/dm/@slsplus/database.svg?style=flat-square)](http://www.npmtrends.com/@slsplus/database)
[![Status](https://github.com/serverless-plus/database/workflows/Test/badge.svg)](https://github.com/serverless-plus/database/actions?query=workflow:Test)

Serverless Plus Migrate Tool

Support database dirver:

- [x] MySQL
- [ ] PostgreSQL

## Usage

```bash
$ npm i @slsplus/database --save
```

### Mysql

Before you use mysql, you should insall `mysql2` dependency:

```bash
$ npm i mysql2 --save
```

Then you can use it as below:

```js
import { Mysql } from '@slsplus/database';

async function example() {
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
    },
  );

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
}
```

## Examples

[examples](./examples)

## License

MIT License

Copyright (c) 2020 Serverless Plus
