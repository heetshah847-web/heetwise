import { ValidationError } from './errors.js';

// Small, reusable validators. Each throws a ValidationError (-> 400) with a
// clear message, or returns the normalized value. Used across controllers
// instead of ad-hoc inline checks.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireString(value, field, { min = 1, max = 255 } = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new ValidationError(`${field} must be at least ${min} character(s)`);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be at most ${max} character(s)`);
  }
  return trimmed;
}

export function optionalString(value, field, opts = {}) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, field, opts);
}

export function requireInt(value, field, { min, max } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer`);
  }
  if (min !== undefined && value < min) {
    throw new ValidationError(`${field} must be at least ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new ValidationError(`${field} must be at most ${max}`);
  }
  return value;
}

export function requireEmail(value, field = 'email') {
  const str = requireString(value, field);
  if (!EMAIL_REGEX.test(str)) {
    throw new ValidationError(`${field} must be a valid email address`);
  }
  return str.toLowerCase();
}

export function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new ValidationError(`${field} must be a valid id`);
  }
  return value;
}

export function requireArray(value, field, { min = 0 } = {}) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`);
  }
  if (value.length < min) {
    throw new ValidationError(`${field} must have at least ${min} item(s)`);
  }
  return value;
}

export function requireEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}
