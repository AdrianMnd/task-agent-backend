// Variables de entorno minimas para que los modulos se puedan importar en tests
// sin llegar a hacer llamadas de red reales. Los tests mockean pool/fetch/resend
// segun haga falta en cada archivo.
process.env.JWT_SECRET = 'test-secret';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GITHUB_TOKEN = 'test-github-token';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.REMINDER_EMAIL = 'owner@example.com';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
