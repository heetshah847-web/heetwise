import { existsSync } from 'node:fs';
import dotenv from 'dotenv';

// Load test env BEFORE any module reads process.env. Prefer .env.test (a
// dedicated, disposable test database) and fall back to .env. dotenv does not
// override already-set vars, so config/env.js will see these values.
dotenv.config({ path: existsSync('.env.test') ? '.env.test' : '.env' });
