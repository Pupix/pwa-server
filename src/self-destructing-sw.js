/* eslint-disable no-restricted-globals */
if (self instanceof ServiceWorkerGlobalScope) {
    self.addEventListener('install', () => self.skipWaiting());

    self.addEventListener('activate', async () => {
        await self.registration.unregister();
    });
}
