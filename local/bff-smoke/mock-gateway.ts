// Stand-in for the OpenWA gateway, just enough for the BFF smoke test:
// /api/health is public, /api/sessions needs X-API-Key == $MOCK_API_KEY (as the real one does).
const key = process.env['MOCK_API_KEY'] ?? '';

Bun.serve({
  port: 2785,
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === '/api/health') return Response.json({ status: 'ok' });
    if (pathname === '/api/sessions') {
      return key !== '' && req.headers.get('x-api-key') === key
        ? Response.json([])
        : Response.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return new Response('not found', { status: 404 });
  },
});
