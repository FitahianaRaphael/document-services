import CircuitBreaker from 'opossum';
import { logger } from './logger';

const defaultOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

export function createCircuitBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  fn: T,
  options: Partial<typeof defaultOptions> = {}
): CircuitBreaker {
  const breaker = new CircuitBreaker(fn, { ...defaultOptions, ...options });

  breaker.on('open',    () => logger.warn({ msg: 'Circuit OPEN',    circuit: name }));
  breaker.on('halfOpen',() => logger.info({ msg: 'Circuit HALF-OPEN', circuit: name }));
  breaker.on('close',   () => logger.info({ msg: 'Circuit CLOSED',  circuit: name }));
  breaker.fallback(() => {
    logger.error({ msg: 'Circuit breaker fallback triggered', circuit: name });
    return null;
  });

  return breaker;
}