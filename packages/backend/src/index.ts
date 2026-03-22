import 'dotenv/config';
import { createServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  try {
    const { httpServer, io } = await createServer();

    httpServer.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      // eslint-disable-next-line no-console
      console.log(`📡 Socket.IO ready for connections`);
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      // eslint-disable-next-line no-console
      console.log('\n🛑 Shutting down gracefully...');

      io.close();
      httpServer.close(() => {
        // eslint-disable-next-line no-console
        console.log('✅ Server closed');
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.error('⚠️ Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
