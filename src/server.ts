import { createServer, type ServerResponse } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { runEnvironment, type Activity, type Agent } from './environment.js';
import { createTrace, listTraces, readTrajectory } from './traces.js';
import { adaptionAgent } from './providers.js';
import { defaults, taskId, demoDecision } from '../tasks/shared-resource/definition.js';

export function createDashboard() {
  const clients = new Set<ServerResponse>();
  const events: object[] = [];
  let active: { id: string; controller: AbortController } | undefined;
  let sequence = 0;
  let trace: ReturnType<typeof createTrace> | undefined;
  function emit(event: Activity) {
    const stored = trace?.append(event);
    const record = { ...stored, ...event, id: ++sequence, time: stored?.time ?? new Date().toISOString(), run: active?.id };
    events.push(record);
    if (events.length > 2000) events.shift();
    for (const client of clients) {
      if (!client.write(`id: ${sequence}\ndata: ${JSON.stringify(record)}\n\n`)) { client.destroy(); clients.delete(client); }
    }
  }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      // Bind to loopback and reject cross-origin commands and DNS-rebinding hosts.
      const host = req.headers.host?.split(':')[0];
      if (!['localhost', '127.0.0.1'].includes(host ?? '')) { res.writeHead(403).end(); return; }
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return; }
      if (req.method === 'GET' && url.pathname === '/runs') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(listTraces())); return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/runs/')) {
        const trajectory = readTrajectory(url.pathname.slice(6), url.searchParams.get('agent') ?? undefined);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(trajectory)); return;
      }
      if (req.method === 'GET' && url.pathname === '/task') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: taskId, defaults })); return;
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        const last = Number(req.headers['last-event-id'] ?? 0);
        for (const event of events) if ((event as { id: number }).id > last) res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.write(`event: status\ndata: ${JSON.stringify({ active: !!active, configured: !!process.env.ADAPTION_API_KEY })}\n\n`);
        clients.add(res);
        const timer = setInterval(() => res.write(': heartbeat\n\n'), 15000);
        req.on('close', () => { clearInterval(timer); clients.delete(res); });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/stop') {
        active?.controller.abort(); res.writeHead(202).end('{}'); return;
      }
      if (req.method === 'POST' && url.pathname === '/run') {
        if (active) { res.writeHead(409).end('A run is already active'); return; }
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413).end(); return; } }
        const config = JSON.parse(body);
        const { mode = 'demo', count = defaults.count, rounds = defaults.rounds, tokens = defaults.tokens, maxTake = defaults.maxTake } = config;
        if (!['demo', 'adaption'].includes(mode) || !Number.isInteger(count) || count < 2 || count > 8 ||
          ![rounds, tokens, maxTake].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 1000)) {
          res.writeHead(400).end('Invalid run settings'); return;
        }
        const controller = new AbortController();
        const agents: Agent[] = Array.from({ length: count }, (_, i) => {
          const name = `Agent ${String(i + 1).padStart(2, '0')}`;
          if (mode === 'adaption') return adaptionAgent(name, emit);
          return { name, async decide(o, signal) {
            emit({ type: 'sdk.turn.started', agent: name, data: { type: 'turn.started' } });
            await delay(350, undefined, { signal });
            const text = JSON.stringify(demoDecision(o, i));
            for (let end = 18; end < text.length + 18; end += 18) {
              await delay(100, undefined, { signal });
              emit({ type: 'sdk.item.updated', agent: name, data: { type: 'item.updated', item: { id: `${o.round}-${i}`, type: 'agent_message', text: text.slice(0, end) } } });
            }
            emit({ type: 'sdk.item.completed', agent: name, data: { type: 'item.completed', item: { id: `${o.round}-${i}`, type: 'agent_message', text } } });
            emit({ type: 'sdk.turn.completed', agent: name, data: { type: 'turn.completed', usage: { input_tokens: 120 + o.history.length * 20, output_tokens: 36, cached_input_tokens: 0 } } });
            return JSON.parse(text);
          } };
        });
        active = { id: randomUUID(), controller };
        trace = createTrace(active.id, { task: taskId, mode, count, rounds, tokens, maxTake }, agents.map(a => a.name));
        emit({ type: 'run.started', data: { task: taskId, mode, agents: agents.map(a => a.name), rounds, tokens, maxTake } });
        res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: active.id }));
        void (async () => {
          try {
            const result = await runEnvironment(agents, rounds, tokens, maxTake, emit, controller.signal);
            await mkdir('results', { recursive: true });
            await writeFile(`results/run-${active!.id}.json`, JSON.stringify({ task: taskId, mode, ...result }, null, 2), { flag: 'wx' });
            emit({ type: 'run.completed', data: result });
          } catch (error) {
            emit({ type: controller.signal.aborted ? 'run.stopped' : 'run.failed', data: { message: controller.signal.aborted ? 'Stopped by user' : error instanceof Error ? error.message : 'Run failed' } });
          } finally { active = undefined; trace = undefined; }
        })();
        return;
      }
      const files: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      const file = files[url.pathname];
      if (req.method !== 'GET' || !file) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
      res.end(await readFile(new URL(`../web/${file[0]}`, import.meta.url)));
    } catch (error) {
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(error instanceof Error ? error.message : 'Request failed');
    }
  });
  server.on('close', () => { active?.controller.abort(); for (const c of clients) c.end(); });
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3333);
  createDashboard().listen(port, '127.0.0.1', () => console.log(`Agent observatory: http://127.0.0.1:${port}`));
}
