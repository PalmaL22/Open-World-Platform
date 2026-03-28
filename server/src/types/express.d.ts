// Add a userId property to the Request object for JWT middlware authentication
export {};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
