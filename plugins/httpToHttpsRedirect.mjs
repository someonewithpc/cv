import http from 'node:http';
import net from 'node:net';

/**
 * Vite HTTPS is TLS-only on its port, so plain `http://` gets an empty reply.
 * Listen publicly on that port, proxy TLS to Vite on loopback, 308 elsewhere.
 *
 * @returns {import('vite').Plugin}
 */
export const httpToHttpsRedirect = () => ({
  name: 'http-to-https-redirect',
  apply: 'serve',
  configureServer: (server) => {
    const httpsServer = server.httpServer;
    if (!httpsServer) return;

    /** @type {net.Server | undefined} */
    let demux;
    const originalListen = httpsServer.listen.bind(httpsServer);
    const originalAddress = httpsServer.address.bind(httpsServer);
    const originalClose = httpsServer.close.bind(httpsServer);

    const redirectServer = http.createServer((req, res) => {
      const hostname = (req.headers.host ?? 'localhost').replace(/:\d+$/, '');
      const address = demux?.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      const portSuffix = port && port !== 443 ? `:${port}` : '';
      res.writeHead(308, {
        Location: `https://${hostname}${portSuffix}${req.url ?? '/'}`,
        'Content-Length': '0',
      });
      res.end();
    });

    const parseListenArgs = (args) => {
      if (typeof args[0] === 'object' && args[0] !== null) {
        return {
          port: args[0].port ?? 0,
          host: args[0].host,
          callback: typeof args[1] === 'function' ? args[1] : undefined,
        };
      }

      const rest = [...args];
      const callback = typeof rest.at(-1) === 'function' ? rest.pop() : undefined;
      const port = typeof rest[0] === 'number' || typeof rest[0] === 'string' ? rest.shift() : 0;
      const host = typeof rest[0] === 'string' ? rest.shift() : undefined;
      return { port, host, callback };
    };

    httpsServer.listen = (...args) => {
      const { port, host, callback } = parseListenArgs(args);

      originalListen({ port: 0, host: '127.0.0.1' }, () => {
        const internal = originalAddress();
        const internalPort = typeof internal === 'object' && internal ? internal.port : null;
        if (!internalPort) return;

        demux = net.createServer((socket) => {
          socket.once('data', (chunk) => {
            if (chunk[0] === 0x16) {
              const upstream = net.connect(internalPort, '127.0.0.1', () => {
                upstream.write(chunk);
                socket.pipe(upstream);
                upstream.pipe(socket);
              });
              upstream.on('error', () => socket.destroy());
              socket.on('error', () => upstream.destroy());
              return;
            }

            socket.unshift(chunk);
            redirectServer.emit('connection', socket);
          });
        });

        const onListening = () => {
          httpsServer.address = () => demux?.address() ?? null;
          callback?.();
        };

        if (host !== undefined) demux.listen(port, host, onListening);
        else demux.listen(port, onListening);
      });

      return httpsServer;
    };

    httpsServer.close = (callback) => {
      demux?.close();
      redirectServer.close();
      return originalClose(callback);
    };
  },
});
