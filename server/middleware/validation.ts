import { validationResult, ValidationChain } from "express-validator";
import { Request, Response, NextFunction } from "express";

export const _validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (let validation of validations) {
      const _result = await validation?.run(req);
      if (result?.context.errors?.length) break;
    }

    const _errors = validationResult(req);
    if (errors?.isEmpty()) {
      return next();
    }

    res?.status(400).json({ errors: errors?.array() });
  };
};
