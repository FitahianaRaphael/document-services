import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const batchSchema = Joi.object({
  userIds: Joi.array()
    .items(Joi.string().trim().min(1))
    .min(1)
    .max(1000)
    .required(),
});

export function validateBatch(req: Request, res: Response, next: NextFunction): void {
  const { error } = batchSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({
      error: 'Validation failed',
      details: error.details.map((d) => d.message),
    });
    return;
  }
  next();
}