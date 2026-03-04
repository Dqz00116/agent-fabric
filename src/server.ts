import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * 启动服务器
 */
async function start() {
  try {
    const app = await buildApp();

    await app.listen({ port: PORT, host: HOST });

    app.log.info(`Server listening on http://${HOST}:${PORT}`);
    app.log.info(`API documentation available at http://${HOST}:${PORT}/documentation`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

start();
