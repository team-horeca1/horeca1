function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string = ''): string {
  return process.env[name] || defaultValue;
}

// Lazy getters — Docker `next build` has no secrets. Eager requiredEnv() at
// import time crashed CI as soon as otpVerification pulled this module in.
export const env = {
  get DATABASE_URL(): string {
    return requiredEnv('DATABASE_URL');
  },
  get AUTH_SECRET(): string {
    return requiredEnv('AUTH_SECRET');
  },
  get NEXTAUTH_URL(): string {
    return optionalEnv('NEXTAUTH_URL', 'http://localhost:3000');
  },
  get GOOGLE_MAPS_API_KEY(): string {
    return optionalEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
  },
  get NODE_ENV(): string {
    return optionalEnv('NODE_ENV', 'development');
  },
};
