import http from 'node:http';
import net from 'node:net';

/** Same-port HTTP→HTTPS for Vite: TLS is proxied to loopback; plain HTTP 308s. */
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

    httpsServer.listen = (...args) => {
      const callback = typeof args.at(-1) === 'function' ? args.at(-1) : undefined;
      const first = args[0];
      const publicPort = typeof first === 'object' && first !== null ? (first.port ?? 0) : (first ?? 0);
      const publicHost = typeof first === 'object' && first !== null
        ? first.host
        : (typeof args[1] === 'string' ? args[1] : undefined);

      // Vite resolves Local URLs on the httpServer 'listening' event via address().
      // Defer those listeners until the public demux is bound, otherwise they capture
      // the ephemeral loopback TLS port from originalListen({ port: 0 }).
      const pendingListening = httpsServer.listeners('listening').slice();
      httpsServer.removeAllListeners('listening');

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
          for (const listener of pendingListening) {
            httpsServer.on('listening', listener);
            listener.call(httpsServer);
          }
          callback?.();
        };

        if (publicHost !== undefined) demux.listen(publicPort, publicHost, onListening);
        else demux.listen(publicPort, onListening);
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
