import { briefMarkdown } from '../tasks/hackathon/environment.js';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Activity } from './types.js';
import { createExperiment, taskInfo, describeSetup } from './experiments.js';
import { createTrace, listTraces, readTrajectory } from './traces.js';

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
      if (req.method === 'GET' && /^\/runs\/[^/]+\/brief\.md$/.test(url.pathname)) {
        const trajectory = readTrajectory(url.pathname.split('/')[2]);
        const event = trajectory.events.find(e => e.type === 'hackathon.brief');
        if (!event) { res.writeHead(404).end('No research brief saved for this run'); return; }
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename=research-brief.md' }).end(briefMarkdown(event.data as Parameters<typeof briefMarkdown>[0])); return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/runs/')) {
        const trajectory = readTrajectory(url.pathname.slice(6), url.searchParams.get('agent') ?? undefined);
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(trajectory)); return;
      }
      if (req.method === 'GET' && url.pathname === '/setup') {
        const setup = describeSetup({ task: url.searchParams.get('task') ?? undefined, condition: url.searchParams.get('condition') ?? undefined, count: url.searchParams.has('count') ? Number(url.searchParams.get('count')) : undefined, mode: url.searchParams.get('mode') ?? 'demo', models: url.searchParams.has('models') ? url.searchParams.get('models')!.split(',') : undefined, rounds: url.searchParams.has('rounds') ? Number(url.searchParams.get('rounds')) : undefined });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(setup)); return;
      }
      if (req.method === 'GET' && url.pathname === '/task') {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(taskInfo(url.searchParams.get('id') ?? 'hackathon'))); return;
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
        if (active) { res.writeHead(409).end('A run is already active'); return; }
        const config = JSON.parse(body);
        const experiment = createExperiment(config, emit);
        const controller = new AbortController();
        active = { id: randomUUID(), controller };
        trace = createTrace(active.id, experiment.config, experiment.agents, experiment.setup);
        emit({ type: 'run.started', data: { ...experiment.config, agents: experiment.agents } });
        emit({ type: 'operator.setup', data: experiment.setup });
        res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: active.id }));
        void (async () => {
          try {
            const result = await experiment.run(controller.signal);
            await mkdir('results', { recursive: true });
            await writeFile(`results/run-${active!.id}.json`, JSON.stringify({ ...experiment.config, ...result }, null, 2), { flag: 'wx' });
            if ('brief' in result) await writeFile(`results/run-${active!.id}.md`, briefMarkdown(result), { flag: 'wx' });
            emit({ type: 'run.completed', data: result });
          } catch (error) {
            emit({ type: controller.signal.aborted ? 'run.stopped' : 'run.failed', data: { message: controller.signal.aborted ? 'Stopped by user' : error instanceof Error ? error.message : 'Run failed' } });
          } finally { active = undefined; trace = undefined; }
        })();
        return;
      }
      const files: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/conversation.js': ['conversation.js', 'text/javascript'], '/pricing.js': ['pricing.js', 'text/javascript'], '/research.js': ['research.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
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
