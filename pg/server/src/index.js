// Entry point: migrate -> seed -> listen.
import { config } from './config.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { startListener } from './events.js';
import { startCleanup } from './cleanup.js';

await migrate();
await seed();
await startListener();
startCleanup();
createApp().listen(config.port, () => console.log(`PlaceMate running on http://localhost:${config.port}`));
