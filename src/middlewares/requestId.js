import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || uuidv4();
  req.id = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}
