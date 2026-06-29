import { body } from 'express-validator';

// Reusable express-validator chains. These are an ADDITIVE first layer of
// input sanitization/validation that runs before the existing controller logic
// (which keeps its own checks as defense-in-depth).
//
// NOTE: fields that are currently optional in the app (register `name`,
// expense `currency`) are validated with `.optional()` so existing behavior —
// registering without a name, or omitting currency to default to USD — is
// preserved. Validators only trim/escape and bound the input.

export const registerValidators = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('name')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
];

export const loginValidators = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

export const groupCreateValidators = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Group name must be between 2 and 100 characters'),
];

export const expenseCreateValidators = [
  body('description')
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Description must be between 1 and 200 characters'),
  body('amount')
    .isFloat({ gt: 0, lt: 1000000 })
    .withMessage('Amount must be a positive number less than 1,000,000'),
  body('currency')
    .optional()
    .isString()
    .matches(/^[A-Z]{3}$/)
    .withMessage('Currency must be 3 uppercase letters'),
  body('splitType')
    .isIn(['EQUAL', 'EXACT', 'PERCENTAGE', 'WEIGHT'])
    .withMessage('splitType must be EQUAL, EXACT, PERCENTAGE, or WEIGHT'),
  body('members')
    .isArray({ min: 1 })
    .withMessage('members must be a non-empty array'),
];
