import type { Knex } from 'knex';
import { createKnexConfig } from './src/database/connection';

const config: { [key: string]: Knex.Config } = {
  development: createKnexConfig('development'),
  test: createKnexConfig('test'),
  production: createKnexConfig('production'),
};

export default config;
